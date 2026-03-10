
import { GPXPoint, GPXTrack, PowerStats } from '../types';

export const calculatePowerStats = (points: GPXPoint[]): PowerStats | undefined => {
  const powerPoints = points.filter(p => p.power !== undefined && p.time);
  if (powerPoints.length < 2) return undefined;

  // 1. Smooth power data (5-point moving average)
  const smoothedPower = points.map((p, i) => {
    if (p.power === undefined) return undefined;
    const window = 2;
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(points.length - 1, i + window); j++) {
      if (points[j].power !== undefined) {
        sum += Math.min(points[j].power!, 2500);
        count++;
      }
    }
    return sum / count;
  });

  // 2. Time-weighted Average Power
  let totalEnergy = 0;
  let totalTime = 0;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    if (p1.power !== undefined && p2.power !== undefined && p1.time && p2.time) {
      const dt = (p2.time.getTime() - p1.time.getTime()) / 1000;
      if (dt > 0 && dt < 30) {
        const avgP = (smoothedPower[i]! + smoothedPower[i - 1]!) / 2;
        totalEnergy += avgP * dt;
        totalTime += dt;
      }
    }
  }
  const avgPower = totalTime > 0 ? totalEnergy / totalTime : 0;

  // 3. Max Power (from smoothed data)
  const validSmoothed = smoothedPower.filter(p => p !== undefined) as number[];
  const maxPower = validSmoothed.length > 0 ? Math.max(...validSmoothed) : 0;

  // 4. Best 20s and 1m using 1s interpolation
  const timedPoints = points.map((p, i) => ({ ...p, power: smoothedPower[i] })).filter(p => p.time && p.power !== undefined);
  if (timedPoints.length < 2) return { avgPower, maxPower, best20s: avgPower, best1m: avgPower };

  const startTime = timedPoints[0].time!.getTime();
  const endTime = timedPoints[timedPoints.length - 1].time!.getTime();
  const durationSec = Math.floor((endTime - startTime) / 1000);
  
  if (durationSec < 5) return { avgPower, maxPower, best20s: avgPower, best1m: avgPower };

  const power1s = new Float32Array(durationSec + 1);
  let pIdx = 0;
  for (let t = 0; t <= durationSec; t++) {
    const targetTime = startTime + t * 1000;
    while (pIdx < timedPoints.length - 1 && timedPoints[pIdx + 1].time!.getTime() < targetTime) {
      pIdx++;
    }
    const p1 = timedPoints[pIdx];
    const p2 = timedPoints[pIdx + 1];
    if (p2) {
      const t1 = p1.time!.getTime();
      const t2 = p2.time!.getTime();
      if (t2 - t1 > 5000) { // Gap larger than 5 seconds
        if (targetTime - t1 <= 2000) power1s[t] = p1.power!;
        else if (t2 - targetTime <= 2000) power1s[t] = p2.power!;
        else power1s[t] = 0;
      } else {
        const ratio = (targetTime - t1) / (t2 - t1);
        power1s[t] = p1.power! + (p2.power! - p1.power!) * ratio;
      }
    } else {
      power1s[t] = p1.power!;
    }
  }

  const getBestRolling = (window: number) => {
    if (power1s.length < window) return avgPower;
    let currentSum = 0;
    for (let i = 0; i < window; i++) currentSum += power1s[i];
    let maxSum = currentSum;
    for (let i = window; i < power1s.length; i++) {
      currentSum += power1s[i] - power1s[i - window];
      if (currentSum > maxSum) maxSum = currentSum;
    }
    return maxSum / window;
  };

  return {
    avgPower,
    maxPower,
    best20s: getBestRolling(20),
    best1m: getBestRolling(60)
  };
};

/**
 * Basic Haversine distance calculation in kilometers
 */
