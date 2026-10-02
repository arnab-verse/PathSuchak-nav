/**
 * IDW (Inverse Distance Weighting) Interpolation & HTML5 Canvas Overlay Service
 * High-performance 6x6 pixel grid spatial interpolation clipped to the Indian Subcontinent
 */

export interface WeatherSamplePoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  tempC: number;
  rainfallMmHr: number;
  rainfall24hMm: number;
  cloudCoverPercent: number;
}

// Indian Subcontinent Boundary Polygon Vertices for Spatial Masking/Clipping
// Coordinates in [latitude, longitude] format covering mainland India, coastal waters, and Island UTs
export const INDIA_BOUNDARY_POLYGON: [number, number][] = [
  [37.15, 74.50], // Northernmost Kashmir / Karakoram
  [36.50, 77.20], // Siachen / Ladakh North
  [34.50, 79.00], // Aksai Chin / Pangong
  [32.80, 79.20], // Demchok Ladakh
  [31.20, 78.80], // Himachal border
  [30.20, 81.00], // Uttarakhand / Lipulekh
  [28.80, 80.20], // UP / Nepal West
  [27.40, 83.20], // Gorakhpur / Nepal border
  [26.50, 88.00], // Bihar / Siliguri Corridor
  [27.70, 88.90], // Sikkim North
  [27.00, 89.80], // Bhutan border
  [28.00, 92.00], // Arunachal West
  [29.30, 95.00], // Arunachal North
  [28.00, 97.40], // Kibithu / Dong East
  [26.80, 96.20], // Nagaland East
  [24.50, 94.50], // Manipur East
  [22.50, 93.30], // Mizoram South
  [23.80, 91.30], // Tripura West
  [25.20, 89.80], // Meghalaya / Bangladesh
  [22.00, 89.10], // Sundarbans Coast
  [20.50, 86.90], // Odisha / Dhamra Coast
  [19.00, 84.80], // Gopalpur Coast
  [17.70, 83.30], // Visakhapatnam Coast
  [15.80, 80.30], // Andhra / Machilipatnam
  [13.10, 80.30], // Chennai Coast
  [10.80, 79.85], // Nagapattinam / Palk Strait
  [9.20, 79.15],  // Rameswaram
  [8.08, 77.55],  // Kanyakumari (Southern Tip)
  [8.50, 76.90],  // Thiruvananthapuram
  [9.90, 76.20],  // Kochi Coast
  [11.25, 75.75], // Kozhikode Coast
  [13.00, 74.75], // Mangaluru Coast
  [15.30, 73.80], // Goa Coast
  [18.90, 72.80], // Mumbai Coast
  [20.50, 72.80], // Daman Coast
  [21.60, 72.50], // Gulf of Khambhat
  [20.80, 70.40], // Somnath / Saurashtra
  [22.30, 68.90], // Dwarka Coast
  [23.80, 68.10], // Kori Creek / Rann of Kutch West
  [24.50, 71.00], // Rajasthan border West
  [26.80, 70.20], // Jaisalmer West
  [28.50, 72.00], // Bikaner West
  [30.20, 73.80], // Punjab border / Firozpur
  [32.20, 74.80], // Pathankot / Jammu
  [33.80, 74.10], // Poonch / Line of Control
  [35.50, 73.80], // Gilgit / Hunza
  [37.15, 74.50]  // Closing loop
];

// Additional polygons for Andaman & Nicobar + Lakshadweep
export const ANDAMAN_BOX = { minLat: 6.5, maxLat: 14.0, minLng: 91.5, maxLng: 94.5 };
export const LAKSHADWEEP_BOX = { minLat: 8.0, maxLat: 12.5, minLng: 71.5, maxLng: 74.5 };

/**
 * Fast Point-in-Polygon test (Ray-Casting Algorithm) for Indian mainland & Island territories
 */
