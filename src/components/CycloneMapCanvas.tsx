import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { useApp } from '../context/AppContext';
import { 
  CycloneSystem, 
  CycloneForecastPoint, 
  CycloneShelter,
  generateConeOfUncertainty, 
  CYCLONE_SHELTERS
} from '../services/cyclone-tracker.service';

interface CycloneMapCanvasProps {
  cyclone: CycloneSystem | null;
  selectedHour: number;
  onSelectForecastPoint: (point: CycloneForecastPoint) => void;
  heightClass?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const CycloneMapCanvas: React.FC<CycloneMapCanvasProps> = ({
  cyclone,
  selectedHour,
  onSelectForecastPoint,
  heightClass = 'h-[440px] sm:h-[500px]',
  isExpanded = false,
  onToggleExpand
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Layer groups
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);
  const trackGroupRef = useRef<L.LayerGroup | null>(null);
  const eyeMarkerRef = useRef<L.Marker | null>(null);
  const landfallMarkerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userToEyeLineRef = useRef<L.Polyline | null>(null);
  const shelterGroupRef = useRef<L.LayerGroup | null>(null);

  const { currentGPS, isFullScreenMap, setIsFullScreenMap, showToast } = useApp();

  const [showSheltersOnMap, setShowSheltersOnMap] = useState<boolean>(true);
  const [showConeOfUncertainty, setShowConeOfUncertainty] = useState<boolean>(true);

  // Invalidate Map Size safely
  const invalidateMapSize = useCallback(() => {
    if (mapRef.current) {
      mapRef.current.invalidateSize();
    }
  }, []);

  // Listen for Escape key to minimize fullscreen map
  useEffect(() => {
    if (!isFullScreenMap) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullScreenMap(false);
        showToast('Exited Full Map View');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreenMap, setIsFullScreenMap, showToast]);

  // Invalidate on isFullScreenMap or isExpanded change
  useEffect(() => {
    const timer = setTimeout(invalidateMapSize, 120);
    return () => clearTimeout(timer);
  }, [isFullScreenMap, isExpanded, heightClass, invalidateMapSize]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = cyclone
      ? [cyclone.currentPosition.latitude, cyclone.currentPosition.longitude]
      : [20.5937, 78.9629];

    const mapInstance = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: cyclone ? 6 : 5,
      minZoom: 3,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false
    });

