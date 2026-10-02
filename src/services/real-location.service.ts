// Real Device Location Service (Google Maps-Grade Geolocation & Geocoding)
import { GPSPosition, GPSQuality } from '../types';

export interface LocationPermissionState {
  state: 'granted' | 'prompt' | 'denied' | 'unsupported';
  message?: string;
}

export interface GeocodedAddress {
  displayName: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
}

// In-memory reverse geocode cache to avoid redundant network hits
const reverseGeocodeCache = new Map<string, string>();

/**
 * Check browser geolocation permission status
 */
export async function checkLocationPermission(): Promise<LocationPermissionState> {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return { state: 'unsupported', message: 'Geolocation is not supported by your browser.' };
  }

  try {
    if ('permissions' in navigator && navigator.permissions.query) {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return { state: status.state };
    }
    return { state: 'prompt' };
  } catch {
    return { state: 'prompt' };
  }
}

/**
 * Acquire accurate current position directly using the browser Geolocation API
 * This call itself triggers the browser native "Allow location access?" prompt.
 */
export async function getAccurateCurrentPosition(options?: PositionOptions): Promise<GPSPosition> {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    throw new Error('Geolocation is not supported in this browser environment.');
  }

  console.log('Requesting real geolocation permission now');
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('[Geolocation] Acquired real position fix:', position.coords.latitude, position.coords.longitude, '±' + position.coords.accuracy + 'm');
        resolve(position);
      },
      (error) => {
        console.warn('GEO ERROR', error.code, error.message);
        reject(error);
      },
      options || {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });

  const accuracy = Math.round(pos.coords.accuracy || 10);
  let quality: GPSQuality = 'high_precision';
  if (accuracy > 30) quality = 'standard';
  if (accuracy > 100) quality = 'degraded';

  return {
    latitude: Number(pos.coords.latitude.toFixed(6)),
    longitude: Number(pos.coords.longitude.toFixed(6)),
    altitude: pos.coords.altitude ? Math.round(pos.coords.altitude) : null,
    speed: pos.coords.speed !== null && pos.coords.speed > 0 ? Math.round(pos.coords.speed * 3.6) : null,
    heading: pos.coords.heading !== null && !isNaN(pos.coords.heading) ? Math.round(pos.coords.heading) : null,
    accuracy,
    timestamp: pos.timestamp || Date.now(),
    altitudeAccuracy: pos.coords.altitudeAccuracy ? Math.round(pos.coords.altitudeAccuracy) : null,
    quality,
    isManual: false
  };
}

let lastKnownWatchPos: { latitude: number; longitude: number; heading: number | null; timestamp: number } | null = null;

function calculateDistanceBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface WatchLocationOptions extends PositionOptions {
  throttleMs?: number; // Throttling interval in milliseconds (default: 350ms)
}

/**
 * Start watching location continuously like Google Maps with built-in UI render throttling
 */