export function isPointInsideIndia(lat: number, lng: number): boolean {
  // Quick Bounding Box Rejection
  if (lat < 6.0 || lat > 37.6 || lng < 68.0 || lng > 97.6) {
    return false;
  }

  // Check Island Territories
  if (
    lat >= ANDAMAN_BOX.minLat &&
    lat <= ANDAMAN_BOX.maxLat &&
    lng >= ANDAMAN_BOX.minLng &&
    lng <= ANDAMAN_BOX.maxLng
  ) {
    return true;
  }

  if (
    lat >= LAKSHADWEEP_BOX.minLat &&
    lat <= LAKSHADWEEP_BOX.maxLat &&
    lng >= LAKSHADWEEP_BOX.minLng &&
    lng <= LAKSHADWEEP_BOX.maxLng
  ) {
    return true;
  }

  // Mainland Ray-Casting Algorithm
  const poly = INDIA_BOUNDARY_POLYGON;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][1], yi = poly[i][0];
    const xj = poly[j][1], yj = poly[j][0];

    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * IDW (Inverse Distance Weighting) Interpolation in Projected Screen Pixel Space
 * Optimized for 6x6 pixel grid performance.
 *
 * @param px Target screen pixel X
 * @param py Target screen pixel Y
 * @param projectedPoints Array of sample points pre-projected into screen coords [x, y, value]
 * @param power IDW distance power (default = 2.0)
 * @returns Interpolated value at (px, py)
 */
