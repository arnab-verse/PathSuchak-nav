// India State Boundaries Service: Simplified 36-State Boundaries & Single-Metric Color Scales
import * as topojson from 'topojson-client';
import { StateWeatherReport } from './cyclone-tracker.service';
import localIndiaStatesGeoJSON from '../assets/india-states.json';

export const INDIA_TOPOJSON_URL = 'https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@2884453/topojson/india.json';
export const INDIA_GEOJSON_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@2884453/geojson/india.geojson';

// Normalized name cleaner for robust cross-matching between GeoJSON/TopoJSON and StateWeatherReport
export function normalizeStateKey(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/-ncr/g, '')
    .replace(/islands/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Precomputed polygon centroids derived from 36 state geometries
export const PRECOMPUTED_STATE_CENTROIDS: Record<string, { name: string; lat: number; lng: number }> = {
  'mizoram': { name: 'Mizoram', lat: 23.3163, lng: 92.8610 },
  'tamilnadu': { name: 'Tamil Nadu', lat: 11.0663, lng: 78.4781 },
  'madhyapradesh': { name: 'Madhya Pradesh', lat: 23.6978, lng: 78.2523 },
  'maharashtra': { name: 'Maharashtra', lat: 19.4410, lng: 76.1750 },
  'chhattisgarh': { name: 'Chhattisgarh', lat: 21.1946, lng: 82.0171 },
  'gujarat': { name: 'Gujarat', lat: 23.5069, lng: 71.9799 },
  'odisha': { name: 'Odisha', lat: 20.4891, lng: 84.4237 },
  'andhrapradesh': { name: 'Andhra Pradesh', lat: 16.0118, lng: 80.2729 },
  'karnataka': { name: 'Karnataka', lat: 14.6768, lng: 76.2939 },
  'goa': { name: 'Goa', lat: 15.4008, lng: 74.0950 },
  'kerala': { name: 'Kerala', lat: 10.5300, lng: 76.4012 },
  'telangana': { name: 'Telangana', lat: 17.8482, lng: 78.9784 },
  'westbengal': { name: 'West Bengal', lat: 24.0303, lng: 88.0800 },
  'dadraandnagarhavelianddamanddiu': { name: 'Dadra and Nagar Haveli and Daman and Diu', lat: 20.3844, lng: 72.5159 },
  'puducherry': { name: 'Puducherry', lat: 11.9338, lng: 79.8297 },
  'lakshadweep': { name: 'Lakshadweep', lat: 10.5667, lng: 72.6417 },
  'arunachalpradesh': { name: 'Arunachal Pradesh', lat: 27.9177, lng: 94.6746 },
  'assam': { name: 'Assam', lat: 26.3381, lng: 92.7187 },
  'nagaland': { name: 'Nagaland', lat: 26.0483, lng: 94.4262 },
  'meghalaya': { name: 'Meghalaya', lat: 25.5336, lng: 91.2705 },
  'manipur': { name: 'Manipur', lat: 24.7235, lng: 93.8807 },
  'tripura': { name: 'Tripura', lat: 23.8098, lng: 91.7851 },
  'andamanandnicobar': { name: 'Andaman & Nicobar', lat: 11.6234, lng: 92.7265 },
  'uttarpradesh': { name: 'Uttar Pradesh', lat: 26.8524, lng: 80.4917 },
  'rajasthan': { name: 'Rajasthan', lat: 26.3269, lng: 74.5144 },
  'delhi': { name: 'Delhi', lat: 28.6526, lng: 77.1275 },
  'delhincr': { name: 'Delhi-NCR', lat: 28.6526, lng: 77.1275 },
  'haryana': { name: 'Haryana', lat: 29.1803, lng: 76.4002 },
  'sikkim': { name: 'Sikkim', lat: 27.4925, lng: 88.4894 },
  'bihar': { name: 'Bihar', lat: 25.6681, lng: 85.6816 },
  'jharkhand': { name: 'Jharkhand', lat: 23.6933, lng: 85.6753 },
  'ladakh': { name: 'Ladakh', lat: 34.2500, lng: 77.5800 },
  'jammuandkashmir': { name: 'Jammu and Kashmir', lat: 33.6571, lng: 74.8497 },
  'himachalpradesh': { name: 'Himachal Pradesh', lat: 31.8832, lng: 77.2006 },
  'punjab': { name: 'Punjab', lat: 30.8811, lng: 75.5212 },
  'uttarakhand': { name: 'Uttarakhand', lat: 30.1387, lng: 79.1847 },
  'chandigarh': { name: 'Chandigarh', lat: 30.7143, lng: 76.7885 }
};

// Dense / small states to cluster at India-wide zoom (< 6)
export const CROWDED_STATE_KEYS = new Set([
  'sikkim',
  'manipur',
  'mizoram',
  'tripura',
  'meghalaya',
  'nagaland',
  'delhi',
  'delhincr',
  'chandigarh',
  'goa',
  'puducherry',
  'dadraandnagarhavelianddamanddiu'
]);

export const NORTHEAST_6_CENTROID: [number, number] = [25.15, 92.65];

// --- Geometry Simplification (Douglas-Peucker Algorithm) ---
function perpendicularDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
  let dx = lineEnd[0] - lineStart[0];
  let dy = lineEnd[1] - lineStart[1];
  const mag = Math.hypot(dx, dy);
  if (mag > 0) {
    dx /= mag;
    dy /= mag;
  }
  const pvx = point[0] - lineStart[0];
  const pvy = point[1] - lineStart[1];
  const pvdot = dx * pvx + dy * pvy;
  const dsx = pvdot * dx;
  const dsy = pvdot * dy;
  const ax = pvx - dsx;
  const ay = pvy - dsy;
  return Math.hypot(ax, ay);
}