export function watchRealLocation(
  onSuccess: (pos: GPSPosition) => void,
  onError: (err: GeolocationPositionError) => void,
  options?: WatchLocationOptions
): () => void {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return () => {};
  }

  const throttleMs = options?.throttleMs ?? 350;
  let lastEmittedTimestamp = 0;
  let trailingTimer: any = null;
  let pendingLatestPosition: GPSPosition | null = null;

  const emitThrottledPosition = (gpsPos: GPSPosition) => {
    const now = Date.now();
    const timeSinceLastEmit = now - lastEmittedTimestamp;

    if (timeSinceLastEmit >= throttleMs) {
      if (trailingTimer) {
        clearTimeout(trailingTimer);
        trailingTimer = null;
      }
      lastEmittedTimestamp = now;
      pendingLatestPosition = null;
      onSuccess(gpsPos);
    } else {
      // Queue trailing position so the latest coordinate/speed is never lost
      pendingLatestPosition = gpsPos;
      if (!trailingTimer) {
        const remainingDelay = Math.max(throttleMs - timeSinceLastEmit, 20);
        trailingTimer = setTimeout(() => {
          trailingTimer = null;
          if (pendingLatestPosition) {
            lastEmittedTimestamp = Date.now();
            const posToEmit = pendingLatestPosition;
            pendingLatestPosition = null;
            onSuccess(posToEmit);
          }
        }, remainingDelay);
      }
    }
  };

  // Instance-scoped state to avoid cross-watcher contamination
  let localLastPos: { latitude: number; longitude: number; heading: number | null; timestamp: number } | null = null;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const accuracy = Math.round(pos.coords.accuracy || 10);
      let quality: GPSQuality = 'high_precision';
      if (accuracy > 30) quality = 'standard';
      if (accuracy > 100) quality = 'degraded';

      const rawLat = Number(pos.coords.latitude.toFixed(6));
      const rawLng = Number(pos.coords.longitude.toFixed(6));
      const now = pos.timestamp || Date.now();

      // Check distance moved from previous position
      const distFromLastM = localLastPos
        ? calculateDistanceBetween(localLastPos.latitude, localLastPos.longitude, rawLat, rawLng)
        : 0;

      // Hardware speed if provided by device GPS
      const hasHardwareSpeed = pos.coords.speed !== null && !isNaN(pos.coords.speed) && pos.coords.speed >= 0;
      const rawSpeedKmH = hasHardwareSpeed ? Math.round(pos.coords.speed! * 3.6) : null;

      // Stationary jitter threshold: small drift within noise circle (typically 5 to 9 meters when stationary)
      const stationaryNoiseThreshold = Math.max(accuracy * 0.5, 6.0);
      const isStationaryNoise = localLastPos !== null && distFromLastM < stationaryNoiseThreshold && (rawSpeedKmH === null || rawSpeedKmH <= 2);

      let lat = rawLat;
      let lng = rawLng;
      let speedKmH: number = 0;
      let heading: number | null = localLastPos?.heading ?? null;

      if (isStationaryNoise && localLastPos) {
        // User has not moved: lock position to previous point to eliminate automatic creeping/wandering
        lat = localLastPos.latitude;
        lng = localLastPos.longitude;
        speedKmH = 0;
        heading = localLastPos.heading;
      } else {
        // Genuine displacement detected or initial fix
        if (hasHardwareSpeed) {
          speedKmH = rawSpeedKmH && rawSpeedKmH >= 2 ? rawSpeedKmH : 0;
        } else if (localLastPos) {
          const dtSeconds = (now - localLastPos.timestamp) / 1000;
          if (dtSeconds >= 0.5 && dtSeconds <= 12) {
            const computedSpeed = Math.round((distFromLastM / dtSeconds) * 3.6);
            speedKmH = computedSpeed >= 3 ? computedSpeed : 0;
          }
        }

        // Hardware compass heading (preferred if vehicle has speed or valid compass)
        if (pos.coords.heading !== null && !isNaN(pos.coords.heading) && pos.coords.heading >= 0) {
          heading = Math.round(pos.coords.heading);
        } else if (localLastPos && distFromLastM >= 4.0 && speedKmH >= 3) {
          // Only re-calculate motion bearing if there is noticeable real displacement and speed
          const dLat = rawLat - localLastPos.latitude;
          const dLng = rawLng - localLastPos.longitude;
          const latMidRad = ((rawLat + localLastPos.latitude) / 2) * (Math.PI / 180);
          const y = dLng * Math.cos(latMidRad);
          const x = dLat;
          const deg = (Math.atan2(y, x) * 180) / Math.PI;
          heading = Math.round((deg + 360) % 360);
        }

        localLastPos = { latitude: lat, longitude: lng, heading, timestamp: now };
        lastKnownWatchPos = localLastPos;
      }

      const gpsPos: GPSPosition = {
        latitude: lat,
        longitude: lng,
        altitude: pos.coords.altitude ? Math.round(pos.coords.altitude) : null,
        speed: speedKmH,
        heading,
        accuracy,
        timestamp: now,
        altitudeAccuracy: pos.coords.altitudeAccuracy ? Math.round(pos.coords.altitudeAccuracy) : null,
        quality,
        isManual: false
      };

      // Emit through render throttle
      emitThrottledPosition(gpsPos);
    },
    (err) => {
      console.warn('GEO ERROR [watchPosition]', err.code, err.message);
      onError(err);
    },
    {
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      maximumAge: options?.maximumAge ?? 0,
      timeout: options?.timeout ?? 5000
    }
  );

  return () => {
    if (trailingTimer) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
    navigator.geolocation.clearWatch(watchId);
  };
}

/**
 * Reverse geocode latitude and longitude to a human-readable street or area address
 */
export async function reverseGeocodeLocation(lat: number, lng: number): Promise<string> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey)!;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TacticalFieldNavigation/1.0'
      }
    });

    if (!res.ok) {
      throw new Error(`Reverse geocode failed: ${res.status}`);
    }

    const data = await res.json();
    const addr = data.address || {};
    
    // Pick the most relevant name components
    const road = addr.road || addr.street || addr.highway || addr.pedestrian;
    const area = addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter;
    const city = addr.city || addr.town || addr.village || addr.county;
    
    let label = '';
    if (road && area) {
      label = `${road}, ${area}`;
    } else if (road && city) {
      label = `${road}, ${city}`;
    } else if (data.name) {
      label = `${data.name}, ${city || area || ''}`.replace(/,\s*$/, '');
    } else if (data.display_name) {
      label = data.display_name.split(',').slice(0, 3).join(',').trim();
    } else {
      label = `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`;
    }

    reverseGeocodeCache.set(cacheKey, label);
    return label;
  } catch (err) {
    console.warn('Reverse geocoding error:', err);
    return `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Search places by name/query via OpenStreetMap Nominatim across India and worldwide
 */
export async function searchPlaces(
  query: string,
  userLat?: number,
  userLng?: number
): Promise<{ name: string; lat: number; lng: number; address: string }[]> {
  if (!query || query.trim().length < 2) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&addressdetails=1&countrycodes=in`;
    if (userLat && userLng) {
      url += `&viewbox=${userLng - 2.0},${userLat + 2.0},${userLng + 2.0},${userLat - 2.0}&bounded=0`;
    }

    let res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TacticalFieldNavigation/1.0'
      }
    });

    if (!res.ok) {
      // Fallback without countrycodes filter
      res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json', 'User-Agent': 'TacticalFieldNavigation/1.0' }
      });
    }

    if (!res.ok) return [];
    let results = await res.json();

    if (!results || results.length === 0) {
      // Retry without country code constraint
      const fallbackRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json', 'User-Agent': 'TacticalFieldNavigation/1.0' }
      });
      if (fallbackRes.ok) {
        results = await fallbackRes.json();
      }
    }

    return (results || []).map((item: any) => ({
      name: item.name || item.display_name.split(',')[0],
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      address: item.display_name
    }));
  } catch (err) {
    console.warn('Place search failed:', err);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