export const calculateDistance = (p1: GPXPoint, p2: GPXPoint): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const calculateElevationStats = (points: GPXPoint[]) => {
  let ascent = 0;
  let descent = 0;
  let maxSlope = 0;
  let totalDist = 0;

  if (points.length < 2) return { ascent, descent, maxSlope, totalDist };

  // Calculate cumulative distance for each point
  const cumDist = new Float64Array(points.length);
  cumDist[0] = 0;
  for (let i = 1; i < points.length; i++) {
    const d = calculateDistance(points[i - 1], points[i]);
    cumDist[i] = cumDist[i - 1] + d;
    totalDist += d;
  }

  // 1. Smooth elevation data (distance-based, 20m window)
  const smoothedEle = new Float64Array(points.length);
  const SMOOTH_WINDOW_KM = 0.020; 
  
  for (let i = 0; i < points.length; i++) {
    if (points[i].ele === undefined) {
      smoothedEle[i] = NaN;
      continue;
    }
    
    let sum = 0;
    let count = 0;
    
    let j = i;
    while (j >= 0 && cumDist[i] - cumDist[j] <= SMOOTH_WINDOW_KM / 2) {
      if (points[j].ele !== undefined) {
        sum += points[j].ele!;
        count++;
      }
      j--;
    }
    
    j = i + 1;
    while (j < points.length && cumDist[j] - cumDist[i] <= SMOOTH_WINDOW_KM / 2) {
      if (points[j].ele !== undefined) {
        sum += points[j].ele!;
        count++;
      }
      j++;
    }
    
    smoothedEle[i] = count > 0 ? sum / count : points[i].ele!;
  }

  // 2. Calculate ascent/descent
  for (let i = 1; i < points.length; i++) {
    const e1 = smoothedEle[i - 1];
    const e2 = smoothedEle[i];
    if (!isNaN(e1) && !isNaN(e2)) {
      const diff = e2 - e1;
      if (diff > 0.05) ascent += diff;
      else if (diff < -0.05) descent += Math.abs(diff);
    }
  }

  // 3. Calculate max slope over a fixed distance window (50 meters)
  const SLOPE_WINDOW_KM = 0.050; 
  
  for (let i = 0; i < points.length; i++) {
    if (isNaN(smoothedEle[i])) continue;
    
    let j = i + 1;
    while (j < points.length && cumDist[j] - cumDist[i] < SLOPE_WINDOW_KM) {
      j++;
    }
    
    if (j < points.length) {
      const dSum = cumDist[j] - cumDist[i];
      if (dSum >= SLOPE_WINDOW_KM * 0.5) { // At least 25m to calculate a stable slope
        const eleDiff = smoothedEle[j] - smoothedEle[i];
        const slope = (eleDiff / (dSum * 1000)) * 100;
        if (slope > maxSlope) {
          maxSlope = slope;
        }
      }
    }
  }

  return { ascent, descent, maxSlope, totalDist };
};

export const generateMockSurfaceStats = (totalDist: number) => {
  if (totalDist === 0) return [];
  
  const types = ['Asphalt', 'Fahrradweg', 'Schotter', 'Waldweg', 'Straße'];
  const segments = [];
  let remainingDist = totalDist;
  
  const numSegments = Math.floor(Math.random() * 3) + 2;
  
  for (let i = 0; i < numSegments - 1; i++) {
    const dist = remainingDist * (Math.random() * 0.4 + 0.1);
    segments.push({
      type: types[Math.floor(Math.random() * types.length)],
      distance: dist
    });
    remainingDist -= dist;
  }
  
  segments.push({
    type: types[Math.floor(Math.random() * types.length)],
    distance: remainingDist
  });
  
  const grouped = segments.reduce((acc, curr) => {
    acc[curr.type] = (acc[curr.type] || 0) + curr.distance;
    return acc;
  }, {} as Record<string, number>);
  
  return Object.entries(grouped)
    .map(([type, distance]) => ({ type, distance }))
    .sort((a, b) => b.distance - a.distance);
};

