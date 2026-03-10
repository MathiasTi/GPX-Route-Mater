
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, useMapEvents, useMap, Marker, Popup, Rectangle } from 'react-leaflet';
import L from 'leaflet';
import { GPXTrack, MapLayer, MAP_LAYERS } from '../types';
import { calculateDistance } from '../utils/gpxUtils';

// Fix for default marker icons in Leaflet + React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapProps {
  tracks: GPXTrack[];
  activeLayer: MapLayer;
  markedTrackId: string | null;
  onMarkTrack: (id: string) => void;
  hoveredPoint?: {lat: number, lng: number} | null;
  onHoverPoint?: (point: {lat: number, lng: number} | null) => void;
  selectionBounds: {minLat: number, maxLat: number, minLng: number, maxLng: number} | null;
  onSelection: (bounds: {minLat: number, maxLat: number, minLng: number, maxLng: number} | null) => void;
  mapView: {lat: number, lng: number, zoom: number, pitch?: number, bearing?: number};
  onMapViewChange: (view: {lat: number, lng: number, zoom: number, pitch: number, bearing: number}) => void;
}

const ZoomToTracks = ({ tracks }: { tracks: GPXTrack[] }) => {
  const map = useMap();
  const prevTracksLength = React.useRef(tracks.length);

  useEffect(() => {
    const visibleTracks = tracks.filter(t => t.visible);
    if (visibleTracks.length > prevTracksLength.current && visibleTracks.length > 0) {
      const bounds = L.latLngBounds(visibleTracks[0].points.map(p => [p.lat, p.lng]));
      visibleTracks.forEach(t => {
        t.points.forEach(p => bounds.extend([p.lat, p.lng]));
      });
      map.fitBounds(bounds, { padding: [50, 50] });
    }
    prevTracksLength.current = tracks.length;
  }, [tracks, map]);
  return null;
};