    // Base Tile Layer - High-Resolution Satellite (ESRI World Imagery)
    const baseTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri, Maxar, Earthstar Geographics'
    }).addTo(mapInstance);
    tileLayerRef.current = baseTile;

    // Boundaries and Place Labels Overlay
    const labelsTile = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      zIndex: 200,
      opacity: 0.95
    }).addTo(mapInstance);
    labelsLayerRef.current = labelsTile;

    // Layer groups
    trackGroupRef.current = L.layerGroup().addTo(mapInstance);
    shelterGroupRef.current = L.layerGroup().addTo(mapInstance);

    mapRef.current = mapInstance;

    const t1 = setTimeout(invalidateMapSize, 100);
    const t2 = setTimeout(invalidateMapSize, 400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      mapInstance.remove();
      mapRef.current = null;
    };
  }, [invalidateMapSize]);

  // ResizeObserver to automatically resize map whenever container or viewport shifts
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      invalidateMapSize();
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, [invalidateMapSize]);

  // Invalidate on isExpanded change
  useEffect(() => {
    const timer = setTimeout(invalidateMapSize, 150);
    return () => clearTimeout(timer);
  }, [isExpanded, heightClass, invalidateMapSize]);

  // Redraw Cyclone Geometry (Cone, Track, Eye, Rings, Landfall Target)
  useEffect(() => {
    if (!mapRef.current || !trackGroupRef.current) return;
    const group = trackGroupRef.current;
    group.clearLayers();
    if (!cyclone) return;

    // 1. Cone of Uncertainty
    if (showConeOfUncertainty) {
      const coneCoords = generateConeOfUncertainty(cyclone);
      if (coneCoords.length > 2) {
        const cone = L.polygon(coneCoords, {
          color: '#ef4444',
          weight: 2,
          dashArray: '6, 6',
          fillColor: '#dc2626',
          fillOpacity: 0.16
        });
        group.addLayer(cone);
      }
    }

    // 2. Projected Track Polyline
    const trackCoords: [number, number][] = cyclone.forecastTrack.map(pt => [pt.latitude, pt.longitude]);
    const trackLine = L.polyline(trackCoords, {
      color: '#fbbf24',
      weight: 4,
      dashArray: '8, 8',
      opacity: 0.95
    });
    group.addLayer(trackLine);

    // 3. Milestone Nodes
    cyclone.forecastTrack.forEach((point) => {
      const isCurrentSelected = point.hoursAhead === selectedHour;
      const isLandfallNode = cyclone.landfall.isLandfallExpected && 
        Math.abs(point.latitude - cyclone.landfall.latitude) < 0.5 && 
        Math.abs(point.longitude - cyclone.landfall.longitude) < 0.5;

      const nodeHtml = `
        <div class="relative flex flex-col items-center cursor-pointer group">
          <div class="w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-[10px] shadow-2xl transition-transform ${
            isCurrentSelected
              ? 'bg-red-600 text-white ring-4 ring-red-500/50 scale-125 border-2 border-white'
              : isLandfallNode
              ? 'bg-amber-500 text-black ring-2 ring-white scale-110 font-black'
              : 'bg-[#0f172a] text-amber-300 border border-amber-400/80 hover:scale-110'
          }">
            ${point.hoursAhead === 0 ? 'NOW' : `+${point.hoursAhead}h`}
          </div>
          <div class="bg-[#0c1017]/95 text-slate-200 text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/[0.1] mt-1 whitespace-nowrap shadow-md">
            ${point.sustainedWindKmph} km/h
          </div>
        </div>
      `;

      const nodeMarker = L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({
          html: nodeHtml,
          className: 'cyclone-canvas-node',
          iconSize: [44, 40],
          iconAnchor: [22, 20]
        }),
        zIndexOffset: isCurrentSelected ? 1200 : 900
      });

      nodeMarker.on('click', () => {
        onSelectForecastPoint(point);
      });

      nodeMarker.bindPopup(`
        <div class="p-2 text-xs font-mono text-slate-200 min-w-[220px] bg-[#111722] rounded-xl border border-red-500/50">
          <div class="flex items-center justify-between border-b border-white/[0.1] pb-1.5 mb-2">
            <span class="text-red-400 font-bold">${cyclone.name}</span>
            <span class="text-amber-400 font-bold">+${point.hoursAhead}h</span>
          </div>
          <div class="space-y-1 text-[11px]">
            <div class="flex justify-between text-slate-300"><span>Category:</span> <span class="text-white font-bold">${point.category}</span></div>
            <div class="flex justify-between text-slate-300"><span>Max Winds:</span> <span class="text-red-400 font-bold">${point.sustainedWindKmph} km/h (${(point.sustainedWindKmph / 1.852).toFixed(0)} kts)</span></div>
            <div class="flex justify-between text-slate-300"><span>Central Pressure:</span> <span class="text-amber-300 font-bold">${point.centralPressureHpa} hPa</span></div>
            <div class="flex justify-between text-slate-300"><span>Gale Radius:</span> <span class="text-white font-bold">${point.galeRadiusKm} km</span></div>
            <div class="flex justify-between text-slate-300"><span>Position:</span> <span class="text-primary font-bold">${point.latitude.toFixed(2)}°N, ${point.longitude.toFixed(2)}°E</span></div>
            <div class="mt-1.5 p-1.5 bg-black/40 rounded border border-white/[0.05] text-[10px] text-slate-300">${point.statusDescription}</div>
          </div>
        </div>
      `);

      group.addLayer(nodeMarker);
    });

    // 4. Active Forecast Point (Interpolated by selectedHour)
    const activePoint = cyclone.forecastTrack.find(p => p.hoursAhead === selectedHour) || cyclone.forecastTrack[0];

    // Gale Force Wind Radius Circle (Red outer ring)
    const galeCircle = L.circle([activePoint.latitude, activePoint.longitude], {
      radius: activePoint.galeRadiusKm * 1000,
      color: '#ef4444',
      weight: 1.5,
      dashArray: '5, 5',
      fillColor: '#ef4444',
      fillOpacity: 0.1
    });
    group.addLayer(galeCircle);

    // Storm Force Wind Radius Circle (Amber inner ring)
    if (activePoint.stormRadiusKm > 0) {
      const stormCircle = L.circle([activePoint.latitude, activePoint.longitude], {
        radius: activePoint.stormRadiusKm * 1000,
        color: '#f59e0b',
        weight: 1.5,
        fillColor: '#f59e0b',
        fillOpacity: 0.18
      });
      group.addLayer(stormCircle);
    }

    // 5. Eye Marker with Animated Radar Pulse
    const eyeHtml = `
      <div class="relative flex items-center justify-center" style="width: 48px; height: 48px;">
        <div class="absolute inset-0 rounded-full bg-red-600/30 animate-ping"></div>
        <div class="w-10 h-10 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-white font-bold shadow-[0_0_20px_rgba(239,68,68,1)]">
          <span class="material-symbols-outlined text-[24px] animate-spin" style="animation-duration: 3s;">cyclone</span>
        </div>
      </div>
    `;

    const eyeMarker = L.marker([activePoint.latitude, activePoint.longitude], {
      icon: L.divIcon({
        html: eyeHtml,
        className: 'cyclone-eye-marker',
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      }),
      zIndexOffset: 1500
    });
    group.addLayer(eyeMarker);
    eyeMarkerRef.current = eyeMarker;

    // 6. Landfall Target Marker
    if (cyclone.landfall.isLandfallExpected) {
      const landfallHtml = `
        <div class="relative flex flex-col items-center">
          <div class="w-8 h-8 rounded-full bg-amber-500 border-2 border-white text-black flex items-center justify-center font-bold shadow-[0_0_15px_rgba(245,158,11,1)] animate-bounce">
            <span class="material-symbols-outlined text-[18px]">crisis_alert</span>
          </div>
          <div class="bg-amber-950/95 text-amber-300 text-[9px] font-mono px-2 py-0.5 rounded-full border border-amber-500/60 mt-1 whitespace-nowrap shadow-xl font-bold">
            Landfall ETA: ${cyclone.landfall.estimatedTime}
          </div>
        </div>
      `;

      const landfallMarker = L.marker([cyclone.landfall.latitude, cyclone.landfall.longitude], {
        icon: L.divIcon({
          html: landfallHtml,
          className: 'landfall-target-marker',
          iconSize: [120, 60],
          iconAnchor: [60, 20]
        }),
        zIndexOffset: 1400
      });

      landfallMarker.bindTooltip(`
        <div class="p-2 text-xs font-mono text-white bg-[#0b101a] rounded-xl border border-amber-500">
          <div class="font-bold text-amber-400">🚨 PROJECTED LANDFALL TARGET</div>
          <div class="mt-1">${cyclone.landfall.locationName}</div>
          <div class="text-slate-300">Expected Surge: ~${cyclone.landfall.expectedSurgeMeters}m</div>
          <div class="text-slate-400 text-[10px]">ETA: ${cyclone.landfall.estimatedTime} (~${cyclone.landfall.hoursRemaining}h remaining)</div>
        </div>
      `);

      group.addLayer(landfallMarker);
      landfallMarkerRef.current = landfallMarker;
    }
  }, [cyclone, selectedHour, showConeOfUncertainty, onSelectForecastPoint]);

  // Redraw Cyclone Evacuation Shelters
  useEffect(() => {
    if (!mapRef.current || !shelterGroupRef.current) return;
    const group = shelterGroupRef.current;
    group.clearLayers();

    if (!showSheltersOnMap) return;

    CYCLONE_SHELTERS.forEach((shelter) => {
      const shelterHtml = `
        <div class="w-6 h-6 rounded-lg bg-emerald-600/90 border border-emerald-400 text-white flex items-center justify-center shadow-lg hover:scale-125 transition-transform cursor-pointer">
          <span class="material-symbols-outlined text-[14px]">night_shelter</span>
        </div>
      `;

      const marker = L.marker([shelter.latitude, shelter.longitude], {
        icon: L.divIcon({
          html: shelterHtml,
          className: 'shelter-marker-icon',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        }),
        zIndexOffset: 800
      });

      marker.bindPopup(`
        <div class="p-2 text-xs font-mono text-slate-200 min-w-[200px] bg-[#0c1424] rounded-xl border border-emerald-500/50">
          <div class="flex items-center gap-1 text-emerald-400 font-bold border-b border-white/[0.1] pb-1 mb-1.5">
            <span class="material-symbols-outlined text-[16px]">night_shelter</span>
            <span>${shelter.name}</span>
          </div>
          <div class="space-y-1 text-[11px]">
            <div class="text-slate-300">District: <strong class="text-white">${shelter.district}, ${shelter.state}</strong></div>
            <div class="text-slate-300">Capacity: <strong class="text-white">${shelter.capacityPersons} evacuees</strong> (${shelter.currentOccupancy} occupied)</div>
            <div class="text-slate-300">Status: <strong class="text-emerald-400 capitalize">${shelter.status}</strong></div>
            <div class="text-slate-300">Facilities: <strong class="text-cyan-300">${shelter.facilities.slice(0, 3).join(', ')}</strong></div>
            <div class="text-amber-400 mt-1 font-bold">Helpline: ${shelter.contactNumber}</div>
          </div>
        </div>
      `);

      group.addLayer(marker);
    });
  }, [showSheltersOnMap]);

  // Redraw User's Location Marker & Line to Cyclone Center
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
    if (userToEyeLineRef.current) {
      map.removeLayer(userToEyeLineRef.current);
      userToEyeLineRef.current = null;
    }

    const userHtml = `
      <div class="relative flex items-center justify-center" style="width: 32px; height: 32px;">
        <div class="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-[0_0_12px_rgba(59,130,246,1)]"></div>
      </div>
    `;

    const userMarker = L.marker([currentGPS.latitude, currentGPS.longitude], {
      icon: L.divIcon({
        html: userHtml,
        className: 'user-loc-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      }),
      zIndexOffset: 1600
    }).addTo(map);
    userMarkerRef.current = userMarker;

    // Active Eye point
    const activePoint = cyclone.forecastTrack.find(p => p.hoursAhead === selectedHour) || cyclone.forecastTrack[0];

    // Connect User to Eye with dashed vector line
    const userToEyeLine = L.polyline([
      [currentGPS.latitude, currentGPS.longitude],
      [activePoint.latitude, activePoint.longitude]
    ], {
      color: '#38bdf8',
      weight: 2,
      dashArray: '4, 6',
      opacity: 0.75
    }).addTo(map);
    userToEyeLineRef.current = userToEyeLine;
  }, [currentGPS, cyclone, selectedHour]);

  // Camera Focus Actions
  const focusOnCycloneEye = () => {
    if (!mapRef.current) return;
    const activePoint = cyclone.forecastTrack.find(p => p.hoursAhead === selectedHour) || cyclone.forecastTrack[0];
    mapRef.current.flyTo([activePoint.latitude, activePoint.longitude], 8, { animate: true, duration: 1 });
  };

  const focusOnLandfall = () => {
    if (!mapRef.current || !cyclone.landfall.isLandfallExpected) return;
    mapRef.current.flyTo([cyclone.landfall.latitude, cyclone.landfall.longitude], 9, { animate: true, duration: 1 });
  };

  const focusOnUser = () => {
    if (!mapRef.current || !currentGPS) return;
    mapRef.current.flyTo([currentGPS.latitude, currentGPS.longitude], 10, { animate: true, duration: 1 });
  };

  // Center and fly to cyclone when selected
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo(
      [cyclone.currentPosition.latitude, cyclone.currentPosition.longitude],
      Math.max(5, mapRef.current.getZoom()),
      { duration: 1.2 }
    );
  }, [cyclone.id]);

  const fitFullStormTrack = () => {
    if (!mapRef.current) return;
    const bounds = L.latLngBounds(cyclone.forecastTrack.map(p => [p.latitude, p.longitude]));
    if (currentGPS) {
      bounds.extend([currentGPS.latitude, currentGPS.longitude]);
    }
    if (cyclone.landfall.isLandfallExpected) {
      bounds.extend([cyclone.landfall.latitude, cyclone.landfall.longitude]);
    }
    mapRef.current.fitBounds(bounds, { padding: [40, 40] });
  };

  return (
    <div
      id="cyclone-map-main-wrapper"
      className={
        isFullScreenMap
          ? 'fixed inset-0 z-[60] w-full h-full rounded-none overflow-hidden bg-[#0c1017] shadow-2xl flex flex-col'
          : `relative w-full ${heightClass} rounded-2xl overflow-hidden border border-white/[0.1] bg-[#0c1017] shadow-2xl flex flex-col`
      }
    >
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
        {/* Left: Dedicated Sat HD Badge */}
        <div className="bg-[#0f1520]/95 backdrop-blur-xl px-2.5 py-1.5 rounded-xl border border-white/[0.1] shadow-xl flex items-center gap-1.5 pointer-events-auto">
          <span className="material-symbols-outlined text-[15px] text-amber-400">satellite_alt</span>
          <span className="text-xs font-mono font-bold text-white">Sat HD</span>
        </div>

        {/* Right: Quick Zoom / Viewport controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Maximize / Minimize Fullscreen Button */}
          <button
            id="cyclone-map-toggle-fullscreen-btn"
            onClick={() => {
              const next = !isFullScreenMap;
              setIsFullScreenMap(next);
              showToast(next ? 'Cyclone Radar Map: Maximized Fullscreen' : 'Exited Fullscreen Map View');
              if (onToggleExpand) onToggleExpand();
            }}
            className={`px-2.5 py-1.5 rounded-xl border shadow-xl flex items-center gap-1.5 text-xs font-mono font-bold backdrop-blur-xl transition-all active:scale-95 cursor-pointer ${
              isFullScreenMap
                ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                : 'bg-[#0f1520]/95 hover:bg-[#1c2638] text-white border-white/[0.1]'
            }`}
            title={isFullScreenMap ? "Minimise Cyclone Map (Esc)" : "Maximize Cyclone Map Fullscreen"}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isFullScreenMap ? 'close_fullscreen' : 'fullscreen'}
            </span>
            <span className="hidden sm:inline">{isFullScreenMap ? 'Minimise (Esc)' : 'Full Map'}</span>
          </button>

          <button
            onClick={fitFullStormTrack}
            className="px-2.5 py-1.5 rounded-xl bg-[#0f1520]/95 hover:bg-[#1c2638] text-amber-300 border border-amber-500/40 text-[11px] font-mono font-bold shadow-xl flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            title="Fit Entire Cyclone Path & Landfall Spot on Screen"
          >
            <span className="material-symbols-outlined text-[16px]">fit_screen</span>
            <span className="hidden sm:inline">Fit Track</span>
          </button>
        </div>
      </div>

      {/* Bottom Floating Tactical Action Bar */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Quick Focus Shortcuts */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={focusOnCycloneEye}
            className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400 text-xs font-mono font-bold shadow-2xl flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] animate-spin" style={{ animationDuration: '4s' }}>cyclone</span>
            <span>Center Eye</span>
          </button>

          {cyclone.landfall.isLandfallExpected && (
            <button
              onClick={focusOnLandfall}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black border border-amber-300 text-xs font-mono font-bold shadow-2xl flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">target</span>
              <span>Landfall Spot</span>
            </button>
          )}

          <button
            onClick={focusOnUser}
            className="p-2 rounded-xl bg-[#0f1520]/95 hover:bg-[#1c2638] text-blue-400 border border-blue-500/40 shadow-xl active:scale-95 transition-all cursor-pointer"
            title="Center on My Live Location"
          >
            <span className="material-symbols-outlined text-[18px]">my_location</span>
          </button>
        </div>

        {/* Feature Toggles (Shelters & Cone) */}
        <div className="bg-[#0f1520]/95 backdrop-blur-xl px-2.5 py-1.5 rounded-xl border border-white/[0.1] shadow-xl flex items-center gap-2 pointer-events-auto text-xs font-mono text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={showSheltersOnMap}
              onChange={(e) => setShowSheltersOnMap(e.target.checked)}
              className="accent-emerald-500 rounded cursor-pointer"
            />
            <span>Shelters</span>
          </label>

          <span className="text-white/20">|</span>

          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={showConeOfUncertainty}
              onChange={(e) => setShowConeOfUncertainty(e.target.checked)}
              className="accent-red-500 rounded cursor-pointer"
            />
            <span>Error Cone</span>
          </label>
        </div>
      </div>
    </div>
  );
};