const HIGH_CONTRAST_COLORS = [
  '#FF00FF', // Magenta
  '#FF4500', // Orange Red
  '#FFD700', // Gold
  '#00FFFF', // Cyan
  '#FF1493', // Deep Pink
  '#8A2BE2', // Blue Violet
  '#FF0000', // Red
  '#00FF00', // Lime
];

let colorIndex = 0;

export const validateGPX = (xmlString: string): { isValid: boolean; error?: string } => {
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, "text/xml");
    
    // Check for XML parsing errors
    const parserError = xml.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      return { isValid: false, error: "Ungültiges XML-Format." };
    }

    // Check for root <gpx> element
    if (xml.documentElement.nodeName !== "gpx") {
      return { isValid: false, error: "Keine gültige GPX-Datei (Root-Element fehlt)." };
    }

    // Check for track points
    const trkpts = xml.querySelectorAll("trkpt");
    if (trkpts.length === 0) {
      return { isValid: false, error: "Die Datei enthält keine Trackpunkte (trkpt)." };
    }

    return { isValid: true };
  } catch (e) {
    return { isValid: false, error: "Fehler beim Validieren der Datei." };
  }
};

export const parseGPX = (xmlString: string, fileName: string): GPXTrack | null => {
  const validation = validateGPX(xmlString);
  if (!validation.isValid) {
    console.error("GPX Validation Error:", validation.error);
    return null;
  }

  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, "text/xml");
    const trkpts = xml.querySelectorAll("trkpt");
    
    const points: GPXPoint[] = Array.from(trkpts).map((pt) => {
      const lat = parseFloat(pt.getAttribute("lat") || "0");
      const lng = parseFloat(pt.getAttribute("lon") || "0");
      const eleNode = pt.querySelector("ele");
      const ele = eleNode ? parseFloat(eleNode.textContent || "0") : undefined;
      const timeStr = pt.querySelector("time")?.textContent;
      const time = timeStr ? new Date(timeStr) : undefined;
      
      // Extract power from extensions
      let power: number | undefined;
      const powerNode = pt.querySelector("power") || pt.querySelector("extensions power") || pt.querySelector("trackpointExtension power");
      if (powerNode) {
        power = parseFloat(powerNode.textContent || "0");
      }

      return { lat, lng, ele, time, power };
    });

    const name = xml.querySelector("name")?.textContent || fileName || "Unbenannter Track";
    const { ascent, descent, maxSlope, totalDist } = calculateElevationStats(points);
    const powerStats = calculatePowerStats(points);
    const surfaceStats = generateMockSurfaceStats(totalDist);

    const color = HIGH_CONTRAST_COLORS[colorIndex % HIGH_CONTRAST_COLORS.length];
    colorIndex++;

    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `track-${Date.now()}-${Math.random()}`,
      name,
      points,
      color,
      distance: totalDist,
      ascent,
      descent,
      maxSlope,
      visible: true,
      powerStats,
      surfaceStats
    };
  } catch (error) {
    console.error("Error parsing GPX:", error);
    return null;
  }
};

export const mergeTracks = (tracks: GPXTrack[]): GPXTrack => {
  const combinedPoints: GPXPoint[] = tracks.flatMap(t => t.points);
  const names = tracks.map(t => t.name).join(" → ");
  const { ascent, descent, maxSlope, totalDist } = calculateElevationStats(combinedPoints);
  const powerStats = calculatePowerStats(combinedPoints);
  const surfaceStats = generateMockSurfaceStats(totalDist);
  
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `merged-${Date.now()}-${Math.random()}`,
    name: `Kombiniert: ${names.substring(0, 40)}${names.length > 40 ? '...' : ''}`,
    points: combinedPoints,
    color: "#ef4444",
    distance: totalDist,
    ascent,
    descent,
    maxSlope,
    visible: true,
    powerStats,
    surfaceStats
  };
};
