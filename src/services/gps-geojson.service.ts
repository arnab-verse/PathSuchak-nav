import { GeoJSONPoint, GeoJSONFeature, GPSPosition, GPSQuality, IncidentReport, RouteIncidentMatch, RouteOption } from '../types';

/**
 * Converts GPS position coordinates to standard GeoJSON Point object
 */
export const toGeoJSONPoint = (
  latitude: number,
  longitude: number,
  altitude: number | null = null
): GeoJSONPoint => {
  return {
    type: 'Point',
    coordinates: altitude !== null 
      ? [Number(longitude.toFixed(6)), Number(latitude.toFixed(6)), Math.round(altitude)] 
      : [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))]
  };
};

/**
 * Converts an IncidentReport to a GeoJSON Feature
 */
export const toGeoJSONFeature = (incident: IncidentReport): GeoJSONFeature => {
  return {
    type: 'Feature',
    geometry: incident.geo_json || toGeoJSONPoint(incident.latitude, incident.longitude, incident.altitude_meters),
    properties: {
      report_id: incident.report_id,
      id: incident.id,
      title: incident.title,
      category: incident.category,
      severity: incident.severity,
      district_road_segment: incident.district_road_segment,
      accuracy_meters: incident.accuracy_meters,
      observation_time: incident.observation_time,
      sync_stage: incident.sync_stage,
      reported_by: incident.reportedBy,
      photo_count: incident.photos.length
    }
  };
};

/**
 * Evaluates GPS Quality based on accuracy in meters
 */
export const evaluateGPSQuality = (accuracyMeters: number, isManual = false): GPSQuality => {
  if (isManual) return 'manual_pin';
  if (accuracyMeters <= 8) return 'high_precision';
  if (accuracyMeters <= 25) return 'standard';
  return 'degraded';
};

/**
 * Formats GPS coordinates into high-precision sub-meter representation (up to 6 decimal places)
 */
