
import { GPXPoint, GPXTrack } from '../types';
import { calculateElevationStats, calculatePowerStats, generateMockSurfaceStats } from './gpxUtils';
import { fit2json, parseRecords } from 'fit-decoder';

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

export const parseFIT = async (arrayBuffer: ArrayBuffer, fileName: string): Promise<GPXTrack | null> => {
  try {
    const fitRaw = fit2json(arrayBuffer);
    const fitData = parseRecords(fitRaw);
    
    if (!fitData || !fitData.records || fitData.records.length === 0) {
      console.error("FIT parsing error: No records found");
      return null;
    }

    const points: GPXPoint[] = fitData.records
      .filter((record: any) => record.type === 'record' && record.data.position_lat !== undefined && record.data.position_long !== undefined)
      .map((record: any) => {
        let lat = record.data.position_lat;
        let lng = record.data.position_long;
        
        // Convert semicircles to degrees if necessary
        // 1 semicircle = 180 / 2^31 degrees
        if (Math.abs(lat) > 180) lat = lat * (180 / Math.pow(2, 31));
        if (Math.abs(lng) > 180) lng = lng * (180 / Math.pow(2, 31));

        const ele = record.data.enhanced_altitude || record.data.altitude;
        const time = record.data.timestamp; // Already a Date from parseRecords
        const power = record.data.power;
        return { lat, lng, ele, time, power };
      });

    if (points.length === 0) {
      console.error("FIT parsing error: No valid position records found");
      return null;
    }

    const name = fileName.replace(/\.[^/.]+$/, "") || "FIT Activity";
    const { ascent, descent, maxSlope, totalDist } = calculateElevationStats(points);
    const powerStats = calculatePowerStats(points);
    const surfaceStats = generateMockSurfaceStats(totalDist);

    const color = HIGH_CONTRAST_COLORS[colorIndex % HIGH_CONTRAST_COLORS.length];
    colorIndex++;

    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `fit-${Date.now()}-${Math.random()}`,
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
    console.error("Error parsing FIT:", error);
    return null;
  }
};