export function interpolateIDWScreen(
  px: number,
  py: number,
  projectedPoints: { x: number; y: number; val: number }[],
  power = 2.0
): number {
  let numerator = 0;
  let denominator = 0;
  const epsilon = 0.0001;

  for (let i = 0; i < projectedPoints.length; i++) {
    const pt = projectedPoints[i];
    const dx = px - pt.x;
    const dy = py - pt.y;
    const distSq = dx * dx + dy * dy;

    // Exact or near-exact match on sample point
    if (distSq < 1.0) {
      return pt.val;
    }

    const weight = 1.0 / (Math.pow(distSq + epsilon, power / 2.0));
    numerator += weight * pt.val;
    denominator += weight;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Color mapper for Rainfall Intensity (24h Accumulated in mm or Current Rate)
 * Strict requirement: Color-coded heatmap (green -> yellow -> orange -> red)
 *
 * @param mm Total 24h precipitation in mm
 * @param alpha Opacity multiplier (0.0 to 1.0)
 */
export function getRainfallColor(mm: number, alpha = 0.75): string {
  // 0 - 2.5 mm: Very Light / Trace (Gentle translucent green)
  if (mm < 2.5) {
    const ratio = Math.max(0, mm / 2.5);
    const a = (0.18 + ratio * 0.22) * alpha;
    return `rgba(34, 197, 94, ${a.toFixed(3)})`; // Emerald-500
  }
  // 2.5 - 15 mm: Moderate Rainfall (Rich Green)
  if (mm < 15.0) {
    const ratio = (mm - 2.5) / 12.5;
    const r = Math.round(34 + ratio * (132 - 34));
    const g = Math.round(197 + ratio * (204 - 197));
    const b = Math.round(94 - ratio * 72);
    const a = (0.40 + ratio * 0.25) * alpha;
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
  }
  // 15 - 35 mm: Heavy Rainfall (Yellow)
  if (mm < 35.0) {
    const ratio = (mm - 15.0) / 20.0;
    const r = Math.round(132 + ratio * (234 - 132));
    const g = Math.round(204 - ratio * (204 - 179));
    const b = Math.round(22 - ratio * 14);
    const a = (0.65 + ratio * 0.15) * alpha;
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`; // Amber/Yellow-500
  }
  // 35 - 65 mm: Very Heavy Rainfall (Orange)
  if (mm < 65.0) {
    const ratio = (mm - 35.0) / 30.0;
    const r = Math.round(234 + ratio * (249 - 234));
    const g = Math.round(179 - ratio * (179 - 115));
    const b = Math.round(8 + ratio * 14);
    const a = (0.80 + ratio * 0.10) * alpha;
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`; // Orange-500
  }
  // >= 65 mm: Extremely Heavy / Severe Torrential (Red / Crimson)
  const ratio = Math.min(1.0, (mm - 65.0) / 60.0);
  const r = Math.round(249 - ratio * (249 - 220));
  const g = Math.round(115 - ratio * 80);
  const b = Math.round(22 + ratio * 16);
  const a = Math.min(0.95, (0.88 + ratio * 0.08) * alpha);
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`; // Red-600 / Crimson
}

/**
 * Color mapper for Temperature (°C)
 * Cool Cyan (<16°C) -> Mild Green (16-23°C) -> Warm Yellow (23-29°C) -> Hot Orange (29-35°C) -> Scorching Red (>35°C)
 */
export function getTemperatureColor(tempC: number, alpha = 0.72): string {
  if (tempC <= 15.0) {
    // Cold / Mountain cool (Cyan / Teal)
    const ratio = Math.max(0, Math.min(1, (tempC - 5) / 10));
    const r = Math.round(6 + ratio * 28);
    const g = Math.round(182 + ratio * 15);
    const b = Math.round(212 - ratio * 118);
    return `rgba(${r}, ${g}, ${b}, ${(0.55 + ratio * 0.15) * alpha})`;
  }
  if (tempC <= 23.0) {
    // Mild / Temperate (Green)
    const ratio = (tempC - 15.0) / 8.0;
    const r = Math.round(34 + ratio * (132 - 34));
    const g = Math.round(197 + ratio * (204 - 197));
    const b = Math.round(94 - ratio * 72);
    return `rgba(${r}, ${g}, ${b}, ${(0.65 + ratio * 0.10) * alpha})`;
  }
  if (tempC <= 29.0) {
    // Warm (Yellow)
    const ratio = (tempC - 23.0) / 6.0;
    const r = Math.round(132 + ratio * (234 - 132));
    const g = Math.round(204 - ratio * (204 - 179));
    const b = Math.round(22 - ratio * 14);
    return `rgba(${r}, ${g}, ${b}, ${(0.70 + ratio * 0.10) * alpha})`;
  }
  if (tempC <= 35.0) {
    // Hot (Orange)
    const ratio = (tempC - 29.0) / 6.0;
    const r = Math.round(234 + ratio * (249 - 234));
    const g = Math.round(179 - ratio * (179 - 115));
    const b = Math.round(8 + ratio * 14);
    return `rgba(${r}, ${g}, ${b}, ${(0.75 + ratio * 0.10) * alpha})`;
  }
  // Scorching Hot (>35°C, Red)
  const ratio = Math.min(1.0, (tempC - 35.0) / 12.0);
  const r = Math.round(249 - ratio * 20);
  const g = Math.round(115 - ratio * 75);
  const b = Math.round(22 + ratio * 20);
  return `rgba(${r}, ${g}, ${b}, ${(0.82 + ratio * 0.10) * alpha})`;
}

/**
 * 24-Hour Accumulated Rainfall Parser from Open-Meteo Hourly API responses
 */
export function calculate24HourPrecipitationSum(hourlyData: { time?: string[]; precipitation?: number[] } | undefined, currentRate: number): number {
  if (!hourlyData || !hourlyData.precipitation || !Array.isArray(hourlyData.precipitation) || hourlyData.precipitation.length === 0) {
    // Estimated realistic 24-hour total if hourly array is absent
    return Math.round(currentRate * 8.5 * 10) / 10;
  }

  // Take the past 24 hourly precipitation records
  const vals = hourlyData.precipitation.slice(0, 24);
  const sum = vals.reduce((acc, v) => acc + (typeof v === 'number' && !isNaN(v) ? v : 0), 0);
  return Math.round(sum * 10) / 10;
}
