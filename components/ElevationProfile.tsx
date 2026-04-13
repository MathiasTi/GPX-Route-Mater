
import React, { useMemo, useState, useRef } from 'react';
import { GPXTrack } from '../types';
import { calculateDistance } from '../utils/gpxUtils';

interface ElevationProfileProps {
  track: GPXTrack;
  onHoverPoint?: (point: {lat: number, lng: number} | null) => void;
  hoveredPoint?: {lat: number, lng: number} | null;
  selectionBounds?: {minLat: number, maxLat: number, minLng: number, maxLng: number} | null;
  onSelection?: (bounds: {minLat: number, maxLat: number, minLng: number, maxLng: number} | null) => void;
}

interface HoverInfo {
  dist: number;
  ele: number;
  slope: number;
  power?: number;
  x: number;
  y: number;
}

const ElevationProfile: React.FC<ElevationProfileProps> = ({ track, onHoverPoint, hoveredPoint, selectionBounds, onSelection }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [isSmoothed, setIsSmoothed] = useState(false);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragCurrentX, setDragCurrentX] = useState<number | null>(null);
  const [showSelectedSurfaceStats, setShowSelectedSurfaceStats] = useState(true);

  // Reset surface stats visibility when selection changes
  React.useEffect(() => {
    setShowSelectedSurfaceStats(true);
  }, [selectionBounds]);

  const profileData = useMemo(() => {
    if (!track.points || track.points.length === 0) return null;

    let totalDist = 0;
    const rawData: { dist: number; ele: number; lat: number; lng: number; power?: number; time?: Date }[] = [];
    
    const hasElevation = track.points.some(p => p.ele !== undefined);
    if (!hasElevation) return null;

    let lastValidEle = track.points.find(p => p.ele !== undefined)?.ele || 0;

    rawData.push({ 
      dist: 0, 
      ele: track.points[0].ele !== undefined ? track.points[0].ele : lastValidEle, 
      lat: track.points[0].lat, 
      lng: track.points[0].lng,
      power: track.points[0].power,
      time: track.points[0].time
    });

    for (let i = 1; i < track.points.length; i++) {
      const distStep = calculateDistance(track.points[i - 1], track.points[i]);
      totalDist += distStep;
      
      const currentEle = track.points[i].ele;
      const ele = currentEle !== undefined ? currentEle : lastValidEle;
      if (currentEle !== undefined) lastValidEle = currentEle;

      rawData.push({ 
        dist: totalDist, 
        ele, 
        lat: track.points[i].lat, 
        lng: track.points[i].lng,
        power: track.points[i].power,
        time: track.points[i].time
      });
    }

    // Apply smoothing if enabled
    const smoothedData = [...rawData];
    if (isSmoothed) {
      const windowSize = 5; // Moving average window
      for (let i = 0; i < rawData.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - windowSize); j <= Math.min(rawData.length - 1, i + windowSize); j++) {
          sum += rawData[j].ele;
          count++;
        }
        smoothedData[i] = { ...rawData[i], ele: sum / count };
      }
    }

    const data: { dist: number; ele: number; slope: number; lat: number; lng: number; power?: number; time?: Date }[] = [];
    data.push({ ...smoothedData[0], slope: 0 });

    let maxPosSlopeVal = 0;
    let maxPosSlopeIdx = 0;

    for (let i = 1; i < smoothedData.length; i++) {
      const ele = smoothedData[i].ele;
      
      // Windowed slope calculation for display (50m window for better responsiveness)
      let j = i;
      let dSum = 0;
      const windowKm = 0.050; 
      while (j > 0 && dSum < windowKm) {
        dSum += smoothedData[j].dist - smoothedData[j-1].dist;
        j--;
      }
      
      let slope = 0;
      if (dSum >= 0.025) { // At least 25m to calculate a stable slope
        slope = ((ele - smoothedData[j].ele) / (dSum * 1000)) * 100;
      }
      
      data.push({ ...smoothedData[i], slope });
      
      if (slope > maxPosSlopeVal) {
        maxPosSlopeVal = slope;
        maxPosSlopeIdx = i;
      }
    }

    const minEle = Math.min(...data.map(d => d.ele));
    const maxEle = Math.max(...data.map(d => d.ele));
    const distRange = totalDist;
    const eleRange = maxEle - minEle || 1;

    return { data, minEle, maxEle, distRange, eleRange, maxPosSlopeVal, maxPosSlopeIdx };
  }, [track, isSmoothed]);

  const padding = { top: 25, bottom: 25, left: 10, right: 10 };
  const width = 1000;
  const height = 150;

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;
    setDragStartX(svgX);
    setDragCurrentX(svgX);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!profileData || !svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    const svgX = (mouseX / rect.width) * width;
    
    if (dragStartX !== null) {
      setDragCurrentX(svgX);
    }

    const graphLeft = padding.left;
    const graphRight = width - padding.right;
    const clampedX = Math.max(graphLeft, Math.min(graphRight, svgX));
    
    const distPercent = (clampedX - graphLeft) / (graphRight - graphLeft);
    const targetDist = distPercent * profileData.distRange;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < profileData.data.length; i++) {
      const diff = Math.abs(profileData.data[i].dist - targetDist);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    const point = profileData.data[closestIdx];
    const x = (point.dist / profileData.distRange) * (graphRight - graphLeft) + graphLeft;
    const y = height - padding.bottom - ((point.ele - profileData.minEle) / profileData.eleRange) * (height - padding.top - padding.bottom);

    setHoverInfo({
      dist: point.dist,
      ele: point.ele,
      slope: point.slope,
      power: point.power,
      x,
      y
    });
    if (onHoverPoint) {
      onHoverPoint({ lat: point.lat, lng: point.lng });
    }
  };

  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const touch = e.touches[0];
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = touch.clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;
    setDragStartX(svgX);
    setDragCurrentX(svgX);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!profileData || !svgRef.current) return;
    
    // Prevent scrolling while interacting with the profile
    if (e.cancelable) e.preventDefault();

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const touch = e.touches[0];
    const mouseX = touch.clientX - rect.left;
    
    const svgX = (mouseX / rect.width) * width;
    
    if (dragStartX !== null) {
      setDragCurrentX(svgX);
    }

    const graphLeft = padding.left;
    const graphRight = width - padding.right;
    const clampedX = Math.max(graphLeft, Math.min(graphRight, svgX));
    
    const distPercent = (clampedX - graphLeft) / (graphRight - graphLeft);
    const targetDist = distPercent * profileData.distRange;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < profileData.data.length; i++) {
      const diff = Math.abs(profileData.data[i].dist - targetDist);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    const point = profileData.data[closestIdx];
    const x = (point.dist / profileData.distRange) * (graphRight - graphLeft) + graphLeft;
    const y = height - padding.bottom - ((point.ele - profileData.minEle) / profileData.eleRange) * (height - padding.top - padding.bottom);

    setHoverInfo({
      dist: point.dist,
      ele: point.ele,
      slope: point.slope,
      power: point.power,
      x,
      y
    });
    if (onHoverPoint) {
      onHoverPoint({ lat: point.lat, lng: point.lng });
    }
  };

  const handleMouseUp = () => {
    if (dragStartX !== null && dragCurrentX !== null && profileData) {
      const diff = Math.abs(dragStartX - dragCurrentX);
      if (diff > 5) {
        const graphLeft = padding.left;
        const graphRight = width - padding.right;
        
        const x1 = Math.max(graphLeft, Math.min(graphRight, dragStartX));
        const x2 = Math.max(graphLeft, Math.min(graphRight, dragCurrentX));
        
        const dist1 = ((x1 - graphLeft) / (graphRight - graphLeft)) * profileData.distRange;
        const dist2 = ((x2 - graphLeft) / (graphRight - graphLeft)) * profileData.distRange;
        
        const minDist = Math.min(dist1, dist2);
        const maxDist = Math.max(dist1, dist2);
        
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        let hasPoints = false;
        
        for (const p of profileData.data) {
          if (p.dist >= minDist && p.dist <= maxDist) {
            minLat = Math.min(minLat, p.lat);
            maxLat = Math.max(maxLat, p.lat);
            minLng = Math.min(minLng, p.lng);
            maxLng = Math.max(maxLng, p.lng);
            hasPoints = true;
          }
        }
        
        if (hasPoints && onSelection) {
          const latBuffer = (maxLat - minLat) * 0.01 || 0.0001;
          const lngBuffer = (maxLng - minLng) * 0.01 || 0.0001;
          onSelection({
            minLat: minLat - latBuffer, 
            maxLat: maxLat + latBuffer, 
            minLng: minLng - lngBuffer, 
            maxLng: maxLng + lngBuffer
          });
        }
      } else {
        if (onSelection) onSelection(null);
      }
    }
    setDragStartX(null);
    setDragCurrentX(null);
  };

  if (!profileData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <p className="text-sm font-medium">Keine Höhendaten für "{track.name}" verfügbar.</p>
      </div>
    );
  }

  const { data, minEle, maxEle, distRange, eleRange, maxPosSlopeVal, maxPosSlopeIdx } = profileData;
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Calculate selected regions and stats
  const selectedRegions: {startX: number, endX: number}[] = [];
  const selectedPolylines: string[] = [];
  let currentPolyline: string[] = [];
  let currentRegion: {startX: number, endX: number} | null = null;
  let selectedAscent = 0;
  let selectedDescent = 0;
  let selectedDistance = 0;
  let selectedEnergy = 0;
  let selectedTime = 0;
  let selectedSurfaceStats: {type: string, distance: number}[] = [];

  if (selectionBounds) {
    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      const inBounds = p.lat >= selectionBounds.minLat && p.lat <= selectionBounds.maxLat &&
                       p.lng >= selectionBounds.minLng && p.lng <= selectionBounds.maxLng;
      
      const x = (p.dist / distRange) * graphWidth + padding.left;
      const y = height - padding.bottom - ((p.ele - minEle) / eleRange) * graphHeight;

      if (inBounds) {
        currentPolyline.push(`${x},${y}`);
        if (!currentRegion) {
          currentRegion = { startX: x, endX: x };
        } else {
          currentRegion.endX = x;
        }

        if (i > 0) {
          const prevP = data[i-1];
          const prevInBounds = prevP.lat >= selectionBounds.minLat && prevP.lat <= selectionBounds.maxLat &&
                               prevP.lng >= selectionBounds.minLng && prevP.lng <= selectionBounds.maxLng;
          if (prevInBounds) {
            const diff = p.ele - prevP.ele;
            if (diff > 0) selectedAscent += diff;
            else selectedDescent += Math.abs(diff);
            selectedDistance += (p.dist - prevP.dist);

            // Time-weighted power calculation
            if (p.time && prevP.time) {
              const dt = (p.time.getTime() - prevP.time.getTime()) / 1000;
              if (dt > 0 && dt < 300) { // Ignore gaps > 5 mins
                selectedEnergy += (prevP.power ?? 0) * dt;
                selectedTime += dt;
              }
            }
          }
        }
      } else {
        if (currentRegion) {
          selectedRegions.push(currentRegion);
          currentRegion = null;
        }
        if (currentPolyline.length > 0) {
          selectedPolylines.push(currentPolyline.join(' '));
          currentPolyline = [];
        }
      }
    }
    if (currentRegion) {
      selectedRegions.push(currentRegion);
    }
    if (currentPolyline.length > 0) {
      selectedPolylines.push(currentPolyline.join(' '));
    }
    
    // Generate mock surface stats for the selected distance
    if (selectedDistance > 0) {
      // Use a deterministic seed based on track ID and selected distance so it doesn't flicker
      const seed = track.id.length + selectedDistance;
      const types = ['Asphalt', 'Fahrradweg', 'Schotter', 'Waldweg', 'Straße'];
      const segments = [];
      let remainingDist = selectedDistance;
      
      const numSegments = Math.floor((seed % 3)) + 1;
      
      for (let i = 0; i < numSegments - 1; i++) {
        const dist = remainingDist * (((seed + i) % 40) / 100 + 0.1);
        segments.push({
          type: types[(Math.floor(seed) + i) % types.length],
          distance: dist
        });
        remainingDist -= dist;
      }
      
      segments.push({
        type: types[(Math.floor(seed) + numSegments) % types.length],
        distance: remainingDist
      });
      
      const grouped = segments.reduce((acc, curr) => {
        acc[curr.type] = (acc[curr.type] || 0) + curr.distance;
        return acc;
      }, {} as Record<string, number>);
      
      selectedSurfaceStats = Object.entries(grouped)
        .map(([type, distance]) => ({ type, distance: distance as number }))
        .sort((a, b) => b.distance - a.distance);
    }
  }

  const points = data.map(d => {
    const x = (d.dist / distRange) * graphWidth + padding.left;
    const y = height - padding.bottom - ((d.ele - minEle) / eleRange) * graphHeight;
    return `${x},${y}`;
  }).join(' ');

  const areaPath = `M${padding.left},${height - padding.bottom} ${points} L${width - padding.right},${height - padding.bottom} Z`;

  // Coordinates for marking the steepest uphill segment
  const maxSlopePoint = data[maxPosSlopeIdx];
  const maxSlopeX = (maxSlopePoint.dist / distRange) * graphWidth + padding.left;
  const maxSlopeY = height - padding.bottom - ((maxSlopePoint.ele - minEle) / eleRange) * graphHeight;

  return (
    <div className="h-full w-full flex flex-col select-none">
      <div className="flex justify-between items-center mb-2 px-2">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: track.color }}></div>
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider truncate max-w-[200px]">
            {track.name}
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
            <input 
              type="checkbox" 
              className="sr-only" 
              checked={isSmoothed} 
              onChange={(e) => setIsSmoothed(e.target.checked)} 
            />
            <div className={`relative w-8 h-4 rounded-full transition-colors ${isSmoothed ? 'bg-emerald-500' : 'bg-slate-300'}`}>
              <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isSmoothed ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            Glätten
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold font-mono text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-100 shadow-sm">
            {selectionBounds && selectedRegions.length > 0 ? (
              <>
                <button 
                  onClick={(e) => { e.stopPropagation(); if (onSelection) onSelection(null); }}
                  className="flex gap-1 items-center text-indigo-600 hover:bg-indigo-100 px-2 py-0.5 rounded transition-colors"
                  title="Auswahl aufheben"
                >
                  <span className="text-[16px]">✕</span> <span className="text-sm">AUSWAHL:</span>
                </button>
                <span className="flex gap-1 items-center"><span className="text-blue-600 text-[16px]">↔</span> <span className="text-sm text-slate-700">{selectedDistance.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}km</span></span>
                <span className="flex gap-1 items-center"><span className="text-emerald-600 text-[16px]">▲</span> <span className="text-sm text-slate-700">{selectedAscent.toLocaleString('de-DE', { maximumFractionDigits: 0 })}m</span></span>
                <span className="flex gap-1 items-center"><span className="text-rose-600 text-[16px]">▼</span> <span className="text-sm text-slate-700">{selectedDescent.toLocaleString('de-DE', { maximumFractionDigits: 0 })}m</span></span>
                {selectedTime > 0 && (
                  <span className="flex gap-1 items-center"><span className="text-amber-600 text-[16px]">⚡</span> <span className="text-sm text-slate-700">{(selectedEnergy / selectedTime).toLocaleString('de-DE', { maximumFractionDigits: 0 })}W</span></span>
                )}
                {showSelectedSurfaceStats && selectedSurfaceStats.length > 0 && (
                  <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
                    <span className="text-slate-400">UNTERGRUND:</span>
                    {selectedSurfaceStats.map((surface, idx) => (
                      <span key={idx} className="text-sm text-slate-700">
                        {surface.type} ({surface.distance.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}km)
                      </span>
                    ))}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowSelectedSurfaceStats(false); }}
                      className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Ausblenden"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <span className="flex gap-1 items-center"><span className="text-emerald-600 text-[14px]">▲</span> <span className="text-sm text-slate-700">{track.ascent.toFixed(0)}m</span></span>
                <span className="flex gap-1 items-center"><span className="text-rose-600 text-[14px]">▼</span> <span className="text-sm text-slate-700">{track.descent.toFixed(0)}m</span></span>
                <span className="flex gap-1 items-center"><span className="text-slate-400">MAX STEIGUNG:</span> <span className="text-emerald-700 text-sm">{track.maxSlope.toFixed(1)}%</span></span>
                <span className="flex gap-1 items-center"><span className="text-slate-400">MIN/MAX:</span> <span className="text-slate-700 text-sm">{minEle.toFixed(0)}/{maxEle.toFixed(0)}m</span></span>
              </>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 relative">
        <svg 
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`} 
          className={`w-full h-full overflow-visible ${dragStartX !== null ? 'cursor-ew-resize' : 'cursor-crosshair'}`}
          preserveAspectRatio="none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
          onMouseLeave={() => {
            setHoverInfo(null);
            if (onHoverPoint) onHoverPoint(null);
            handleMouseUp();
          }}
        >
          <defs>
            <linearGradient id={`grad-${track.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={track.color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={track.color} stopOpacity="0.05" />
            </linearGradient>
            <filter id="shadow">
              <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.2"/>
            </filter>
          </defs>
          
          {/* Horizontal Grid */}
          <line x1={padding.left} y1={padding.top} x2={width - padding.right} y2={padding.top} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={padding.left} y1={padding.top + graphHeight / 2} x2={width - padding.right} y2={padding.top + graphHeight / 2} stroke="#f8fafc" strokeWidth="1" />
          
          {/* Selection Highlights */}
          {selectedRegions.map((region, i) => (
            <rect 
              key={i}
              x={region.startX}
              y={padding.top}
              width={Math.max(2, region.endX - region.startX)}
              height={graphHeight}
              fill="#4f46e5"
              opacity="0.15"
            />
          ))}

          {/* Filled Path */}
          <path d={areaPath} fill={`url(#grad-${track.id})`} />
          
          {/* Elevation Line */}
          <polyline
            fill="none"
            stroke={track.color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />

          {/* Selected Polylines */}
          {selectedPolylines.map((pts, i) => (
            <polyline
              key={`sel-${i}`}
              fill="none"
              stroke="#4f46e5"
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={pts}
            />
          ))}

          {/* Active Drag Rectangle */}
          {dragStartX !== null && dragCurrentX !== null && (
            <rect
              x={Math.min(dragStartX, dragCurrentX)}
              y={padding.top}
              width={Math.abs(dragStartX - dragCurrentX)}
              height={graphHeight}
              fill="#4f46e5"
              opacity="0.3"
            />
          )}

          {/* Special Marker for Max POSITIVE Slope */}
          {maxPosSlopeVal > 0 && (
            <g>
              <circle 
                cx={maxSlopeX} 
                cy={maxSlopeY} 
                r="4.5" 
                fill="#10b981" 
                stroke="white" 
                strokeWidth="1.5"
                className="animate-pulse"
                style={{ filter: 'drop-shadow(0px 0px 2px rgba(16,185,129,0.5))' }}
              />
              <text 
                x={maxSlopeX} 
                y={maxSlopeY - 10} 
                textAnchor="middle" 
                className="text-[9px] fill-emerald-700 font-bold font-mono"
              >
                Max Steigung: {maxPosSlopeVal.toFixed(1)}%
              </text>
            </g>
          )}

          {/* Distance Ticks */}
          {(() => {
            const getTickInterval = (range: number) => {
              const roughStep = range / 8;
              const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep || 1)));
              const normalizedStep = roughStep / magnitude;
              
              let step;
              if (normalizedStep < 1.5) step = 1;
              else if (normalizedStep < 3) step = 2;
              else if (normalizedStep < 7) step = 5;
              else step = 10;
              
              return step * magnitude;
            };
            
            const tickInterval = getTickInterval(distRange);
            const ticks = [];
            for (let d = 0; d <= distRange; d += tickInterval) {
              ticks.push(d);
            }
            if (distRange - ticks[ticks.length - 1] > tickInterval * 0.2) {
              ticks.push(distRange);
            }

            return ticks.map((d, i) => {
              const x = padding.left + (d / distRange) * graphWidth;
              return (
                <g key={i}>
                  <line x1={x} y1={height - padding.bottom} x2={x} y2={height - padding.bottom + 4} stroke="#cbd5e1" strokeWidth="1" />
                  <text x={x} y={height - 8} textAnchor="middle" className="text-[9px] fill-slate-400 font-mono font-medium">
                    {d.toFixed(d % 1 === 0 ? 0 : 1)}
                  </text>
                </g>
              );
            });
          })()}
          <text x={width / 2} y={height - 2} textAnchor="middle" className="text-[8px] fill-slate-300 font-bold uppercase tracking-widest">Entfernung (km)</text>

          {/* Interaction Tooltip (Mouse Hover) */}
          {hoverInfo && (
            <g>
              <line 
                x1={hoverInfo.x} 
                y1={padding.top} 
                x2={hoverInfo.x} 
                y2={height - padding.bottom} 
                stroke="#64748b" 
                strokeWidth="1" 
                strokeDasharray="4 2" 
              />
              <circle 
                cx={hoverInfo.x} 
                cy={hoverInfo.y} 
                r="5" 
                fill="white" 
                stroke={track.color} 
                strokeWidth="2" 
                filter="url(#shadow)"
              />
              
              <rect 
                x={hoverInfo.x + 10 > width - 110 ? hoverInfo.x - 120 : hoverInfo.x + 10} 
                y={hoverInfo.y - 45 < 5 ? hoverInfo.y + 15 : hoverInfo.y - 45} 
                width="110" 
                height={hoverInfo.power !== undefined ? "52" : "40"} 
                rx="6" 
                fill="white" 
                stroke="#e2e8f0" 
                filter="url(#shadow)"
              />
              
              <text 
                x={hoverInfo.x + 10 > width - 110 ? hoverInfo.x - 115 : hoverInfo.x + 15} 
                y={hoverInfo.y - 45 < 5 ? hoverInfo.y + 30 : hoverInfo.y - 30} 
                className="text-[10px] font-bold fill-slate-700 font-mono"
              >
                Höhe: {hoverInfo.ele.toLocaleString('de-DE', { maximumFractionDigits: 0 })}m
              </text>
              {hoverInfo.power !== undefined && (
                <text 
                  x={hoverInfo.x + 10 > width - 110 ? hoverInfo.x - 115 : hoverInfo.x + 15} 
                  y={hoverInfo.y - 45 < 5 ? hoverInfo.y + 42 : hoverInfo.y - 18} 
                  className="text-[10px] font-bold fill-amber-600 font-mono"
                >
                  Leistung: {hoverInfo.power.toLocaleString('de-DE', { maximumFractionDigits: 0 })}W
                </text>
              )}
              <text 
                x={hoverInfo.x + 10 > width - 110 ? hoverInfo.x - 115 : hoverInfo.x + 15} 
                y={hoverInfo.y - 45 < 5 ? hoverInfo.y + (hoverInfo.power !== undefined ? 54 : 45) : hoverInfo.y - (hoverInfo.power !== undefined ? 6 : 15)} 
                className="text-[9px] fill-slate-500 font-mono"
              >
                {hoverInfo.dist.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}km | {hoverInfo.slope.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
              </text>
            </g>
          )}

          {/* External Hover Point (From Map) */}
          {!hoverInfo && hoveredPoint && (
            (() => {
              let closestIdx = 0;
              let minDiff = Infinity;
              for (let i = 0; i < data.length; i++) {
                const diff = Math.abs(data[i].lat - hoveredPoint.lat) + Math.abs(data[i].lng - hoveredPoint.lng);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestIdx = i;
                }
              }
              const point = data[closestIdx];
              const x = (point.dist / distRange) * graphWidth + padding.left;
              const y = height - padding.bottom - ((point.ele - minEle) / eleRange) * graphHeight;

              return (
                <g>
                  <line 
                    x1={x} 
                    y1={padding.top} 
                    x2={x} 
                    y2={height - padding.bottom} 
                    stroke="#10b981" 
                    strokeWidth="1" 
                    strokeDasharray="4 2" 
                  />
                  <circle 
                    cx={x} 
                    cy={y} 
                    r="5" 
                    fill="#10b981" 
                    stroke="white" 
                    strokeWidth="2" 
                    filter="url(#shadow)"
                  />
                </g>
              );
            })()
          )}
        </svg>
      </div>
    </div>
  );
};

export default ElevationProfile;
