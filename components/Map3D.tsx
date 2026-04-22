import React, { useMemo, useEffect, useRef, useState } from 'react';
import Map, { Source, Layer, MapRef, NavigationControl, Marker, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXTrack, MapLayer, MAP_LAYERS, GPXPoint } from '../types';

interface Map3DProps {
  tracks: GPXTrack[];
  activeLayer: MapLayer;
  markedTrackId: string | null;
  onMarkTrack: (id: string) => void;
  hoveredPoint?: GPXPoint | null;
  onHoverPoint?: (point: GPXPoint | null) => void;
  selectionBounds?: {minLat: number, maxLat: number, minLng: number, maxLng: number} | null;
  onSelection?: (bounds: {minLat: number, maxLat: number, minLng: number, maxLng: number} | null) => void;
  mapView: {lat: number, lng: number, zoom: number, pitch: number, bearing: number};
  onMapViewChange: (view: {lat: number, lng: number, zoom: number, pitch: number, bearing: number}) => void;
  estimatedSpeed?: number;
}

const Map3D: React.FC<Map3DProps> = ({ tracks, activeLayer, markedTrackId, onMarkTrack, hoveredPoint, onHoverPoint, selectionBounds, onSelection, mapView, onMapViewChange, estimatedSpeed = 15 }) => {
  const mapRef = useRef<MapRef>(null);
  const layerConfig = MAP_LAYERS[activeLayer];
  const [pitch, setPitch] = useState(mapView.pitch);
  const [bearing, setBearing] = useState(mapView.bearing);

  const mapStyle = useMemo(() => {
    const tileUrls = ['a', 'b', 'c'].map(s => layerConfig.url.replace('{s}', s));

    return {
      version: 8 as const,
      sources: {
        'basemap': {
          type: 'raster' as const,
          tiles: tileUrls,
          tileSize: 256,
          attribution: layerConfig.attribution,
          maxzoom: layerConfig.maxZoom || 19
        },
        'terrain': {
          type: 'raster-dem' as const,
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          encoding: 'terrarium' as const,
          tileSize: 256,
          maxzoom: 14
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: {
            'background-color': '#87CEEB'
          }
        },
        {
          id: 'basemap-layer',
          type: 'raster' as const,
          source: 'basemap',
          minzoom: 0
        }
      ],
      terrain: {
        source: 'terrain',
        exaggeration: 1.5
      }
    };
  }, [layerConfig.url, layerConfig.attribution]);

  const visibleTracks = useMemo(() => {
    return tracks.filter(t => t.visible && t.points.length >= 2);
  }, [tracks]);

  const fitToTracks = () => {
    if (visibleTracks.length > 0 && mapRef.current) {
      const map = mapRef.current.getMap();
      
      // Calculate bounds
      let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
      visibleTracks.forEach(t => {
        t.points.forEach(p => {
          if (p.lng < minLng) minLng = p.lng;
          if (p.lng > maxLng) maxLng = p.lng;
          if (p.lat < minLat) minLat = p.lat;
          if (p.lat > maxLat) maxLat = p.lat;
        });
      });

      if (minLng <= maxLng && minLat <= maxLat) {
        try {
          map.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            { padding: 50, duration: 1000 }
          );
        } catch (e) {
          console.error("Error fitting bounds:", e);
        }
      }
    }
  };

  const prevTracksLength = useRef(visibleTracks.length);
  useEffect(() => {
    if (visibleTracks.length > prevTracksLength.current) {
      fitToTracks();
    }
    prevTracksLength.current = visibleTracks.length;
  }, [visibleTracks]);

  useEffect(() => {
    if (selectionBounds && mapRef.current) {
      const map = mapRef.current.getMap();
      try {
        map.fitBounds(
          [[selectionBounds.minLng, selectionBounds.minLat], [selectionBounds.maxLng, selectionBounds.maxLat]],
          { padding: 50, duration: 1000 }
        );
      } catch (e) {
        console.error("Error fitting bounds to selection:", e);
      }
    }
  }, [selectionBounds]);

  useEffect(() => {
    // Wait for CSS transitions (like the elevation profile opening) to finish
    const timeout = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.getMap().resize();
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [tracks.length, markedTrackId]);

  const trackSources = useMemo(() => {
    return visibleTracks.map(track => {
      const geojson = {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: { id: track.id, name: track.name },
            geometry: {
              type: 'LineString' as const,
              coordinates: track.points.map(p => [p.lng, p.lat])
            }
          }
        ]
      };

      let selectedFeatures: any[] = [];
      if (track.id === markedTrackId && selectionBounds) {
        let currentLine: number[][] = [];
        track.points.forEach(p => {
          const inBounds = p.lat >= selectionBounds.minLat && p.lat <= selectionBounds.maxLat &&
                           p.lng >= selectionBounds.minLng && p.lng <= selectionBounds.maxLng;
          if (inBounds) {
            currentLine.push([p.lng, p.lat]);
          } else {
            if (currentLine.length > 0) {
              selectedFeatures.push({
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: currentLine
                }
              });
              currentLine = [];
            }
          }
        });
        if (currentLine.length > 0) {
          selectedFeatures.push({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: currentLine
            }
          });
        }
      }

      const selectedGeojson = selectedFeatures.length > 0 ? {
        type: 'FeatureCollection' as const,
        features: selectedFeatures
      } : null;

      return { track, geojson, selectedGeojson };
    });
  }, [visibleTracks, markedTrackId, selectionBounds]);

  return (
    <div className="w-full h-full relative bg-slate-200">
      <Map
        ref={mapRef}
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        initialViewState={{
          longitude: mapView.lng,
          latitude: mapView.lat,
          zoom: mapView.zoom,
          pitch: mapView.pitch,
          bearing: mapView.bearing
        }}
        maxPitch={75}
        mapStyle={mapStyle}
        onMove={(e) => {
          setPitch(e.viewState.pitch);
          setBearing(e.viewState.bearing);
        }}
        onMoveEnd={(e) => {
          onMapViewChange({
            lat: e.viewState.latitude,
            lng: e.viewState.longitude,
            zoom: e.viewState.zoom,
            pitch: e.viewState.pitch,
            bearing: e.viewState.bearing
          });
        }}
        interactiveLayerIds={visibleTracks.map(t => `track-${t.id}-click`)}
        onClick={(e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            const trackId = feature.properties?.id;
            if (trackId) {
              onMarkTrack(trackId);
            }
          }
        }}
      >
        <NavigationControl position="top-right" visualizePitch={true} />
        {trackSources.map(({ track, geojson, selectedGeojson }) => {
          const isMarked = track.id === markedTrackId;
          
          const pauses = [];
          for (let i = 1; i < track.points.length; i++) {
            const p = track.points[i];
            const prevP = track.points[i - 1];
            if (p.time && prevP.time) {
              const diffMs = p.time.getTime() - prevP.time.getTime();
              if (diffMs > 5 * 60 * 1000) {
                pauses.push({
                  lat: prevP.lat,
                  lng: prevP.lng,
                  durationMins: Math.floor(diffMs / 60000),
                  startTime: prevP.time,
                  endTime: p.time,
                  idx: i
                });
              }
            }
          }

          return (
            <React.Fragment key={track.id}>
              <Source id={`track-${track.id}`} type="geojson" data={geojson}>
                {/* Invisible wider line for easier clicking */}
                <Layer
                  id={`track-${track.id}-click`}
                  type="line"
                  paint={{
                    'line-color': 'transparent',
                    'line-width': 30
                  }}
                />
                
                {/* 3D Extrusion Simulation (Shadow/Wall) */}
                {[...Array(6)].map((_, i) => (
                  <Layer
                    key={`track-${track.id}-extrude-${i}`}
                    {...({
                      id: `track-${track.id}-extrude-${i}`,
                      source: `track-${track.id}`,
                      type: "line",
                      paint: {
                        'line-color': track.color || '#ff0000',
                        'line-width': isMarked ? 12 : 8,
                        'line-opacity': 0.15,
                        'line-translate': [0, -i * 2],
                        'line-translate-anchor': 'viewport'
                      },
                      layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                      }
                    } as any)}
                  />
                ))}

                {/* White casing for contrast (Top Layer) */}
                <Layer
                  id={`track-${track.id}-casing`}
                  type="line"
                  paint={{
                    'line-color': '#ffffff',
                    'line-width': isMarked ? 14 : 10,
                    'line-opacity': isMarked ? 0.9 : 0.7,
                    'line-translate': [0, -12],
                    'line-translate-anchor': 'viewport'
                  }}
                  layout={{
                    'line-join': 'round',
                    'line-cap': 'round'
                  }}
                />
                {/* Visible colored line (Top Layer) */}
                <Layer
                  id={`track-${track.id}-line`}
                  type="line"
                  paint={{
                    'line-color': track.color || '#ff0000',
                    'line-width': isMarked ? 8 : 5,
                    'line-opacity': 1.0,
                    'line-translate': [0, -12],
                    'line-translate-anchor': 'viewport'
                  }}
                  layout={{
                    'line-join': 'round',
                    'line-cap': 'round'
                  }}
                />
              </Source>

              {selectedGeojson && (
                <Source id={`track-${track.id}-selected`} type="geojson" data={selectedGeojson}>
                  {/* 3D Extrusion Simulation for Selection */}
                  {[...Array(6)].map((_, i) => (
                    <Layer
                      key={`track-${track.id}-sel-extrude-${i}`}
                      {...({
                        id: `track-${track.id}-sel-extrude-${i}`,
                        source: `track-${track.id}-selected`,
                        type: "line",
                        paint: {
                          'line-color': '#4f46e5',
                          'line-width': 16,
                          'line-opacity': 0.3,
                          'line-translate': [0, -i * 2],
                          'line-translate-anchor': 'viewport'
                        },
                        layout: {
                          'line-join': 'round',
                          'line-cap': 'round'
                        }
                      } as any)}
                    />
                  ))}
                  
                  {/* White casing for selection */}
                  <Layer
                    id={`track-${track.id}-sel-casing`}
                    type="line"
                    paint={{
                      'line-color': '#ffffff',
                      'line-width': 18,
                      'line-opacity': 1.0,
                      'line-translate': [0, -12],
                      'line-translate-anchor': 'viewport'
                    }}
                    layout={{
                      'line-join': 'round',
                      'line-cap': 'round'
                    }}
                  />
                  
                  {/* Visible colored line for selection */}
                  <Layer
                    id={`track-${track.id}-sel-line`}
                    type="line"
                    paint={{
                      'line-color': '#4f46e5',
                      'line-width': 12,
                      'line-opacity': 1.0,
                      'line-translate': [0, -12],
                      'line-translate-anchor': 'viewport'
                    }}
                    layout={{
                      'line-join': 'round',
                      'line-cap': 'round'
                    }}
                  />
                </Source>
              )}

              {/* Pauses > 5 minutes */}
              {pauses.map(pause => (
                <Marker
                  key={`pause-${track.id}-${pause.idx}`}
                  longitude={pause.lng}
                  latitude={pause.lat}
                  anchor="center"
                >
                  <div className="relative group cursor-pointer">
                    <div className="bg-amber-500 w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>
                    </div>
                    
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max bg-white p-2 rounded shadow-lg border border-slate-200 text-xs z-50">
                      <div className="font-bold text-amber-600 mb-1">Pause</div>
                      <div>Dauer: {pause.durationMins} Minuten</div>
                      <div>Start: {pause.startTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
                      <div>Ende: {pause.endTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-slate-200 rotate-45"></div>
                    </div>
                  </div>
                </Marker>
              ))}
            </React.Fragment>
          );
        })}

        {hoveredPoint && (
          <Source id="hovered-point" type="geojson" data={{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [hoveredPoint.lng, hoveredPoint.lat] },
            properties: {}
          }}>
            <Layer
              id="hovered-point-layer"
              type="circle"
              paint={{
                'circle-radius': 8,
                'circle-color': '#10b981',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff',
                'circle-translate': [0, -12],
                'circle-translate-anchor': 'viewport'
              }}
            />
          </Source>
        )}
      </Map>

      <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-lg z-10 w-64 border border-slate-200">
        <div className="mb-4">
          <label className="flex justify-between text-xs font-bold text-slate-600 mb-2">
            <span>Neigung (Pitch)</span>
            <span className="font-mono text-blue-600">{Math.round(pitch)}°</span>
          </label>
          <input 
            type="range" 
            min="0" 
            max="75" 
            value={pitch} 
            onChange={(e) => {
              const p = Number(e.target.value);
              setPitch(p);
              mapRef.current?.getMap().setPitch(p);
            }}
            className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-bold text-slate-600">
              Drehung (Bearing)
            </label>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  setBearing(0);
                  mapRef.current?.getMap().easeTo({ bearing: 0, duration: 500 });
                }}
                className="text-[9px] bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded font-bold transition-colors"
                title="Nach Norden ausrichten"
              >
                NORDEN
              </button>
              <span className="font-mono text-blue-600 text-xs font-bold w-8 text-right">{Math.round(bearing)}°</span>
            </div>
          </div>
          <input 
            type="range" 
            min="0" 
            max="360" 
            value={bearing} 
            onChange={(e) => {
              const b = Number(e.target.value);
              setBearing(b);
              mapRef.current?.getMap().setBearing(b);
            }}
            className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

export default Map3D;