const ZoomToSelection = ({ bounds }: { bounds: {minLat: number, maxLat: number, minLng: number, maxLng: number} | null }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds([
        [bounds.minLat, bounds.minLng],
        [bounds.maxLat, bounds.maxLng]
      ], { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
};

const MapResizer = ({ markedTrackId, tracksLength }: { markedTrackId: string | null, tracksLength: number }) => {
  const map = useMap();
  useEffect(() => {
    // Wait for CSS transitions (like the elevation profile opening) to finish
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 300);
    return () => clearTimeout(timeout);
  }, [markedTrackId, tracksLength, map]);
  return null;
};

const SyncView = ({ mapView, onMapViewChange }: { mapView: any, onMapViewChange: any }) => {
  const map = useMap();
  
  // Sync map instance to mapView prop (only when switching or external change)
  useEffect(() => {
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    
    if (Math.abs(currentCenter.lat - mapView.lat) > 0.0001 || 
        Math.abs(currentCenter.lng - mapView.lng) > 0.0001 || 
        Math.abs(currentZoom - mapView.zoom) > 0.1) {
      map.setView([mapView.lat, mapView.lng], mapView.zoom, { animate: false });
    }
  }, [mapView.lat, mapView.lng, mapView.zoom, map]);

  useMapEvents({
    moveend() {
      const center = map.getCenter();
      const zoom = map.getZoom();
      onMapViewChange({
        lat: center.lat,
        lng: center.lng,
        zoom: zoom,
        pitch: 0,
        bearing: 0
      });
    }
  });

  return null;
};

const SelectionTool = ({ active, onSelection, currentBounds }: { active: boolean, onSelection: (bounds: {minLat: number, maxLat: number, minLng: number, maxLng: number} | null) => void, currentBounds: {minLat: number, maxLat: number, minLng: number, maxLng: number} | null }) => {
  const map = useMap();
  const [startPoint, setStartPoint] = useState<L.LatLng | null>(null);
  const [currentPoint, setCurrentPoint] = useState<L.LatLng | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);

  useEffect(() => {
    if (!active) {
      setStartPoint(null);
      setCurrentPoint(null);
      setSelectionMode(false);
      map.dragging.enable();
    }
  }, [active, map]);

  useEffect(() => {
    if (selectionMode) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  }, [selectionMode, map]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (active && e.key === 'Alt') {
        map.dragging.disable();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (active && e.key === 'Alt') {
        if (!selectionMode) {
          map.dragging.enable();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [active, map, selectionMode]);

  useMapEvents({
    mousedown(e) {
      if (!active) return;
      const isAlt = e.originalEvent.altKey;
      if (!isAlt && !selectionMode) return;
      
      map.dragging.disable();
      setStartPoint(e.latlng);
      setCurrentPoint(e.latlng);
      onSelection(null);
    },
    mousemove(e) {
      if (!active || !startPoint) return;
      setCurrentPoint(e.latlng);
    },
    mouseup(e) {
      if (!active || !startPoint) return;
      const bounds = L.latLngBounds(startPoint, currentPoint!);
      onSelection({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast()
      });
      setStartPoint(null);
      setCurrentPoint(null);
      
      if (!e.originalEvent.altKey && !selectionMode) {
        map.dragging.enable();
      }
    }
  });

  const renderBounds = startPoint && currentPoint 
    ? L.latLngBounds(startPoint, currentPoint) 
    : currentBounds 
      ? L.latLngBounds([currentBounds.minLat, currentBounds.minLng], [currentBounds.maxLat, currentBounds.maxLng]) 
      : null;

  return (
    <>
      {renderBounds && (
        <Rectangle bounds={renderBounds} pathOptions={{ color: '#4f46e5', weight: 2, fillOpacity: 0.2, dashArray: '5, 5' }} />
      )}
      <div className="leaflet-top leaflet-left mt-20 ml-3 pointer-events-auto">
        <div className="leaflet-bar leaflet-control">
          <button
            className={`w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-50 transition-colors ${selectionMode ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`}
            onClick={(e) => {
              L.DomEvent.stopPropagation(e);
              setSelectionMode(!selectionMode);
            }}
            title={selectionMode ? "Auswahlmodus beenden" : "Auswahlmodus aktivieren (für Mobile/iPad)"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
};

const Map: React.FC<MapProps> = ({ tracks, activeLayer, markedTrackId, onMarkTrack, hoveredPoint, onHoverPoint, selectionBounds, onSelection, mapView, onMapViewChange }) => {
  const layer = MAP_LAYERS[activeLayer];

  return (
    <div className="w-full h-full relative">
      <MapContainer 
        center={[mapView.lat, mapView.lng]} 
        zoom={mapView.zoom} 
        scrollWheelZoom={true}
        boxZoom={false}
        className="z-0"
      >
        <TileLayer
          attribution={layer.attribution}
          url={layer.url}
          maxZoom={layer.maxZoom || 19}
        />
        
        {tracks.filter(t => t.visible).map(track => {
          const isMarked = track.id === markedTrackId;
          const positions = track.points.map(p => [p.lat, p.lng] as [number, number]);
          
          let selectedPolylines: [number, number][][] = [];
          if (isMarked && selectionBounds) {
            let currentLine: [number, number][] = [];
            track.points.forEach(p => {
              const inBounds = p.lat >= selectionBounds.minLat && p.lat <= selectionBounds.maxLat &&
                               p.lng >= selectionBounds.minLng && p.lng <= selectionBounds.maxLng;
              if (inBounds) {
                currentLine.push([p.lat, p.lng]);
              } else {
                if (currentLine.length > 0) {
                  selectedPolylines.push(currentLine);
                  currentLine = [];
                }
              }
            });
            if (currentLine.length > 0) {
              selectedPolylines.push(currentLine);
            }
          }

          return (
            <React.Fragment key={track.id}>
              {/* Invisible thick line for easier hovering/clicking */}
              <Polyline 
                positions={positions}
                color="#000000"
                opacity={0}
                weight={30}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    onMarkTrack(track.id);
                  },
                  mousemove: (e) => {
                    if (onHoverPoint) onHoverPoint({lat: e.latlng.lat, lng: e.latlng.lng});
                  },
                  mouseout: () => {
                    if (onHoverPoint) onHoverPoint(null);
                  }
                }}
              />
              {/* Visible line */}
              <Polyline 
                positions={positions}
                color={track.color}
                weight={isMarked ? 8 : 4}
                opacity={isMarked ? 1.0 : 0.6}
                interactive={false}
              >
                <Popup>
                    <div className="font-bold">{track.name}</div>
                    <div>Distanz: {track.distance.toFixed(2)} km</div>
                    <div>Punkte: {track.points.length}</div>
                </Popup>
              </Polyline>

              {/* Selection Highlights */}
              {selectedPolylines.map((pts, i) => (
                <Polyline
                  key={`sel-${i}`}
                  positions={pts}
                  color="#4f46e5"
                  weight={12}
                  opacity={0.9}
                  interactive={false}
                />
              ))}
            </React.Fragment>
          );
        })}

        <ZoomToTracks tracks={tracks} />
        <ZoomToSelection bounds={selectionBounds} />
        <MapResizer markedTrackId={markedTrackId} tracksLength={tracks.length} />
        <SyncView mapView={mapView} onMapViewChange={onMapViewChange} />
        <SelectionTool active={true} onSelection={onSelection} currentBounds={selectionBounds} />
        
        {hoveredPoint && (
          <Marker 
            position={[hoveredPoint.lat, hoveredPoint.lng]} 
            interactive={false}
            icon={new L.DivIcon({
              className: 'custom-div-icon',
              html: `<div class="bg-emerald-500 w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            })} 
          />
        )}
      </MapContainer>
    </div>
  );
};

export default Map;
