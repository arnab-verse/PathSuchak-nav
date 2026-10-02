import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

interface MapPolylineProps {
  coordinates: [number, number][];
  map: L.Map | null;
  color?: string;
  weight?: number;
  opacity?: number;
}

/**
 * MapPolyline: Declarative wrapper for Leaflet Polyline rendering.
 * Refactored to accept a raw array of coordinate pairs [lat, lng] instead of a single path object.
 * Incorporates a dimension verification check to ensure Leaflet has calculated the container
 * size correctly prior to drawing, preventing any coordinate projection or visual shifting errors.
 */
export const MapPolyline: React.FC<MapPolylineProps> = ({
  coordinates,
  map,
  color = '#2563eb',
  weight = 6,
  opacity = 1
}) => {
  const polylineRef = useRef<L.Polyline | null>(null);
  const casingRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!coordinates || coordinates.length === 0) {
      // Clean up previous rendering when coordinate array is empty
      if (polylineRef.current) {
        map.removeLayer(polylineRef.current);
        polylineRef.current = null;
      }
      if (casingRef.current) {
        map.removeLayer(casingRef.current);
        casingRef.current = null;
      }
      return;
    }

    const container = map.getContainer();
    if (!container) return;

    // Check if map container has properly calculated its dimensions (avoiding 0-px width/height bugs)
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width === 0 || height === 0) {
      console.warn('[MapPolyline] Map container dimensions not yet calculated by browser. Delaying rendering to avoid projection errors.');
      return;
    }

    // Force Leaflet to update layout dimensions so coordinates map cleanly onto Leaflet's coordinate grid
    map.invalidateSize({ animate: false });

    // 1. Dark neutral casing underlayer for high visual contrast on maps
    if (!casingRef.current) {
      casingRef.current = L.polyline(coordinates, {
        color: '#020617',
        weight: weight + 2,
        opacity: 0.8,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map);
    } else {
      casingRef.current.setLatLngs(coordinates);
    }

    // 2. Vibrant core routing polyline (Google Maps style)
    if (!polylineRef.current) {
      polylineRef.current = L.polyline(coordinates, {
        color,
        weight,
        opacity,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map);
    } else {
      polylineRef.current.setLatLngs(coordinates);
      polylineRef.current.setStyle({ color, weight, opacity });
    }

    return () => {
      if (polylineRef.current) {
        map.removeLayer(polylineRef.current);
        polylineRef.current = null;
      }
      if (casingRef.current) {
        map.removeLayer(casingRef.current);
        casingRef.current = null;
      }
    };
  }, [coordinates, map, color, weight, opacity]);

  return null;
};
