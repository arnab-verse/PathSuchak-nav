import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from './AppContext';
import { GPSPosition } from '../types';
import { calculateDistanceMeters } from '../services/gps-geojson.service';

export interface GeolocationTelemetryHookOptions {
  throttleMs?: number; // UI render throttling rate in ms (default: 350ms)
  minDistanceDeltaMeters?: number; // Minimum displacement to trigger render update (default: 0.5m)
}

export interface GeolocationTelemetryData {
  currentGPS: GPSPosition;
  speedKmH: number;
  speedStatus: 'STATIONARY' | 'IN MOTION' | 'HIGHWAY';
  tripOdometerKm: string;
  isRealGPSFix: boolean;
  gpsSource: 'device' | 'simulation';
  activateRealGPS: () => Promise<boolean>;
  formattedCoordinates: string;
}

/**
 * High-performance throttled geolocation & speed odometer telemetry hook
 * Prevents rapid Geolocation API updates from overwhelming the React render cycle
 */
export function useGeolocationTelemetry(
  options?: GeolocationTelemetryHookOptions
): GeolocationTelemetryData {
  const { currentGPS: rawGPS, gpsBreadcrumbs, isRealGPSFix, gpsSource, activateRealGPS } = useApp();
  
  const throttleMs = options?.throttleMs ?? 350;
  const minDistanceDeltaMeters = options?.minDistanceDeltaMeters ?? 0.5;

  const [throttledGPS, setThrottledGPS] = useState<GPSPosition>(rawGPS);
  const lastEmitTimeRef = useRef<number>(Date.now());
  const lastEmittedCoordRef = useRef<{ lat: number; lng: number }>({
    lat: rawGPS.latitude,
    lng: rawGPS.longitude
  });
  const trailingTimerRef = useRef<any>(null);

  // Throttled UI state updater
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastEmit = now - lastEmitTimeRef.current;
    const distanceDelta = calculateDistanceMeters(
      lastEmittedCoordRef.current.lat,
      lastEmittedCoordRef.current.lng,
      rawGPS.latitude,
      rawGPS.longitude
    );

    // If speed changed significantly or displacement > delta or throttle interval elapsed
    const isSignificantChange = distanceDelta >= minDistanceDeltaMeters || Math.abs((throttledGPS.speed || 0) - (rawGPS.speed || 0)) >= 1;

    if (timeSinceLastEmit >= throttleMs && isSignificantChange) {
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
      lastEmitTimeRef.current = now;
      lastEmittedCoordRef.current = { lat: rawGPS.latitude, lng: rawGPS.longitude };
      setThrottledGPS(rawGPS);
    } else if (!trailingTimerRef.current) {
      const delay = Math.max(throttleMs - timeSinceLastEmit, 30);
      trailingTimerRef.current = setTimeout(() => {
        trailingTimerRef.current = null;
        lastEmitTimeRef.current = Date.now();
        lastEmittedCoordRef.current = { lat: rawGPS.latitude, lng: rawGPS.longitude };
        setThrottledGPS(rawGPS);
      }, delay);
    }

    return () => {
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
    };
  }, [rawGPS, throttleMs, minDistanceDeltaMeters]);

  // Throttled cumulative trip odometer calculation (O(1) incremental calculation to prevent render stutters)
  const lastProcessedLengthRef = useRef<number>(0);
  const accumDistanceMetersRef = useRef<number>(0);

  const tripOdometerKm = useMemo(() => {
    if (!gpsBreadcrumbs || gpsBreadcrumbs.length < 2) {
      lastProcessedLengthRef.current = gpsBreadcrumbs ? gpsBreadcrumbs.length : 0;
      accumDistanceMetersRef.current = 0;
      return '0.0';
    }

    // Incremental update if new points were appended
    if (gpsBreadcrumbs.length > lastProcessedLengthRef.current && lastProcessedLengthRef.current > 0) {
      for (let i = lastProcessedLengthRef.current; i < gpsBreadcrumbs.length; i++) {
        accumDistanceMetersRef.current += calculateDistanceMeters(
          gpsBreadcrumbs[i - 1].latitude,
          gpsBreadcrumbs[i - 1].longitude,
          gpsBreadcrumbs[i].latitude,
          gpsBreadcrumbs[i].longitude
        );
      }
    } else if (gpsBreadcrumbs.length !== lastProcessedLengthRef.current) {
      // Re-calculate from scratch if breadcrumbs array was reset or truncated
      let totalMeters = 0;
      for (let i = 1; i < gpsBreadcrumbs.length; i++) {
        totalMeters += calculateDistanceMeters(
          gpsBreadcrumbs[i - 1].latitude,
          gpsBreadcrumbs[i - 1].longitude,
          gpsBreadcrumbs[i].latitude,
          gpsBreadcrumbs[i].longitude
        );
      }
      accumDistanceMetersRef.current = totalMeters;
    }

    lastProcessedLengthRef.current = gpsBreadcrumbs.length;
    return (accumDistanceMetersRef.current / 1000).toFixed(1);
  }, [gpsBreadcrumbs]);

  const speedKmH = throttledGPS.speed !== null && throttledGPS.speed !== undefined ? throttledGPS.speed : 0;
  const speedStatus: 'STATIONARY' | 'IN MOTION' | 'HIGHWAY' = 
    speedKmH === 0 ? 'STATIONARY' : speedKmH > 80 ? 'HIGHWAY' : 'IN MOTION';

  const formattedCoordinates = `${throttledGPS.latitude.toFixed(5)}°N, ${throttledGPS.longitude.toFixed(5)}°E`;

  return {
    currentGPS: throttledGPS,
    speedKmH,
    speedStatus,
    tripOdometerKm,
    isRealGPSFix,
    gpsSource,
    activateRealGPS,
    formattedCoordinates
  };
}