function simplifyPoints(points: number[][], tolerance: number): number[][] {
  if (!points || points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  const p1 = points[0];
  const p2 = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], p1, p2);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPoints(points.slice(0, index + 1), tolerance);
    const right = simplifyPoints(points.slice(index), tolerance);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [p1, p2];
  }
}

export function simplifyGeometry(geom: any, tolerance: number = 0.015): any {
  if (!geom) return geom;
  if (geom.type === 'Polygon') {
    return {
      ...geom,
      coordinates: geom.coordinates.map((ring: number[][]) => simplifyPoints(ring, tolerance))
    };
  } else if (geom.type === 'MultiPolygon') {
    return {
      ...geom,
      coordinates: geom.coordinates.map((poly: number[][][]) => poly.map((ring: number[][]) => simplifyPoints(ring, tolerance)))
    };
  }
  return geom;
}

// In-memory GeoJSON cache
let memoryGeoJSON: any = null;
let fetchPromise: Promise<any> | null = null;
const dynamicCentroids: Record<string, { lat: number; lng: number }> = {};

/**
 * Fetch state-level boundary polygons and apply geometry simplification (tolerance ~0.015)
 */
export async function fetchSimplifiedIndiaStateBoundaries(tolerance: number = 0.015): Promise<any> {
  if (memoryGeoJSON) return memoryGeoJSON;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      // 1. First prioritize bundled pre-simplified state-level GeoJSON (zero network latency, 36 states)
      if (localIndiaStatesGeoJSON && Array.isArray((localIndiaStatesGeoJSON as any).features)) {
        extractCentroids(localIndiaStatesGeoJSON);
        memoryGeoJSON = localIndiaStatesGeoJSON;
        return memoryGeoJSON;
      }

      // 2. Try TopoJSON (contains state-level boundaries under objects.states)
      const res = await fetch(INDIA_TOPOJSON_URL);
      if (res.ok) {
        const topo = await res.json();
        if (topo && topo.objects && topo.objects.states) {
          const featureCollection = topojson.feature(topo, topo.objects.states) as any;
          
          // Apply geometry simplification to reduce vertex density for clean printed map look
          if (featureCollection && Array.isArray(featureCollection.features)) {
            featureCollection.features.forEach((f: any) => {
              if (f.geometry) {
                f.geometry = simplifyGeometry(f.geometry, tolerance);
              }
            });
            extractCentroids(featureCollection);
            memoryGeoJSON = featureCollection;
            return memoryGeoJSON;
          }
        }
      }

      // 3. Fallback to GeoJSON
      const fallbackRes = await fetch(INDIA_GEOJSON_FALLBACK_URL);
      if (fallbackRes.ok) {
        const geojson = await fallbackRes.json();
        if (geojson && Array.isArray(geojson.features)) {
          geojson.features.forEach((f: any) => {
            if (f.geometry) {
              f.geometry = simplifyGeometry(f.geometry, tolerance);
            }
          });
          extractCentroids(geojson);
          memoryGeoJSON = geojson;
          return memoryGeoJSON;
        }
      }

      throw new Error('Could not load state boundaries');
    } catch (err) {
      console.warn('[BoundariesService] GeoJSON fetch failed, using fallbacks:', err);
      if (localIndiaStatesGeoJSON) {
        memoryGeoJSON = localIndiaStatesGeoJSON;
        return memoryGeoJSON;
      }
      return null;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

// Alias for backwards compatibility
export const fetchIndiaStateBoundaries = fetchSimplifiedIndiaStateBoundaries;

function extractCentroids(data: any) {
  if (!data || !Array.isArray(data.features)) return;
  const accum: Record<string, { sumLat: number; sumLng: number; count: number }> = {};
  
  data.features.forEach((f: any) => {
    const stName = f.properties?.st_nm || f.properties?.ST_NM;
    if (!stName) return;
    const key = normalizeStateKey(stName);
    if (!accum[key]) {
      accum[key] = { sumLat: 0, sumLng: 0, count: 0 };
    }
    
    function walkCoords(coords: any) {
      if (Array.isArray(coords) && typeof coords[0] === 'number') {
        accum[key].sumLat += coords[1];
        accum[key].sumLng += coords[0];
        accum[key].count++;
        return;
      }
      if (Array.isArray(coords)) {
        coords.forEach(walkCoords);
      }
    }

    if (f.geometry?.coordinates) {
      walkCoords(f.geometry.coordinates);
    }
  });

  for (const [k, v] of Object.entries(accum)) {
    if (v.count > 0) {
      dynamicCentroids[k] = {
        lat: Number((v.sumLat / v.count).toFixed(4)),
        lng: Number((v.sumLng / v.count).toFixed(4))
      };
    }
  }
}

/**
 * Get Polygon Centroid for any State
 */
export function getStatePolygonCentroid(stateName: string): [number, number] {
  const key = normalizeStateKey(stateName);
  
  if (dynamicCentroids[key]) {
    return [dynamicCentroids[key].lat, dynamicCentroids[key].lng];
  }

  if (PRECOMPUTED_STATE_CENTROIDS[key]) {
    return [PRECOMPUTED_STATE_CENTROIDS[key].lat, PRECOMPUTED_STATE_CENTROIDS[key].lng];
  }

  return [22.8, 81.5]; // Default center of India fallback
}

/**
 * Match StateWeatherReport
 */
export function matchStateData(featureStateName: string, statesData: StateWeatherReport[]): StateWeatherReport | undefined {
  const targetKey = normalizeStateKey(featureStateName);
  return statesData.find(s => normalizeStateKey(s.stateName) === targetKey);
}

// ============================================
// SINGLE-METRIC COLOR SCALES
// ============================================

export interface MetricColorResult {
  hexColor: string;
  bgRgba: string;
  borderHex: string;
  badgeClass: string;
  categoryLabel: string;
}

/**
 * 3. THERMAL LAYER — TEMPERATURE ONLY (IMD Heatwave Thresholds)
 * - Icy Blue: below 15°C
 * - Green: 15°C to 30°C (normal)
 * - Yellow: 30°C to 40°C (warm, watch)
 * - Orange: 40°C to 45°C (heat wave range — be prepared)
 * - Red: 45°C and above (severe heat wave — severe heat warning)
 */
export function getThermalMetricColor(tempC: number): MetricColorResult {
  if (tempC < 15) {
    return {
      hexColor: '#38bdf8', // Icy Blue
      bgRgba: 'rgba(56, 189, 248, 0.25)',
      borderHex: '#38bdf8',
      badgeClass: 'text-sky-300 border-sky-400',
      categoryLabel: 'Cool / Below 15°C'
    };
  }
  if (tempC < 30) {
    return {
      hexColor: '#22c55e', // Green (Normal)
      bgRgba: 'rgba(34, 197, 94, 0.25)',
      borderHex: '#22c55e',
      badgeClass: 'text-emerald-400 border-emerald-500',
      categoryLabel: 'Normal (15-30°C)'
    };
  }
  if (tempC < 40) {
    return {
      hexColor: '#eab308', // Yellow (Warm, watch)
      bgRgba: 'rgba(234, 179, 8, 0.25)',
      borderHex: '#eab308',
      badgeClass: 'text-yellow-400 border-yellow-500',
      categoryLabel: 'Warm / Watch (30-40°C)'
    };
  }
  if (tempC < 45) {
    return {
      hexColor: '#f97316', // Orange (Heat Wave)
      bgRgba: 'rgba(249, 115, 22, 0.3)',
      borderHex: '#f97316',
      badgeClass: 'text-orange-400 border-orange-500',
      categoryLabel: 'Heat Wave (40-45°C)'
    };
  }
  return {
    hexColor: '#ef4444', // Red (Severe Heat Wave)
    bgRgba: 'rgba(239, 68, 68, 0.35)',
    borderHex: '#ef4444',
    badgeClass: 'text-red-400 border-red-500 font-bold',
    categoryLabel: 'Severe Heat Wave (≥45°C)'
  };
}

/**
 * 4. RAIN LAYER — RAINFALL ONLY (IMD Official 24h Rainfall Bands)
 * - Green: 0mm (no rain)
 * - Yellow: 0.1mm to 64.4mm (scattered drizzle to moderate rain)
 * - Orange: 64.5mm to 204.4mm (heavy to very heavy rain)
 * - Red: above 204.4mm (extremely heavy rainfall — severe rain alert)
 */
export function getRainfallMetricColor(rain24hMm: number): MetricColorResult {
  if (rain24hMm <= 0.05) {
    return {
      hexColor: '#22c55e', // Green (No Rain)
      bgRgba: 'rgba(34, 197, 94, 0.25)',
      borderHex: '#22c55e',
      badgeClass: 'text-emerald-400 border-emerald-500',
      categoryLabel: '0mm (No Rain)'
    };
  }
  if (rain24hMm <= 64.4) {
    return {
      hexColor: '#eab308', // Yellow (Scattered drizzle to moderate)
      bgRgba: 'rgba(234, 179, 8, 0.25)',
      borderHex: '#eab308',
      badgeClass: 'text-yellow-400 border-yellow-500',
      categoryLabel: '0.1-64.4mm (Drizzle to Moderate)'
    };
  }
  if (rain24hMm <= 204.4) {
    return {
      hexColor: '#f97316', // Orange (Heavy to Very Heavy)
      bgRgba: 'rgba(249, 115, 22, 0.3)',
      borderHex: '#f97316',
      badgeClass: 'text-orange-400 border-orange-500',
      categoryLabel: '64.5-204.4mm (Heavy Rain)'
    };
  }
  return {
    hexColor: '#ef4444', // Red (Extremely Heavy)
    bgRgba: 'rgba(239, 68, 68, 0.35)',
    borderHex: '#ef4444',
    badgeClass: 'text-red-400 border-red-500 font-bold',
    categoryLabel: '>204.4mm (Extremely Heavy Rain Alert)'
  };
}

/**
 * 5. CLOUDS LAYER — CLOUD DENSITY ONLY
 * - Green: 0% to 25% (clear sky)
 * - Yellow: 25% to 50% (some clouds/partly cloudy)
 * - Orange: 50% to 85% (overcast)
 * - Red: above 85% cloud cover, OR if Open-Meteo's weather_code is 95, 96, 99 (thunderstorm codes)
 */
export function getCloudMetricColor(cloudPct: number, weatherCode?: number): MetricColorResult {
  const isThunderstorm = weatherCode === 95 || weatherCode === 96 || weatherCode === 99;
  
  if (isThunderstorm || cloudPct > 85) {
    return {
      hexColor: '#ef4444', // Red (Extreme Cloud / Thunderstorm)
      bgRgba: 'rgba(239, 68, 68, 0.35)',
      borderHex: '#ef4444',
      badgeClass: 'text-red-400 border-red-500 font-bold',
      categoryLabel: isThunderstorm ? `Thunderstorm Alert (Code ${weatherCode})` : '>85% Overcast / Extreme Cloud Alert'
    };
  }
  if (cloudPct >= 50) {
    return {
      hexColor: '#f97316', // Orange (Overcast 50-85%)
      bgRgba: 'rgba(249, 115, 22, 0.3)',
      borderHex: '#f97316',
      badgeClass: 'text-orange-400 border-orange-500',
      categoryLabel: '50-85% (Overcast)'
    };
  }
  if (cloudPct >= 25) {
    return {
      hexColor: '#eab308', // Yellow (Partly cloudy 25-50%)
      bgRgba: 'rgba(234, 179, 8, 0.25)',
      borderHex: '#eab308',
      badgeClass: 'text-yellow-400 border-yellow-500',
      categoryLabel: '25-50% (Partly Cloudy)'
    };
  }
  return {
    hexColor: '#22c55e', // Green (Clear Sky 0-25%)
    bgRgba: 'rgba(34, 197, 94, 0.25)',
    borderHex: '#22c55e',
    badgeClass: 'text-emerald-400 border-emerald-500',
    categoryLabel: '0-25% (Clear Sky)'
  };
}

/**
 * MetricScaleInfo structure for backward compatibility
 */
export interface MetricScaleInfo {
  color: string;
  label: string;
  badgeClass: string;
  description: string;
}

export function getThermalScale(tempC: number): MetricScaleInfo {
  const res = getThermalMetricColor(tempC);
  return {
    color: res.hexColor,
    label: res.categoryLabel,
    badgeClass: res.badgeClass,
    description: res.categoryLabel
  };
}

export function getRainScale(rain24h: number): MetricScaleInfo {
  const res = getRainfallMetricColor(rain24h);
  return {
    color: res.hexColor,
    label: res.categoryLabel,
    badgeClass: res.badgeClass,
    description: res.categoryLabel
  };
}

export function getCloudScale(cloudPct: number, weatherCode?: number): MetricScaleInfo {
  const res = getCloudMetricColor(cloudPct, weatherCode);
  return {
    color: res.hexColor,
    label: res.categoryLabel,
    badgeClass: res.badgeClass,
    description: res.categoryLabel
  };
}

export const getCloudsScale = getCloudScale;

/**
 * Thematic fill color helper
 */
export function getStateThematicFillColor(state: StateWeatherReport | undefined, mode: 'thermal' | 'rain' | 'clouds' = 'thermal'): string {
  if (!state) return 'transparent';
  if (mode === 'thermal') {
    return getThermalMetricColor(state.tempC).hexColor;
  }
  if (mode === 'rain') {
    const rain24h = state.rainfall24hMm !== undefined ? state.rainfall24hMm : (state.rainfallMmHr * 6);
    return getRainfallMetricColor(rain24h).hexColor;
  }
  return getCloudMetricColor(state.cloudCoverPercent, state.weatherCode).hexColor;
}
