import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { useApp } from '../context/AppContext';
import { StateWeatherReport } from '../services/cyclone-tracker.service';
import {
  fetchIndiaStateBoundaries,
  getStatePolygonCentroid,
  matchStateData,
  normalizeStateKey,
  CROWDED_STATE_KEYS,
  NORTHEAST_6_CENTROID,
  getThermalScale,
  getRainScale,
  getCloudsScale
} from '../services/india-boundaries.service';

interface WeatherMapCanvasProps {
  statesData: StateWeatherReport[];
  selectedStateName: string;
  onSelectState: (stateName: string) => void;
  heightClass?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export type WeatherDataLayer = 'thermal' | 'rain' | 'clouds';

export const WeatherMapCanvas: React.FC<WeatherMapCanvasProps> = ({
  statesData,
  selectedStateName,
  onSelectState,
  heightClass = 'h-[520px] sm:h-[580px]',
  isExpanded = false,
  onToggleExpand
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Layer references
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const visualDeckLayerRef = useRef<L.LayerGroup | null>(null);
  const boundariesGeoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const stateMarkersGroupRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const { currentGPS, showToast, theme, isFullScreenMap, setIsFullScreenMap } = useApp();

  // Active Data Layer: 3 Clean Single-Metric Modes ('thermal' Default, 'rain', 'clouds')
  const [activeLayer, setActiveLayer] = useState<WeatherDataLayer>('thermal');
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.75);
  const [isLoadingBoundaries, setIsLoadingBoundaries] = useState<boolean>(false);
  const [currentZoom, setCurrentZoom] = useState<number>(5);

  const selectedState = useMemo(() => {
    return statesData.find(s => s.stateName.toLowerCase() === selectedStateName.toLowerCase()) || statesData[0];
  }, [statesData, selectedStateName]);

  // Safely trigger Leaflet map invalidateSize
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

  // 1. Initialize Leaflet Map with Satellite Base Layer
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Geographical center of India
    const initialCenter: [number, number] = [22.8000, 81.5000];

    const mapInstance = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 5,
      minZoom: 3,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false
    });

    // Track zoom level dynamically to handle Northeast clustering (< 6 vs >= 6)
    mapInstance.on('zoomend', () => {
      setCurrentZoom(mapInstance.getZoom());
    });

    // Base Layer = High-Resolution Satellite (ESRI World Imagery)
    const baseTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri, Maxar, Earthstar Geographics'
    }).addTo(mapInstance);
    baseTileLayerRef.current = baseTile;

    visualDeckLayerRef.current = L.layerGroup().addTo(mapInstance);
    stateMarkersGroupRef.current = L.layerGroup().addTo(mapInstance);

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

  // ResizeObserver for responsive layout
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

  // 2. Clean State Borders (State-level boundaries only, simplified, weight: 1.2, color: #ffffff, opacity: 0.5, fillOpacity: 0)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    let isCancelled = false;

    setIsLoadingBoundaries(true);
    fetchIndiaStateBoundaries().then((geojson) => {
      if (isCancelled || !mapRef.current || !geojson) {
        setIsLoadingBoundaries(false);
        return;
      }
      setIsLoadingBoundaries(false);

      if (boundariesGeoJsonLayerRef.current) {
        map.removeLayer(boundariesGeoJsonLayerRef.current);
        boundariesGeoJsonLayerRef.current = null;
      }

      const geoLayer = L.geoJSON(geojson, {
        style: () => {
          // Exact specification: weight 1.2, color '#ffffff', opacity 0.5, fillOpacity 0
          // so satellite imagery shows through clearly beneath
          return {
            weight: 1.2,
            color: '#ffffff',
            opacity: 0.5,
            fillColor: 'transparent',
            fillOpacity: 0
          };
        },
        onEachFeature: (feature, layer) => {
          const stName = feature?.properties?.st_nm || feature?.properties?.ST_NM;
          const matched = matchStateData(stName, statesData);
          if (matched) {
            layer.on('click', () => {
              onSelectState(matched.stateName);
            });
            layer.on('mouseover', () => {
              (layer as L.Path).setStyle({
                weight: 2.0,
                color: '#38bdf8',
                opacity: 0.95
              });
            });
            layer.on('mouseout', () => {
              (layer as L.Path).setStyle({
                weight: 1.2,
                color: '#ffffff',
                opacity: 0.5
              });
            });
          }
        }
      }).addTo(map);

      boundariesGeoJsonLayerRef.current = geoLayer;
    });

    return () => {
      isCancelled = true;
    };
  }, [statesData, onSelectState]);

  // 3. Background Visual Overlay (Heatmap Circles / Precipitation Radar / Cloud Decks)
  useEffect(() => {
    if (!mapRef.current || !visualDeckLayerRef.current) return;
    const group = visualDeckLayerRef.current;
    group.clearLayers();

    if (activeLayer === 'thermal') {
      // Thermal Layer Visual Gradient Circles
      statesData.forEach((st) => {
        const centroid = getStatePolygonCentroid(st.stateName);
        const scale = getThermalScale(st.tempC);
        const radiusM = 95000;

        const circle = L.circle(centroid, {
          radius: radiusM,
          fillColor: scale.color,
          fillOpacity: 0.32,
          color: scale.color,
          weight: 1.2,
          opacity: 0.55,
          interactive: false
        });
        group.addLayer(circle);
      });
    } else if (activeLayer === 'rain') {
      // Rain Layer Visual Precipitation Radar Circles
      statesData.forEach((st) => {
        const rain24h = st.rainfall24hMm !== undefined 
          ? st.rainfall24hMm 
          : Number((st.rainfallMmHr * 6).toFixed(1));
        
        if (rain24h < 0.1 && st.rainfallMmHr === 0) return; // dry states stay clean

        const centroid = getStatePolygonCentroid(st.stateName);
        const scale = getRainScale(rain24h);
        const radiusM = 75000 + Math.min(100000, rain24h * 1200);

        const circle = L.circle(centroid, {
          radius: radiusM,
          fillColor: scale.color,
          fillOpacity: 0.40,
          color: scale.color,
          weight: 1.4,
          opacity: 0.65,
          interactive: false
        });
        group.addLayer(circle);
      });
    } else if (activeLayer === 'clouds') {
      // Clouds Layer Visual Density Deck
      statesData.forEach((st) => {
        const cloudPct = Math.min(100, Math.max(0, st.cloudCoverPercent));
        if (cloudPct <= 10) return;

        const centroid = getStatePolygonCentroid(st.stateName);
        const scale = getCloudsScale(cloudPct, st.weatherCode);
        const radiusM = 70000 + (cloudPct / 100) * 80000;

        const deck = L.circle(centroid, {
          radius: radiusM,
          fillColor: scale.color,
          fillOpacity: 0.28 + (cloudPct / 100) * 0.25,
          color: scale.color,
          weight: 1.0,
          opacity: 0.45,
          interactive: false
        });
        group.addLayer(deck);
      });
    }
  }, [statesData, activeLayer, overlayOpacity]);

  // 4. CLEAN SINGLE-METRIC LABELS: Thermal ONLY, Rain ONLY, or Clouds ONLY
  useEffect(() => {
    if (!mapRef.current || !stateMarkersGroupRef.current) return;
    const group = stateMarkersGroupRef.current;
    group.clearLayers();

    // At default India-wide zoom (< 6), do NOT render individual labels for the 11 dense / tiny entities
    const isIndiaWideZoom = currentZoom < 6;

    statesData.forEach((st) => {
      const key = normalizeStateKey(st.stateName);

      // Skip the 11 crowded states/UTs at India-wide zoom to guarantee zero overlapping badges
      if (isIndiaWideZoom && CROWDED_STATE_KEYS.has(key)) {
        return;
      }

      const isSelected = st.stateName.toLowerCase() === selectedStateName.toLowerCase();
      const centroid = getStatePolygonCentroid(st.stateName);

      let metricText = '';
      let metricColor = '#22c55e';
      let metricScaleDesc = '';

      if (activeLayer === 'thermal') {
        // THERMAL LAYER — TEMPERATURE ONLY (e.g., "29.6°C")
        const scale = getThermalScale(st.tempC);
        metricText = `${st.tempC.toFixed(1)}°C`;
        metricColor = scale.color;
        metricScaleDesc = scale.description;
      } else if (activeLayer === 'rain') {
        // RAIN LAYER — RAINFALL ONLY (e.g., "11.9mm/24h")
        const rain24h = st.rainfall24hMm !== undefined 
          ? st.rainfall24hMm 
          : Number((st.rainfallMmHr * 6).toFixed(1));
        const scale = getRainScale(rain24h);
        metricText = `${rain24h.toFixed(1)}mm/24h`;
        metricColor = scale.color;
        metricScaleDesc = scale.description;
      } else if (activeLayer === 'clouds') {
        // CLOUDS LAYER — CLOUD DENSITY ONLY (e.g., "76%")
        const scale = getCloudsScale(st.cloudCoverPercent, st.weatherCode);
        const isThunderstorm = st.weatherCode === 95 || st.weatherCode === 96 || st.weatherCode === 99;
        metricText = isThunderstorm ? `${st.cloudCoverPercent}% ⚡` : `${st.cloudCoverPercent}%`;
        metricColor = scale.color;
        metricScaleDesc = scale.description;
      }

      // Compact chip showing ONLY state name + its own single metric
      const chipHtml = `
        <div class="state-weather-single-metric-chip group transition-transform hover:scale-105" style="
          background: rgba(10, 15, 26, 0.78);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          padding: 3px 8px;
          border-radius: 6px;
          border: ${isSelected ? '2px solid #38bdf8' : `1px solid ${metricColor}55`};
          box-shadow: ${isSelected ? '0 0 14px rgba(56, 189, 248, 0.8)' : '0 2px 8px rgba(0, 0, 0, 0.55)'};
          color: #ffffff;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          text-align: center;
          cursor: pointer;
          white-space: nowrap;
          pointer-events: auto;
          user-select: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-width: 74px;
        ">
          <div style="font-weight: 700; font-size: 11.5px; line-height: 1.15; color: #ffffff; letter-spacing: -0.2px;">
            ${st.stateName}
          </div>
          <div style="font-weight: 800; font-size: 12px; line-height: 1.15; color: ${metricColor}; margin-top: 1.5px; letter-spacing: -0.2px;">
            ${metricText}
          </div>
        </div>
      `;

      const marker = L.marker(centroid, {
        icon: L.divIcon({
          html: chipHtml,
          className: 'state-weather-metric-marker',
          iconSize: [100, 34],
          iconAnchor: [50, 17]
        }),
        zIndexOffset: isSelected ? 500 : 100
      });

      // Rich details tooltip on hover
      const rain24hVal = st.rainfall24hMm !== undefined 
        ? st.rainfall24hMm 
        : Number((st.rainfallMmHr * 6).toFixed(1));

      marker.bindTooltip(`
        <div class="font-mono text-xs text-white p-2 space-y-1 bg-[#090d16] rounded-xl border border-white/20 shadow-2xl">
          <div class="font-bold text-cyan-300 text-sm border-b border-white/10 pb-1 flex items-center justify-between gap-3">
            <span>${st.stateName} (${st.capital})</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded font-bold" style="background: ${metricColor}25; color: ${metricColor}; border: 1px solid ${metricColor}60">
              ${metricText}
            </span>
          </div>
          <div class="text-[11px] text-slate-300 pt-0.5">${metricScaleDesc}</div>
          <div class="text-[10px] text-slate-400 space-y-0.5 pt-1 border-t border-white/10">
            <div>🌡️ Temp: <span class="text-white">${st.tempC}°C</span></div>
            <div>🌧️ Rain: <span class="text-white">${st.rainfallMmHr} mm/h (24h: ${rain24hVal}mm)</span></div>
            <div>☁️ Cloud: <span class="text-white">${st.cloudCoverPercent}%</span></div>
            <div>💨 Wind: <span class="text-white">${st.windSpeedKmph} km/h ${st.windDirection}</span></div>
          </div>
        </div>
      `, { direction: 'top', offset: [0, -14] });

      marker.on('click', () => {
        onSelectState(st.stateName);
      });

      group.addLayer(marker);
    });

    // 5. Northeast Cluster Marker: At default India-wide zoom (< 6), render "6 more ▸" at combined centroid
    if (isIndiaWideZoom) {
      const clusterHtml = `
        <div class="ne-cluster-chip group transition-transform hover:scale-105" style="
          background: rgba(10, 15, 26, 0.85);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid rgba(56, 189, 248, 0.7);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
          color: #38bdf8;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <span>6 more ▸</span>
        </div>
      `;

      const clusterMarker = L.marker(NORTHEAST_6_CENTROID, {
        icon: L.divIcon({
          html: clusterHtml,
          className: 'ne-cluster-marker',
          iconSize: [72, 28],
          iconAnchor: [36, 14]
        }),
        zIndexOffset: 300
      });

      clusterMarker.bindTooltip(
        `<div class="font-mono text-xs text-cyan-300 bg-[#090d16] px-2.5 py-1.5 rounded-lg border border-cyan-500/40 shadow-xl">
          <strong>Northeast Region: 6 States Clustered</strong>
          <div class="text-[10px] text-slate-300 mt-0.5">Sikkim, Manipur, Mizoram, Tripura, Meghalaya, Nagaland</div>
          <div class="text-[9px] text-cyan-400 mt-1">Tap to zoom in (level 6+) for individual ${activeLayer} labels</div>
        </div>`,
        { direction: 'top', offset: [0, -12] }
      );

      clusterMarker.on('click', () => {
        if (mapRef.current) {
          mapRef.current.flyTo([25.5, 93.0], 7, { duration: 1.0 });
          showToast(`🔍 Zoomed into Northeast states (individual ${activeLayer} metrics active)`);
        }
      });

      group.addLayer(clusterMarker);
    }
  }, [statesData, selectedStateName, currentZoom, activeLayer, onSelectState, showToast]);

  // 5. Render User's Live GPS Fix Marker
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

    const userHtml = `
      <div class="relative flex items-center justify-center">
        <div class="w-8 h-8 rounded-full bg-cyan-400/25 border-2 border-cyan-400 animate-ping absolute" />
        <div class="w-5 h-5 rounded-full bg-cyan-500 border-2 border-white text-white flex items-center justify-center font-bold text-[9px] shadow-[0_0_12px_rgba(6,182,212,0.8)]">
          <span class="material-symbols-outlined text-[12px]">my_location</span>
        </div>
      </div>
    `;

    const userMarker = L.marker([currentGPS.latitude, currentGPS.longitude], {
      icon: L.divIcon({
        html: userHtml,
        className: 'user-weather-position',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      }),
      zIndexOffset: 1000
    }).addTo(map);

    userMarker.bindTooltip(
      `<div class="font-mono text-xs font-bold text-white bg-blue-950 px-2.5 py-1 rounded-lg border border-cyan-400 shadow-xl">📍 CURRENT GPS FIX</div>`,
      { permanent: false, direction: 'top' }
    );

    userMarkerRef.current = userMarker;
  }, [currentGPS.latitude, currentGPS.longitude]);

  // Navigation helpers
  const handlePanToState = (stateName: string) => {
    const target = statesData.find(s => s.stateName.toLowerCase() === stateName.toLowerCase());
    if (target && mapRef.current) {
      const centroid = getStatePolygonCentroid(target.stateName);
      mapRef.current.flyTo(centroid, 7, { duration: 1.2 });
      onSelectState(target.stateName);
      showToast(`📍 Panned to ${target.stateName} (${target.tempC}°C)`);
    }
  };

  const handleRecenterIndia = () => {
    if (mapRef.current) {
      mapRef.current.flyTo([22.8000, 81.5000], 5, { duration: 1.0 });
      showToast('🇮🇳 Recenter view to all-India perspective');
    }
  };

  const handlePanToUser = () => {
    if (mapRef.current) {
      mapRef.current.flyTo([currentGPS.latitude, currentGPS.longitude], 8, { duration: 1.0 });
      showToast('📍 Centered on your current GPS location');
    }
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  return (
    <div
      id="weather-map-main-wrapper"
      className={
        isFullScreenMap
          ? 'fixed inset-0 z-[60] w-full h-full rounded-none overflow-hidden bg-[#080d16] flex flex-col'
          : `relative w-full rounded-2xl overflow-hidden border border-white/[0.12] shadow-2xl bg-[#080d16] flex flex-col ${heightClass}`
      }
    >
      
      {/* Top Toolbar: 3 Clean Single-Metric Layer Modes (Thermal, Rain, Clouds) + Satellite Variant Toggle */}
      <div className="bg-[#0f172a]/95 backdrop-blur-xl border-b border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-20 shrink-0">
        
        {/* Left: 3 Clean Single-Metric Mode Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-[#080d16] p-1 rounded-xl border border-white/10">
            
            {/* 1. THERMAL LAYER (Temperature Only) */}
            <button
              id="layer-thermal-button"
              onClick={() => {
                setActiveLayer('thermal');
                showToast('🌡️ Thermal Mode: Temperature only (IMD Heatwave scale)');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeLayer === 'thermal'
                  ? 'bg-amber-600 text-white shadow-[0_0_12px_rgba(245,158,11,0.6)] border border-amber-400 font-black'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.08]'
              }`}
              title="Thermal Layer — Temperature Only (IMD Heatwave Thresholds)"
            >
              <span className="material-symbols-outlined text-[16px]">device_thermostat</span>
              <span>Thermal</span>
            </button>

            {/* 2. RAIN LAYER (Rainfall Only) */}
            <button
              id="layer-rain-button"
              onClick={() => {
                setActiveLayer('rain');
                showToast('🌧️ Rain Mode: 24h Rainfall only (IMD 24h Rainfall bands)');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeLayer === 'rain'
                  ? 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.6)] border border-emerald-400 font-black'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.08]'
              }`}
              title="Rain Layer — Rolling 24h Rainfall Only (IMD Precipitation Bands)"
            >
              <span className="material-symbols-outlined text-[16px]">rainy</span>
              <span>Rain</span>
            </button>

            {/* 3. CLOUDS LAYER (Cloud Density Only) */}
            <button
              id="layer-clouds-button"
              onClick={() => {
                setActiveLayer('clouds');
                showToast('☁️ Clouds Mode: Cloud cover % only (with Thunderstorm alert codes)');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeLayer === 'clouds'
                  ? 'bg-cyan-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.6)] border border-cyan-400 font-black'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.08]'
              }`}
              title="Clouds Layer — Cloud Density & Thunderstorm Code Only"
            >
              <span className="material-symbols-outlined text-[16px]">cloud</span>
              <span>Clouds</span>
            </button>
          </div>

          {/* Opacity Control Slider */}
          <div className="hidden lg:flex items-center gap-1.5 bg-[#080d16] px-2.5 py-1.5 rounded-xl border border-white/10 text-xs font-mono text-slate-300">
            <span className="text-[11px] text-slate-400">Tint/Opacity:</span>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
              className="w-16 accent-cyan-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            />
            <span className="text-[10px] text-white font-bold">{Math.round(overlayOpacity * 100)}%</span>
          </div>
        </div>

        {/* Right: State Selector & Maximize/Minimize Toggle */}
        <div className="flex items-center gap-1.5 flex-wrap">
          
          {/* State Jump Dropdown */}
          <select
            value={selectedStateName}
            onChange={(e) => handlePanToState(e.target.value)}
            className="bg-[#080d16] border border-white/15 text-white text-xs font-mono font-bold px-2.5 py-1.5 rounded-xl cursor-pointer focus:outline-none max-w-[140px] sm:max-w-none truncate"
            title="Pan to State Centroid"
          >
            <option value="" disabled>Select State ({statesData.length})...</option>
            {statesData.map(s => (
              <option key={s.stateName} value={s.stateName}>
                {s.stateName} ({s.tempC}°C)
              </option>
            ))}
          </select>

          {/* Maximize / Minimize Fullscreen Button */}
          <button
            id="weather-map-toggle-fullscreen-btn"
            onClick={() => {
              const next = !isFullScreenMap;
              setIsFullScreenMap(next);
              showToast(next ? 'Weather Map View: Maximized Fullscreen' : 'Exited Fullscreen Map View');
              if (onToggleExpand) onToggleExpand();
            }}
            className={`px-2.5 py-1.5 rounded-xl border shadow-xl flex items-center gap-1.5 text-xs font-mono font-bold backdrop-blur-xl transition-all active:scale-95 cursor-pointer ${
              isFullScreenMap
                ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                : 'bg-[#080d16] hover:bg-[#182234] text-white border-white/15'
            }`}
            title={isFullScreenMap ? 'Minimise Weather Map (Esc)' : 'Maximize Weather Map Fullscreen'}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isFullScreenMap ? 'close_fullscreen' : 'open_in_full'}
            </span>
            <span className="hidden sm:inline">{isFullScreenMap ? 'Minimise (Esc)' : 'Full Map'}</span>
          </button>
        </div>
      </div>

      {/* Map Body Canvas Container */}
      <div className="relative flex-1 w-full min-h-[360px] bg-[#0a0d14]">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Loading Indicator */}
        {isLoadingBoundaries && (
          <div className="absolute top-3 left-3 z-[400] bg-[#0c121e]/90 backdrop-blur-md border border-cyan-500/40 px-3 py-1.5 rounded-xl text-xs font-mono text-cyan-300 flex items-center gap-2 shadow-2xl">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>Loading State Boundaries...</span>
          </div>
        )}

        {/* Floating Quick Navigation HUD (Zoom In, Zoom Out, Recenter India, GPS Location) */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-xl bg-[#0f172a]/90 hover:bg-[#1e293b] border border-white/20 text-white flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer backdrop-blur-md"
            title="Zoom In"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-xl bg-[#0f172a]/90 hover:bg-[#1e293b] border border-white/20 text-white flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer backdrop-blur-md"
            title="Zoom Out"
          >
            <span className="material-symbols-outlined text-[18px]">remove</span>
          </button>
          <button
            onClick={handleRecenterIndia}
            className="w-8 h-8 rounded-xl bg-[#0f172a]/90 hover:bg-[#1e293b] border border-white/20 text-cyan-300 flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer backdrop-blur-md"
            title="Recenter Map on India"
          >
            <span className="material-symbols-outlined text-[18px]">public</span>
          </button>
          <button
            onClick={handlePanToUser}
            className="w-8 h-8 rounded-xl bg-[#0f172a]/90 hover:bg-[#1e293b] border border-cyan-400/60 text-cyan-400 flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer backdrop-blur-md"
            title="Jump to My Location"
          >
            <span className="material-symbols-outlined text-[18px]">my_location</span>
          </button>
        </div>
      </div>
    </div>
  );
};