export const formatCoordinates = (lat: number, lng: number, decimals: number = 6): string => {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(decimals)}°${latDir}, ${Math.abs(lng).toFixed(decimals)}°${lngDir}`;
};

/**
 * Universal Coordinate String Parser
 * Parses diverse coordinate formats into latitude & longitude numbers:
 * - "28.6139, 77.2090" or "28.6139 77.2090"
 * - "28.6139°N, 77.2090°E" or "28.6139N 77.2090E"
 * - "Lat: 28.6139, Lng: 77.2090"
 * - Automatically detects & fixes swapped Lng, Lat inputs
 */
export const parseCoordinateInput = (input: string): { lat: number; lng: number } | null => {
  if (!input || !input.trim()) return null;
  const str = input.trim();

  // Match floating point or signed numbers
  const numbers = str.match(/[-+]?\d*\.?\d+/g);
  if (!numbers || numbers.length < 2) return null;

  let lat = parseFloat(numbers[0]);
  let lng = parseFloat(numbers[1]);

  if (isNaN(lat) || isNaN(lng)) return null;

  // Check cardinal directions in the input
  if (/S/i.test(str) && !str.includes('-') && lat > 0) lat = -lat;
  if (/W/i.test(str) && !str.includes('-') && lng > 0) lng = -lng;

  // Handle swapped [Lng, Lat] order (if first number > 90 or < -90)
  if ((Math.abs(lat) > 90 && Math.abs(lng) <= 90)) {
    const temp = lat;
    lat = lng;
    lng = temp;
  }

  if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6))
    };
  }
  return null;
};

/**
 * Calculates accurate forward azimuth / bearing from Point A to Point B (0-360 degrees)
 */
export const calculateBearing = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { degrees: number; cardinal: string } => {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  let theta = Math.atan2(y, x);
  let deg = (theta * 180) / Math.PI;
  deg = (deg + 360) % 360;
  const roundedDeg = Math.round(deg);

  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((roundedDeg % 360) / 22.5) % 16;
  return {
    degrees: roundedDeg,
    cardinal: directions[index]
  };
};

/**
 * Converts Latitude & Longitude to Tactical MGRS / Military Grid representation
 */
export const toMGRS = (lat: number, lon: number): string => {
  // Determine UTM zone
  const zone = Math.floor((lon + 180) / 6) + 1;
  const bandLetters = 'CDEFGHJKLMNPQRSTUVWX';
  const latIndex = Math.min(Math.max(Math.floor((lat + 80) / 8), 0), bandLetters.length - 1);
  const band = bandLetters[latIndex] || 'R';

  // Compute 100km square identifiers based on zone & lat
  const colChar = String.fromCharCode(65 + ((zone * 3 + Math.floor(lon * 10)) % 8));
  const rowChar = String.fromCharCode(70 + (Math.floor(lat * 8) % 15));

  // 1-meter precision 5-digit easting / northing
  const eastingFrac = Math.abs(lon - Math.floor(lon));
  const northingFrac = Math.abs(lat - Math.floor(lat));
  const easting5 = Math.floor(eastingFrac * 100000).toString().padStart(5, '0');
  const northing5 = Math.floor(northingFrac * 100000).toString().padStart(5, '0');

  return `${zone}${band} ${colChar}${rowChar} ${easting5} ${northing5}`;
};

/**
 * Calculates micro-nudge on coordinates in meters (North/South, East/West)
 */
export const nudgeCoordinate = (
  lat: number,
  lng: number,
  deltaMetersNorth: number,
  deltaMetersEast: number
): { latitude: number; longitude: number } => {
  const earthRadius = 6378137; // WGS84 major axis in meters
  const dLat = (deltaMetersNorth / earthRadius) * (180 / Math.PI);
  const dLng =
    (deltaMetersEast / (earthRadius * Math.cos((lat * Math.PI) / 180))) *
    (180 / Math.PI);
  return {
    latitude: Number((lat + dLat).toFixed(6)),
    longitude: Number((lng + dLng).toFixed(6))
  };
};

/**
 * Haversine formula calculation for exact distance between two points in meters
 */
export const calculateDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

/**
 * Calculates Route Clearance and identifies any hazard incidents within corridor
 */
export const evaluateRouteHazards = (
  route: RouteOption | null,
  incidents: IncidentReport[]
): RouteIncidentMatch[] => {
  if (!route || !route.waypoints || route.waypoints.length === 0) return [];
  const matches: RouteIncidentMatch[] = [];

  incidents.forEach((inc) => {
    let minDistance = Infinity;
    let closestIdx = 0;

    route.waypoints.forEach((wp, idx) => {
      const dist = calculateDistanceMeters(inc.latitude, inc.longitude, wp[0], wp[1]);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = idx;
      }
    });

    // Corridor buffer: 450m
    if (minDistance <= 450) {
      matches.push({
        incident: inc,
        distanceToRouteMeters: minDistance,
        closestWaypointIndex: closestIdx,
        hazardImpact: minDistance < 150 ? 'direct_blockage' : 'corridor_hazard'
      });
    }
  });

  return matches;
};

/**
 * Route Snapping Result for real-time turn-by-turn navigation
 */
export interface RouteSnappingResult {
  snappedPosition: { latitude: number; longitude: number };
  distanceToRouteMeters: number;
  isOffRoute: boolean;
  closestSegmentIndex: number;
  remainingDistanceMeters: number;
  remainingMinutes: number;
  recommendedStepIndex: number;
  segmentBearing: number;
}

/**
 * Snaps user GPS position to the closest point along the route polyline,
 * calculates off-route deviation (> 50m), and computes dynamic remaining distance/ETA.
 */
export const snapPositionToRoute = (
  userLat: number,
  userLng: number,
  route: RouteOption | null,
  currentStepIndex: number = 0
): RouteSnappingResult => {
  if (!route || !route.waypoints || route.waypoints.length < 2) {
    return {
      snappedPosition: { latitude: userLat, longitude: userLng },
      distanceToRouteMeters: 0,
      isOffRoute: false,
      closestSegmentIndex: 0,
      remainingDistanceMeters: route ? Math.round(route.distanceKm * 1000) : 0,
      remainingMinutes: route ? route.estMinutes : 0,
      recommendedStepIndex: currentStepIndex,
      segmentBearing: 0
    };
  }

  const waypoints = route.waypoints;
  let minDistanceMeters = Infinity;
  let closestSegmentIdx = 0;
  let snappedLat = userLat;
  let snappedLng = userLng;
  let segmentBearing = 0;

  // Cumulative lengths of segments
  const segmentLengths: number[] = [];
  let totalRouteLengthMeters = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const segLen = calculateDistanceMeters(p1[0], p1[1], p2[0], p2[1]);
    segmentLengths.push(segLen);
    totalRouteLengthMeters += segLen;

    // Accurate local planar projection
    const latMidRad = ((p1[0] + p2[0]) / 2) * (Math.PI / 180);
    const cosLat = Math.cos(latMidRad);
    const mPerDegLat = 111319.5;
    const mPerDegLng = 111319.5 * cosLat;

    const x1 = p1[1] * mPerDegLng;
    const y1 = p1[0] * mPerDegLat;
    const x2 = p2[1] * mPerDegLng;
    const y2 = p2[0] * mPerDegLat;
    const xp = userLng * mPerDegLng;
    const yp = userLat * mPerDegLat;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const segLenSq = dx * dx + dy * dy;

    let t = 0;
    if (segLenSq > 0) {
      t = Math.max(0, Math.min(1, ((xp - x1) * dx + (yp - y1) * dy) / segLenSq));
    }

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const distMeters = Math.sqrt((xp - projX) ** 2 + (yp - projY) ** 2);

    if (distMeters < minDistanceMeters) {
      minDistanceMeters = distMeters;
      closestSegmentIdx = i;
      snappedLat = projY / mPerDegLat;
      snappedLng = projX / mPerDegLng;
      const b = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
      segmentBearing = b.degrees;
    }
  }

  // Off-route threshold: 50 meters
  const isOffRoute = minDistanceMeters > 50;

  // Calculate actual traversed distance from start of route to snapped point
  let progressMeters = 0;
  for (let i = 0; i < closestSegmentIdx; i++) {
    progressMeters += segmentLengths[i] || 0;
  }
  const pStart = waypoints[closestSegmentIdx];
  progressMeters += calculateDistanceMeters(pStart[0], pStart[1], snappedLat, snappedLng);

  const remainingDistanceMeters = Math.max(0, Math.round(totalRouteLengthMeters - progressMeters));
  const remainingKm = remainingDistanceMeters / 1000;
  const remainingMinutes = Math.max(1, Math.round((remainingKm / 35) * 60));

  let recommendedStepIndex = currentStepIndex;
  if (route.steps && route.steps.length > 0) {
    for (let sIdx = 0; sIdx < route.steps.length; sIdx++) {
      const step = route.steps[sIdx];
      const distToStep = calculateDistanceMeters(userLat, userLng, step.location[0], step.location[1]);
      if (distToStep < 35 && sIdx < route.steps.length - 1) {
        recommendedStepIndex = sIdx + 1;
        break;
      }
    }
  }

  return {
    snappedPosition: { latitude: Number(snappedLat.toFixed(6)), longitude: Number(snappedLng.toFixed(6)) },
    distanceToRouteMeters: Math.round(minDistanceMeters),
    isOffRoute,
    closestSegmentIndex: closestSegmentIdx,
    remainingDistanceMeters,
    remainingMinutes,
    recommendedStepIndex,
    segmentBearing
  };
};

/**
 * Formats duration in minutes into 'xx Hr yy Mins' or 'yy Mins' format.
 */
export const formatDuration = (totalMinutes: number): string => {
  const roundedMins = Math.max(0, Math.round(totalMinutes || 0));
  if (roundedMins < 60) {
    return `${roundedMins} Mins`;
  }
  const hours = Math.floor(roundedMins / 60);
  const mins = roundedMins % 60;
  return `${hours} Hr ${mins} Mins`;
};
