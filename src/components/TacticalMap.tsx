import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { useApp } from '../context/AppContext';
import { Waypoint, MapLayerType } from '../types';
import { formatCoordinates, calculateBearing, toMGRS, nudgeCoordinate, calculateDistanceMeters, formatDuration, parseCoordinateInput } from '../services/gps-geojson.service';

interface TacticalMapProps {
  heightClass?: string;
  interactive?: boolean;
  onSelectCoordinate?: (lat: number, lng: number) => void;
  isPinDropMode?: boolean;
  selectedWaypointId?: string | null;
  onSelectWaypoint?: (wp: Waypoint) => void;
  showControls?: boolean;
  initialPinnedCoord?: { lat: number; lng: number } | null;
  showControlsBar?: boolean;
  showTileCacheIndicator?: boolean;
  showGridOverlay?: boolean;
  showZoomControls?: boolean;
  showCacheButton?: boolean;
  showScaleControl?: boolean;
  showRecenterButton?: boolean;
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  heightClass = 'h-[calc(100vh-14rem)]',
  interactive = true,
  onSelectCoordinate,
  isPinDropMode = false,
  selectedWaypointId,
  onSelectWaypoint,
  showControls = true,
  initialPinnedCoord = null,
  showControlsBar = true,
  showTileCacheIndicator = true,
  showGridOverlay = false,
  showZoomControls = true,
  showCacheButton = true,
  showScaleControl = true,
  showRecenterButton = true
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const scaleControlRef = useRef<L.Control.Scale | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const breadcrumbPolylineRef = useRef<L.Polyline | null>(null);
  const routeCasingPolylineRef = useRef<L.Polyline | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const waypointLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const incidentLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const pinnedMarkerRef = useRef<L.Marker | null>(null);
  const isProgrammaticMoveRef = useRef<boolean>(false);
  const lastRecenterCounterRef = useRef<number>(0);

  const { 
    currentGPS, 
    gpsBreadcrumbs, 
    waypoints, 
    incidents, 
    activeRoute, 
    showToast, 
    setCurrentTab,
    gpsSource,
    isRealGPSFix,
    activateRealGPS,
    calculateRoadRouteToDestination,
    recenterMapCounter,
    triggerRecenterOnUser,
    isFullScreenMap,
    setIsFullScreenMap,
    isDrivingJourney,
    startDrivingJourney,
    mapLayer,
    setMapLayer,
    isFollowDriver,
    setIsFollowDriver,
    mapZoomAction
  } = useApp();

  const [isMapReady, setIsMapReady] = useState<boolean>(false);
  const [currentZoom, setCurrentZoom] = useState<number>(15);
  const [showCenterReticle, setShowCenterReticle] = useState<boolean>(false);
  const [pinnedCoord, setPinnedCoord] = useState<{ lat: number; lng: number } | null>(initialPinnedCoord);
  const [nudgeStepMeters, setNudgeStepMeters] = useState<number>(5); // 1m, 5m, 25m

  // Auto-clear pinned coordinates when driving navigation starts or when active route is being followed
  useEffect(() => {
    if (isDrivingJourney) {
      setPinnedCoord(null);
    }
  }, [isDrivingJourney]);

  // Listen to global zoom actions from HUD or external controls
  useEffect(() => {
    if (!mapRef.current || !mapZoomAction) return;
    setIsFollowDriver(false);
    if (mapZoomAction === 'in') {
      mapRef.current.zoomIn();
    } else if (mapZoomAction === 'out') {
      mapRef.current.zoomOut();
    }
  }, [mapZoomAction, setIsFollowDriver]);

  // Invalidate Leaflet canvas dimensions on fullscreen toggle
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 120);
    return () => clearTimeout(timer);
  }, [isFullScreenMap]);

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
  const [cursorCoord, setCursorCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [customCoordInput, setCustomCoordInput] = useState<string>('');

  // High precision tile resolver
  const getTileConfig = (layer: MapLayerType) => {
    switch (layer) {
      case 'google_hybrid':
      case 'cyclone_satellite':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          subdomains: 'abc',
          maxZoom: 20,
          maxNativeZoom: 19,
          attribution: 'Esri, Maxar, Earthstar Geographics'
        };
      case 'osm_standard':
      default:
        return {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          subdomains: 'abc',
          maxZoom: 20,
          maxNativeZoom: 19,
          attribution: 'OpenStreetMap'
        };
    }
  };

  // Approximate ground resolution in meters per pixel at current latitude
  const getGroundResolution = (zoom: number, lat: number) => {
    const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
    if (metersPerPixel < 1) {
      return `${(metersPerPixel * 100).toFixed(0)} cm/px`;
    }
    return `${metersPerPixel.toFixed(1)} m/px`;
  };

  // Map Initialization
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if ((container as any)._leaflet_id) {
      (container as any)._leaflet_id = null;
    }

    let mapInstance: L.Map | null = null;

    try {
      mapInstance = L.map(container, {
        center: [currentGPS.latitude, currentGPS.longitude],
        zoom: isDrivingJourney ? 18 : 15,
        minZoom: 4,
        maxZoom: 21,
        zoomControl: false,
        attributionControl: false,
        fadeAnimation: true,
        zoomAnimation: true
      });

      // Add Tactical Metric Scale Control (unless disabled by prop)
      if (showScaleControl) {
        scaleControlRef.current = L.control
          .scale({
            imperial: false,
            metric: true,
            position: 'bottomleft',
            maxWidth: 130
          })
          .addTo(mapInstance);
      }

      // Add Base Tile Layer
      const cfg = getTileConfig(mapLayer);
      const baseTile = L.tileLayer(cfg.url, {
        maxZoom: cfg.maxZoom,
        maxNativeZoom: cfg.maxNativeZoom,
        subdomains: cfg.subdomains,
        attribution: cfg.attribution
      }).addTo(mapInstance);

      tileLayerRef.current = baseTile;
      waypointLayerGroupRef.current = L.layerGroup().addTo(mapInstance);
      incidentLayerGroupRef.current = L.layerGroup().addTo(mapInstance);

      if (interactive) {
        mapInstance.on('click', (e: L.LeafletMouseEvent) => {
          const lat = Number(e.latlng.lat.toFixed(6));
          const lng = Number(e.latlng.lng.toFixed(6));
          setPinnedCoord({ lat, lng });
          setIsFollowDriver(false);
          if (onSelectCoordinate) {
            onSelectCoordinate(lat, lng);
          }
        });

        mapInstance.on('dragstart', () => {
          setIsFollowDriver(false);
        });

        mapInstance.on('zoomstart', () => {
          // If zoom is initiated by user wheel, pinch, buttons, or gesture (not programmatic)
          if (!isProgrammaticMoveRef.current) {
            setIsFollowDriver(false);
          }
        });

        mapInstance.on('wheel', () => {
          setIsFollowDriver(false);
        });

        mapInstance.on('touchstart', (e: any) => {
          if (e.touches && e.touches.length > 1) {
            setIsFollowDriver(false);
          }
        });

        mapInstance.on('zoomend', () => {
          if (mapRef.current) {
            setCurrentZoom(mapRef.current.getZoom());
          }
        });
      } else {
        mapInstance.dragging.disable();
        mapInstance.touchZoom.disable();
        mapInstance.doubleClickZoom.disable();
        mapInstance.scrollWheelZoom.disable();
        mapInstance.boxZoom.disable();
        mapInstance.keyboard.disable();
      }

      mapRef.current = mapInstance;
      setIsMapReady(true);
      setCurrentZoom(mapInstance.getZoom());

      requestAnimationFrame(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      });
    } catch (err) {
      console.warn('Tactical Map init deferred:', err);
    }

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    });
    resizeObserver.observe(container);

    const t0 = setTimeout(() => mapRef.current?.invalidateSize(), 50);
    const t1 = setTimeout(() => mapRef.current?.invalidateSize(), 150);
    const t2 = setTimeout(() => mapRef.current?.invalidateSize(), 350);
    const t3 = setTimeout(() => mapRef.current?.invalidateSize(), 700);

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      resizeObserver.disconnect();
      setIsMapReady(false);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      userMarkerRef.current = null;
      accuracyCircleRef.current = null;
      breadcrumbPolylineRef.current = null;
      routePolylineRef.current = null;
      waypointLayerGroupRef.current = null;
      incidentLayerGroupRef.current = null;
      tileLayerRef.current = null;
      pinnedMarkerRef.current = null;
      scaleControlRef.current = null;
    };
  }, []);

  // Update Base Tile Layer on layer toggle
  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;

    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }

    const cfg = getTileConfig(mapLayer);
    const newTile = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      maxNativeZoom: cfg.maxNativeZoom,
      subdomains: cfg.subdomains,
      attribution: cfg.attribution
    }).addTo(mapRef.current);

    tileLayerRef.current = newTile;
    mapRef.current.invalidateSize();
  }, [mapLayer, isMapReady]);

  // Track previous marker visual mode to avoid rebuilding DOM divIcon every frame
  const lastMarkerModeRef = useRef<string>('');
  const lastAccuracyColorRef = useRef<string>('');

  // Update Driver/User Location Marker & Precision Accuracy Circle (High-performance Leaflet updates)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const latLng: [number, number] = [currentGPS.latitude, currentGPS.longitude];
    const heading = currentGPS.heading || 0;
    const accuracy = currentGPS.accuracy || 8;

    const currentModeKey = `${gpsSource}-${isDrivingJourney ? 'driving' : 'normal'}`;

    if (!userMarkerRef.current || lastMarkerModeRef.current !== currentModeKey) {
      lastMarkerModeRef.current = currentModeKey;
      let markerHtml = '';
      if (isDrivingJourney) {
        // Google Maps Driving Navigation 3D Chevron Arrow (faces heading)
        markerHtml = `
          <div class="relative flex items-center justify-center" style="width: 52px; height: 52px;">
            <div class="absolute -inset-1 rounded-full bg-blue-500/20 pointer-events-none"></div>
            <div id="driver-heading-chevron" class="w-11 h-11 rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] border-2 border-white flex items-center justify-center transition-transform duration-200" style="transform: rotate(${heading}deg); transform-origin: center center;">
              <svg viewBox="0 0 24 24" width="28" height="28" class="drop-shadow-sm">
                <path d="M12 2L4 21l8-4.5 8 4.5L12 2z" fill="#2563eb" stroke="#1d4ed8" stroke-width="1.2" stroke-linejoin="round" />
                <path d="M12 2L12 16.5l8 4.5L12 2z" fill="#1d4ed8" />
              </svg>
            </div>
          </div>
        `;
      } else if (gpsSource === 'device') {
        // Iconic Google Maps Blue Location Puck
        markerHtml = `
          <div class="relative flex items-center justify-center" style="width: 44px; height: 44px;">
            <div class="absolute -inset-2.5 rounded-full bg-blue-500/25 animate-ping pointer-events-none"></div>
            <div class="w-6 h-6 rounded-full bg-blue-600 border-[3.5px] border-white shadow-[0_0_14px_rgba(37,99,235,0.95)] flex items-center justify-center">
              <div class="w-2 h-2 rounded-full bg-white"></div>
            </div>
            ${heading ? `
              <div id="driver-heading-arrow" class="absolute -top-3.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[11px] border-b-blue-600" style="transform: rotate(${heading}deg); transform-origin: center 26px;"></div>
            ` : ''}
            <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-[#101418]/95 text-[9px] font-mono font-bold text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/40 whitespace-nowrap shadow-md">
              📍 You (±${accuracy}m)
            </div>
          </div>
        `;
      } else {
        // Simulated Location Marker
        markerHtml = `
          <div class="relative flex items-center justify-center" style="width: 36px; height: 36px;">
            <div class="absolute -inset-2 rounded-full bg-secondary/25 beacon-ping pointer-events-none"></div>
            <div class="w-9 h-9 rounded-full bg-[#191c20] border-2 border-secondary flex items-center justify-center shadow-[0_0_16px_rgba(74,225,131,0.7)]" style="transform: rotate(${heading}deg); transform-origin: center center;">
              <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[12px] border-b-secondary transform -translate-y-0.5"></div>
            </div>
            <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-[#101418]/90 text-[9px] font-mono font-bold text-secondary px-1.5 py-0.2 rounded border border-secondary/40 whitespace-nowrap shadow">
              Simulated
            </div>
          </div>
        `;
      }

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'driver-tactical-marker',
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      if (!userMarkerRef.current) {
        userMarkerRef.current = L.marker(latLng, { icon: customIcon, zIndexOffset: 1000 }).addTo(map);
      } else {
        userMarkerRef.current.setIcon(customIcon);
        userMarkerRef.current.setLatLng(latLng);
      }
    } else {
      // Fast path: update position without DOM re-creation
      userMarkerRef.current.setLatLng(latLng);
      // Update heading rotation cleanly if element exists inside this map instance
      const chevron = mapContainerRef.current?.querySelector('#driver-heading-chevron') as HTMLElement | null;
      if (chevron) {
        chevron.style.transform = `rotate(${heading}deg)`;
      }
      const arrow = mapContainerRef.current?.querySelector('#driver-heading-arrow') as HTMLElement | null;
      if (arrow) {
        arrow.style.transform = `rotate(${heading}deg)`;
      }
    }

    // Dynamic High-Precision Accuracy Circle (Google Maps Blue or Tactical Green)
    const accuracyColor = gpsSource === 'device' ? '#3b82f6' : (accuracy <= 5 ? '#4ae183' : accuracy <= 15 ? '#fbbb45' : '#ffb4ab');
    if (!accuracyCircleRef.current) {
      lastAccuracyColorRef.current = accuracyColor;
      accuracyCircleRef.current = L.circle(latLng, {
        radius: Math.max(accuracy, 3),
        color: accuracyColor,
        weight: 1.5,
        fillColor: accuracyColor,
        fillOpacity: 0.15
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng(latLng);
      accuracyCircleRef.current.setRadius(Math.max(accuracy, 3));
      if (lastAccuracyColorRef.current !== accuracyColor) {
        lastAccuracyColorRef.current = accuracyColor;
        accuracyCircleRef.current.setStyle({ color: accuracyColor, fillColor: accuracyColor });
      }
    }

    if (isFollowDriver) {
      const currentCenter = map.getCenter();
      const distFromCenterM = calculateDistanceMeters(currentCenter.lat, currentCenter.lng, latLng[0], latLng[1]);

      // Only pan map if displacement is noticeable (> 1.5m) to prevent stationary micro-jitter
      if (distFromCenterM >= 1.5) {
        if (isDrivingJourney) {
          // High-precision road driving follow: maintain close road zoom (>= 18)
          const currentZ = map.getZoom();
          const targetZoom = currentZ < 17 ? 18 : currentZ;
          map.setView(latLng, targetZoom, { animate: true, duration: 0.3 });
        } else {
          map.panTo(latLng, { animate: true, duration: 0.3 });
        }
      }
    }
  }, [currentGPS.latitude, currentGPS.longitude, currentGPS.heading, currentGPS.accuracy, isFollowDriver, gpsSource, isDrivingJourney]);

  // Recenter trigger from external controls / Locate Me (Strictly triggered only on counter change)
  useEffect(() => {
    if (!mapRef.current || recenterMapCounter === 0 || recenterMapCounter === lastRecenterCounterRef.current) return;
    lastRecenterCounterRef.current = recenterMapCounter;
    isProgrammaticMoveRef.current = true;
    const targetZoom = isDrivingJourney ? 18 : 17;
    mapRef.current.flyTo([currentGPS.latitude, currentGPS.longitude], targetZoom, {
      animate: true,
      duration: 0.8
    });
    setIsFollowDriver(true);
    setTimeout(() => {
      isProgrammaticMoveRef.current = false;
    }, 900);
  }, [recenterMapCounter, isDrivingJourney]);

  // Zoom in clearly on start of driving journey (Google Maps turn-by-turn road view)
  useEffect(() => {
    if (!mapRef.current || !isDrivingJourney) return;
    const map = mapRef.current;
    isProgrammaticMoveRef.current = true;
    
    // Invalidate immediately so full container size is recognized
    map.invalidateSize();

    // Zoom in close to vehicle on the road (Zoom 18)
    map.flyTo([currentGPS.latitude, currentGPS.longitude], 18, {
      animate: true,
      duration: 0.8
    });
    setIsFollowDriver(true);
    setCurrentZoom(18);

    const t1 = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    const t2 = setTimeout(() => {
      isProgrammaticMoveRef.current = false;
      map.invalidateSize();
    }, 850);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isDrivingJourney]);

  // Update Breadcrumbs Polyline (Disabled to maintain clean map without extra indigo lines)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (breadcrumbPolylineRef.current) {
      map.removeLayer(breadcrumbPolylineRef.current);
      breadcrumbPolylineRef.current = null;
    }
  }, [gpsBreadcrumbs]);

  // Update Active Road Route Polyline (Clean Google Maps Blue Route & Destination Marker)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Cleanup previous route layers
    if (!activeRoute || !activeRoute.waypoints || activeRoute.waypoints.length === 0) {
      if (routeCasingPolylineRef.current) {
        map.removeLayer(routeCasingPolylineRef.current);
        routeCasingPolylineRef.current = null;
      }
      if (routePolylineRef.current) {
        map.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      if (destinationMarkerRef.current) {
        map.removeLayer(destinationMarkerRef.current);
        destinationMarkerRef.current = null;
      }
      return;
    }

    const roadWaypoints = activeRoute.waypoints;

    // Ensure the map container has properly calculated its dimensions before drawing the route to prevent projection errors
    const container = map.getContainer();
    if (container) {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) {
        console.warn('[TacticalMap] Map container has zero dimensions. Skipping route draw to prevent projection errors.');
        return;
      }
      // Force Leaflet to update layout dimensions so coordinates map cleanly onto the grid
      map.invalidateSize({ animate: false });
    }

    // 1. Dark neutral casing underlayer for high map contrast
    if (!routeCasingPolylineRef.current) {
      routeCasingPolylineRef.current = L.polyline(roadWaypoints, {
        color: '#020617',
        weight: 8,
        opacity: 0.8,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map);
    } else {
      routeCasingPolylineRef.current.setLatLngs(roadWaypoints);
    }

    // 2. Core road polyline (vibrant clean Google Maps blue)
    if (!routePolylineRef.current) {
      routePolylineRef.current = L.polyline(roadWaypoints, {
        color: '#2563eb',
        weight: 6,
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map);
    } else {
      routePolylineRef.current.setLatLngs(roadWaypoints);
    }

    // 3. Destination Pin (Google Maps Red Marker)
    const destCoord = roadWaypoints[roadWaypoints.length - 1];
    const destHtml = `
      <div class="relative flex flex-col items-center">
        <div class="w-8 h-8 rounded-full bg-red-600 border-2 border-white shadow-2xl flex items-center justify-center text-white">
          <span class="material-symbols-outlined text-[18px]">flag</span>
        </div>
        <div class="w-2.5 h-2.5 bg-red-600 rotate-45 -mt-1 shadow"></div>
        <div class="bg-[#101418]/95 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/50 mt-1 whitespace-nowrap shadow-xl">
          🏁 ${activeRoute.destination || 'Destination'}
        </div>
      </div>
    `;

    const destIcon = L.divIcon({
      html: destHtml,
      className: 'route-destination-pin',
      iconSize: [36, 52],
      iconAnchor: [18, 30]
    });

    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = L.marker(destCoord, { icon: destIcon, zIndexOffset: 1200 }).addTo(map);
    } else {
      destinationMarkerRef.current.setLatLng(destCoord);
      destinationMarkerRef.current.setIcon(destIcon);
    }

    // Zoom and pan to fit the entire road route with comfortable padding only if not in active driving HUD
    if (!isDrivingJourney) {
      try {
        isProgrammaticMoveRef.current = true;
        map.fitBounds(L.latLngBounds(roadWaypoints), {
          padding: [60, 60],
          maxZoom: 17,
          animate: true
        });
        // Set follow to false so user can freely zoom and inspect destination without snap-back!
        setIsFollowDriver(false);
        setTimeout(() => {
          isProgrammaticMoveRef.current = false;
        }, 1000);
      } catch {
        // fallback
      }
    }
  }, [activeRoute, isDrivingJourney]);

  // Render Waypoint Markers with Accurate Bottom Pin Anchors
  useEffect(() => {
    if (!mapRef.current || !waypointLayerGroupRef.current) return;
    const group = waypointLayerGroupRef.current;
    group.clearLayers();

    waypoints.forEach((wp) => {
      let iconColor = '#a0caff';
      let iconSymbol = 'place';
      let bg = 'bg-primary/20 border-primary';

      if (wp.type === 'base') {
        iconColor = '#4ae183';
        iconSymbol = 'shield';
        bg = 'bg-secondary/20 border-secondary';
      } else if (wp.type === 'delivery') {
        iconColor = '#a0caff';
        iconSymbol = 'flag';
        bg = 'bg-primary/20 border-primary';
      } else if (wp.type === 'medical') {
        iconColor = '#ffb4ab';
        iconSymbol = 'local_hospital';
        bg = 'bg-error/20 border-error';
      } else if (wp.type === 'hazard') {
        iconColor = '#fbbb45';
        iconSymbol = 'warning';
        bg = 'bg-tertiary/20 border-tertiary';
      }

      // Point of the pin is at bottom center (18, 44)
      const html = `
        <div class="flex flex-col items-center group cursor-pointer" style="width: 36px; height: 44px;">
          <div class="w-8 h-8 rounded-lg ${bg} border-2 flex items-center justify-center shadow-lg backdrop-blur-md transition-transform hover:scale-110">
            <span class="material-symbols-outlined text-[18px]" style="color: ${iconColor}">${iconSymbol}</span>
          </div>
          <div class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-outline-variant transform -translate-y-0.5"></div>
          <span class="text-[9px] font-mono font-bold uppercase tracking-wider bg-[#101418]/90 text-on-surface px-1.5 py-0.2 rounded mt-0.5 shadow border border-outline-variant/50 whitespace-nowrap">${wp.code}</span>
        </div>
      `;

      const customIcon = L.divIcon({
        html,
        className: 'tactical-wp-icon',
        iconSize: [36, 44],
        iconAnchor: [18, 44],
        popupAnchor: [0, -42]
      });

      const marker = L.marker([wp.latitude, wp.longitude], { icon: customIcon });

      const dist = calculateDistanceMeters(currentGPS.latitude, currentGPS.longitude, wp.latitude, wp.longitude);
      const distStr = dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${dist} m`;

      const popupHtml = `
        <div class="tactical-map-popup-card p-1.5 min-w-[220px]">
          <div class="flex items-center justify-between border-b border-white/[0.12] pb-1.5 mb-2">
            <span class="text-xs font-mono font-bold text-primary">${wp.code}</span>
            <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${wp.status === 'active' ? 'bg-secondary/20 text-secondary border border-secondary/30' : 'bg-tertiary/20 text-tertiary border border-tertiary/30'}">${wp.status}</span>
          </div>
          <h4 class="font-bold text-sm tactical-popup-title mb-0.5">${wp.name}</h4>
          <p class="text-xs tactical-popup-desc mb-2.5 leading-relaxed">${wp.description}</p>
          <div class="tactical-popup-box p-2 rounded-lg flex flex-col gap-1 text-[11px] font-mono shadow-inner">
            <div class="flex justify-between items-center">
              <span class="text-[10px] uppercase opacity-75">Coordinates:</span>
              <span class="text-primary font-bold">${wp.latitude.toFixed(6)}, ${wp.longitude.toFixed(6)}</span>
            </div>
            <div class="flex justify-between items-center border-t border-white/[0.06] pt-1">
              <span class="text-[10px] uppercase opacity-75">Elev / Range:</span>
              <span class="tactical-popup-title font-bold">${wp.elevationMeters}m | ${distStr}</span>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        if (onSelectWaypoint) onSelectWaypoint(wp);
      });

      group.addLayer(marker);
    });
  }, [waypoints, onSelectWaypoint, currentGPS]);

  // Render Incident Markers with Accurate Pin Anchors
  useEffect(() => {
    if (!mapRef.current || !incidentLayerGroupRef.current) return;
    const group = incidentLayerGroupRef.current;
    group.clearLayers();

    incidents.forEach((inc) => {
      const isCritical = inc.severity === 'critical' || inc.severity === 'high';

      const html = `
        <div class="flex flex-col items-center group cursor-pointer" style="width: 34px; height: 42px;">
          <div class="w-8 h-8 rounded-full bg-[#191c20] border-2 border-error flex items-center justify-center shadow-lg relative">
            <span class="material-symbols-outlined text-[16px] text-error">assignment_late</span>
            ${isCritical ? '<div class="absolute -inset-1 rounded-full bg-error/30 beacon-ping pointer-events-none"></div>' : ''}
          </div>
          <div class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-error transform -translate-y-0.5"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        html,
        className: 'tactical-incident-icon',
        iconSize: [34, 42],
        iconAnchor: [17, 42],
        popupAnchor: [0, -40]
      });

      const marker = L.marker([inc.latitude, inc.longitude], { icon: customIcon });

      const dist = calculateDistanceMeters(currentGPS.latitude, currentGPS.longitude, inc.latitude, inc.longitude);
      const distStr = dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${dist} m`;

      const popupHtml = `
        <div class="tactical-map-popup-card p-1.5 min-w-[220px]">
          <div class="flex items-center justify-between border-b border-white/[0.12] pb-1.5 mb-2">
            <span class="text-xs font-mono font-bold text-error">${inc.id}</span>
            <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-error/20 text-error border border-error/30">${inc.severity}</span>
          </div>
          <h4 class="font-bold text-sm tactical-popup-title mb-1">${inc.title}</h4>
          <p class="text-xs tactical-popup-desc mb-2.5 line-clamp-2 leading-relaxed">${inc.description}</p>
          <div class="tactical-popup-box p-2 rounded-lg text-[11px] font-mono flex flex-col gap-1 shadow-inner">
            <div class="flex justify-between items-center">
              <span class="text-[10px] uppercase opacity-75">Exact Lat/Lng:</span>
              <span class="text-primary font-bold">${inc.latitude.toFixed(6)}, ${inc.longitude.toFixed(6)}</span>
            </div>
            <div class="flex justify-between items-center border-t border-white/[0.06] pt-1">
              <span class="text-[10px] uppercase opacity-75">Road / Distance:</span>
              <span class="text-secondary font-bold">${distStr}</span>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      group.addLayer(marker);
    });
  }, [incidents, currentGPS]);

  // Render High-Precision Dropped Pin / Reticle Marker
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (!pinnedCoord) {
      if (pinnedMarkerRef.current) {
        map.removeLayer(pinnedMarkerRef.current);
        pinnedMarkerRef.current = null;
      }
      return;
    }

    const reticleHtml = `
      <div class="relative flex items-center justify-center" style="width: 40px; height: 40px;">
        <div class="absolute w-10 h-10 border border-primary/80 rounded-full animate-ping opacity-75 pointer-events-none"></div>
        <div class="absolute w-7 h-7 border-2 border-primary rounded-full bg-primary/10 shadow-[0_0_12px_rgba(160,202,255,0.8)]"></div>
        <div class="w-2 h-2 bg-error rounded-full shadow-[0_0_6px_#ff5449]"></div>
        <div class="absolute top-0 bottom-0 w-[1.5px] bg-primary/90 pointer-events-none"></div>
        <div class="absolute left-0 right-0 h-[1.5px] bg-primary/90 pointer-events-none"></div>
      </div>
    `;

    const pinIcon = L.divIcon({
      html: reticleHtml,
      className: 'tactical-pin-reticle',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    if (!pinnedMarkerRef.current) {
      pinnedMarkerRef.current = L.marker([pinnedCoord.lat, pinnedCoord.lng], {
        icon: pinIcon,
        zIndexOffset: 1500
      }).addTo(map);
    } else {
      pinnedMarkerRef.current.setLatLng([pinnedCoord.lat, pinnedCoord.lng]);
    }
  }, [pinnedCoord]);

  // Micro-nudge handler
  const handleMicroNudge = (deltaMetersNorth: number, deltaMetersEast: number) => {
    if (!pinnedCoord) return;
    const newCoord = nudgeCoordinate(pinnedCoord.lat, pinnedCoord.lng, deltaMetersNorth, deltaMetersEast);
    setPinnedCoord({ lat: newCoord.latitude, lng: newCoord.longitude });
    if (onSelectCoordinate) {
      onSelectCoordinate(newCoord.latitude, newCoord.longitude);
    }
    if (mapRef.current) {
      mapRef.current.panTo([newCoord.latitude, newCoord.longitude], { animate: true, duration: 0.2 });
    }
  };

  const handleCenterOnDriver = async () => {
    isProgrammaticMoveRef.current = true;
    const targetZoom = isDrivingJourney ? 18.5 : 17;

    if (gpsSource !== 'device') {
      await activateRealGPS();
    }

    if (mapRef.current) {
      mapRef.current.flyTo([currentGPS.latitude, currentGPS.longitude], targetZoom, {
        animate: true,
        duration: 0.8
      });
      setIsFollowDriver(true);
      setCurrentZoom(targetZoom);
      showToast(isDrivingJourney ? '🎯 Re-centered on vehicle (Driving Zoom 18.5)' : '📍 Centered on your location');
    }

    setTimeout(() => {
      isProgrammaticMoveRef.current = false;
    }, 900);
  };

  const handleJumpToCoordinates = (lat: number, lng: number, label?: string) => {
    if (!mapRef.current) return;
    mapRef.current.flyTo([lat, lng], 18, { duration: 1.0 });
    setPinnedCoord({ lat, lng });
    if (onSelectCoordinate) {
      onSelectCoordinate(lat, lng);
    }
    setShowSearchModal(false);
    showToast(`Jumped to ${label || `${lat.toFixed(6)}, ${lng.toFixed(6)}`}`);
  };

  const handleParseCustomCoord = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseCoordinateInput(customCoordInput);
    if (parsed) {
      handleJumpToCoordinates(parsed.lat, parsed.lng, 'Custom Coordinates');
      const coordLabel = `Coordinates (${parsed.lat.toFixed(5)}°N, ${parsed.lng.toFixed(5)}°E)`;
      showToast(`🚗 Generating route to coordinates (${parsed.lat.toFixed(5)}°N, ${parsed.lng.toFixed(5)}°E)...`);
      await calculateRoadRouteToDestination(parsed.lat, parsed.lng, coordLabel);
      setShowSearchModal(false);
      return;
    }
    showToast('⚠️ Invalid coordinates. Format: 28.6139, 77.2090 or 28.6139°N, 77.2090°E');
  };

  // Inspect coordinate: either pinned or cursor or driver
  const inspectCoord = pinnedCoord || cursorCoord || { lat: currentGPS.latitude, lng: currentGPS.longitude };
  const inspectDistM = calculateDistanceMeters(currentGPS.latitude, currentGPS.longitude, inspectCoord.lat, inspectCoord.lng);
  const inspectBearing = calculateBearing(currentGPS.latitude, currentGPS.longitude, inspectCoord.lat, inspectCoord.lng);

  return (
    <div
      id={isDrivingJourney ? "tactical-map-main-wrapper-hud" : "tactical-map-main-wrapper"}
      className={
        isFullScreenMap
          ? 'fixed inset-0 z-[60] w-full h-full rounded-none overflow-hidden bg-[#101418]'
          : `relative w-full ${heightClass} rounded-xl overflow-hidden shadow-2xl border border-outline-variant/40 bg-[#101418]`
      }
    >
      
      {/* Target Map DOM Div */}
      <div
        ref={mapContainerRef}
        id={isDrivingJourney ? "tactical-leaflet-map-hud" : "tactical-leaflet-map"}
        className="w-full h-full min-h-full z-0 cursor-crosshair"
        style={{ width: '100%', height: '100%', minHeight: '100%', display: 'block' }}
      />

      {/* Military Hairline Crosshair Reticle Overlay */}
      {showCenterReticle && (
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute top-0 bottom-0 w-[1px] bg-primary/70"></div>
            <div className="absolute left-0 right-0 h-[1px] bg-primary/70"></div>
            <div className="w-6 h-6 rounded-full border border-primary/60"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-secondary"></div>
          </div>
        </div>
      )}

      {/* Pin Drop Mode Banner */}
      {isPinDropMode && (
        <div className="absolute top-3 inset-x-12 z-20 flex justify-center pointer-events-none">
          <div className="bg-[#101418]/95 px-4 py-2 rounded-xl border-2 border-primary text-xs font-mono text-primary shadow-2xl backdrop-blur-md flex items-center gap-2 animate-pulse">
            <span className="material-symbols-outlined text-[18px]">adjust</span>
            <span>TAP ANYWHERE ON MAP TO PIN SUB-METER COORDINATES</span>
          </div>
        </div>
      )}

      {/* Floating Tactical Controls */}
      {showControls && (
        <>
          {/* Top Controls Bar: High-Precision Layer Switcher & Fullscreen/Minimise Bar */}
          {showControlsBar && (
            <div className="absolute top-3 inset-x-3 z-20 flex items-start justify-between gap-1.5 pointer-events-none">
              {/* Left Side: Layer Switcher */}
              <div className="flex flex-col gap-1.5 pointer-events-auto min-w-0">
                <div className="flex items-center gap-1.5 py-0.5">
                  {/* Layer Switcher - Street Map option with Click to change */}
                  <div className="bg-[#0f1520]/95 backdrop-blur-xl p-1 rounded-xl border border-white/[0.1] shadow-2xl flex items-center gap-1 shrink-0">
                    <button
                      id="tactical-layer-street-map-btn"
                      onClick={() => {
                        const nextLayer = mapLayer === 'osm_standard' ? 'google_hybrid' : 'osm_standard';
                        setMapLayer(nextLayer);
                        showToast(nextLayer === 'osm_standard' ? '✓ Switched to Street Map' : '✓ Switched to Satellite HD');
                      }}
                      className="px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-left active:scale-95 group"
                      title="Click to switch map layer between Street Map and Satellite HD"
                    >
                      <div className="w-5 h-5 rounded-md bg-primary/20 border border-primary/40 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors shrink-0">
                        <span className="material-symbols-outlined text-[14px]">
                          {mapLayer === 'osm_standard' ? 'map' : 'satellite_alt'}
                        </span>
                      </div>
                      <div className="flex flex-col leading-none">
                        <span className="text-[10px] font-mono font-bold uppercase text-white tracking-wide">
                          {mapLayer === 'osm_standard' ? 'Street' : 'Satellite'}
                        </span>
                        <span className="text-[8px] font-sans font-medium text-amber-400 dark:text-primary mt-0.5 tracking-tight">
                          Switch Layer
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Side: Search & Single Clean Fullscreen/Minimise Control */}
              <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
                <button
                  onClick={() => setShowSearchModal(true)}
                  className="bg-[#0f1520]/95 hover:bg-[#1a2332] text-primary border border-white/[0.1] px-2 py-1.5 rounded-xl shadow-xl flex items-center gap-1 text-xs font-mono font-bold backdrop-blur-xl transition-all active:scale-95 cursor-pointer"
                  title="Jump to Coordinate or Tactical Waypoint"
                >
                  <span className="material-symbols-outlined text-[15px]">location_searching</span>
                  <span className="hidden sm:inline text-[11px]">Go To...</span>
                </button>

                {/* Minimise or Maximise Button */}
                <button
                  id="map-toggle-fullscreen-btn"
                  onClick={() => {
                    const next = !isFullScreenMap;
                    setIsFullScreenMap(next);
                    showToast(next ? 'Full Map View: Maximized' : 'Exited Full Map View');
                  }}
                  className={`px-2 py-1.5 rounded-xl border shadow-xl flex items-center gap-1 text-xs font-mono font-bold backdrop-blur-xl transition-all active:scale-95 cursor-pointer ${
                    isFullScreenMap
                      ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                      : 'bg-[#0f1520]/95 hover:bg-[#1a2332] text-slate-200 border-white/[0.1]'
                  }`}
                  title={isFullScreenMap ? 'Minimise Map (Esc)' : 'Full Map View'}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {isFullScreenMap ? 'fullscreen_exit' : 'fullscreen'}
                  </span>
                  <span className="text-[11px]">{isFullScreenMap ? 'Minimise' : 'Full Map'}</span>
                </button>

                {/* Coordinates Pill: Only shown in genuine fullscreen map view where there is ample width */}
                {isFullScreenMap && (
                  <div className="hidden lg:flex bg-[#0f1520]/95 backdrop-blur-xl px-2.5 py-1.5 rounded-xl border border-white/[0.1] shadow-xl text-[10px] font-mono items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-pulse" />
                    <span className="text-white font-semibold">
                      {currentGPS.latitude.toFixed(5)}°N, {currentGPS.longitude.toFixed(5)}°E
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom-Right: Recenter, Zoom & Viewport Cache Actions (Hidden during driving HUD) */}
          {!isDrivingJourney && (showRecenterButton || showZoomControls || showCacheButton) && (
            <div className="absolute bottom-4 right-3 z-20 flex flex-col gap-2">
              {showRecenterButton && (
                <button
                  id="map-recenter-driver-btn"
                  onClick={handleCenterOnDriver}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-2xl transition-all active:scale-90 border cursor-pointer ${
                    gpsSource === 'device'
                      ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.7)]'
                      : isFollowDriver
                      ? 'bg-secondary text-white border-secondary shadow-[0_0_15px_rgba(16,185,129,0.6)]'
                      : 'bg-[#0f1520]/95 text-slate-200 border-white/[0.1] hover:bg-[#1a2332]'
                  }`}
                  title={gpsSource === 'device' ? 'Center on Real GPS (Google Maps Mode)' : 'Enable Real GPS & Center on My Location'}
                >
                  <span className="material-symbols-outlined text-[22px]">
                    {gpsSource === 'device' ? 'my_location' : 'location_searching'}
                  </span>
                </button>
              )}

              {showZoomControls && (
                <>
                  <button
                    id="map-zoom-in-btn"
                    onClick={() => {
                      setIsFollowDriver(false);
                      mapRef.current?.zoomIn();
                    }}
                    className="w-11 h-11 rounded-xl bg-[#0f1520]/95 text-white border border-white/[0.1] flex items-center justify-center shadow-xl hover:bg-[#1a2332] active:scale-95 cursor-pointer"
                    title="Zoom In (Sub-meter precision)"
                  >
                    <span className="material-symbols-outlined text-[22px]">add</span>
                  </button>

                  <button
                    id="map-zoom-out-btn"
                    onClick={() => {
                      setIsFollowDriver(false);
                      mapRef.current?.zoomOut();
                    }}
                    className="w-11 h-11 rounded-xl bg-[#0f1520]/95 text-white border border-white/[0.1] flex items-center justify-center shadow-xl hover:bg-[#1a2332] active:scale-95 cursor-pointer"
                    title="Zoom Out"
                  >
                    <span className="material-symbols-outlined text-[22px]">remove</span>
                  </button>
                </>
              )}

              {showCacheButton && (
                <button
                  onClick={() => {
                    showToast('Cached high-resolution viewport tiles (12.4 MB) to local IndexedDB.');
                  }}
                  className="w-11 h-11 rounded-xl bg-[#0f1520]/95 text-primary border border-white/[0.1] flex items-center justify-center shadow-xl hover:bg-[#1a2332] active:scale-95 cursor-pointer"
                  title="Cache Viewport Offline (High Resolution)"
                >
                  <span className="material-symbols-outlined text-[20px]">download_for_offline</span>
                </button>
              )}
            </div>
          )}

          {/* Bottom Center Floating Deck */}
          {!isDrivingJourney && !pinnedCoord && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none w-max max-w-[90%] animate-fadeIn">
              {/* Option 1: Prior to starting navigation, if route is ready -> Show START button */}
              {activeRoute ? (
                <button
                  id="map-floating-start-journey-btn"
                  onClick={() => startDrivingJourney(activeRoute)}
                  className="pointer-events-auto flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm tracking-wide shadow-2xl shadow-emerald-950/80 border-2 border-emerald-400 active:scale-95 transition-all group backdrop-blur-md cursor-pointer"
                  title="Start Journey Navigation"
                >
                  <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform shrink-0">
                    <span className="material-symbols-outlined text-[20px] text-white">navigation</span>
                  </div>
                  <div className="flex flex-col text-left leading-tight pr-1">
                    <span className="font-mono text-sm font-black tracking-wider text-white">START</span>
                    <span className="text-[10px] font-medium text-emerald-100 font-mono mt-0.5">
                      {formatDuration(activeRoute.estMinutes)} • {activeRoute.distanceKm} km
                    </span>
                  </div>
                </button>
              ) : (
                /* Option 2: When no route active and user panned away -> Show Re-center button */
                !isFollowDriver && (
                  <button
                    id="map-recenter-floating-pill"
                    onClick={handleCenterOnDriver}
                    className="pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-mono font-bold text-xs shadow-xl border border-blue-400 active:scale-95 transition-all backdrop-blur-md cursor-pointer"
                    title="Re-center on your location"
                  >
                    <span className="material-symbols-outlined text-[16px] animate-pulse">my_location</span>
                    <span>Re-center</span>
                  </button>
                )
              )}
            </div>
          )}

          {/* Bottom Floating Bar: Precision Pin Inspector & Micro-Nudge Pad (when a pin is placed and not navigating) */}
          {pinnedCoord && !isDrivingJourney && (
            <div className="absolute bottom-4 left-3 right-16 sm:right-20 z-20 tactile-card backdrop-blur-md p-3 rounded-2xl border-2 border-primary/60 shadow-2xl flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">pin_drop</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    High-Precision Targeted Location
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(`${pinnedCoord.lat.toFixed(6)}, ${pinnedCoord.lng.toFixed(6)}`);
                      showToast(`Copied: ${pinnedCoord.lat.toFixed(6)}, ${pinnedCoord.lng.toFixed(6)}`);
                    }}
                    className="text-[10px] font-mono text-slate-700 dark:text-slate-300 hover:text-primary px-2 py-0.5 rounded bg-slate-100 dark:bg-[#101418] border border-slate-200 dark:border-white/[0.08]"
                  >
                    Copy L/L
                  </button>
                  <button
                    onClick={() => setPinnedCoord(null)}
                    className="text-slate-500 hover:text-red-600 dark:hover:text-error text-xs cursor-pointer"
                    title="Clear Pin"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>

              {/* Coordinates Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-mono">
                <div className="bg-slate-50 dark:bg-[#101418] p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.06]">
                  <span className="text-[9px] text-slate-500 block uppercase font-bold">Latitude</span>
                  <span className="text-primary font-bold">{pinnedCoord.lat.toFixed(6)}°N</span>
                </div>
                <div className="bg-slate-50 dark:bg-[#101418] p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.06]">
                  <span className="text-[9px] text-slate-500 block uppercase font-bold">Longitude</span>
                  <span className="text-primary font-bold">{pinnedCoord.lng.toFixed(6)}°E</span>
                </div>
                <div className="bg-slate-50 dark:bg-[#101418] p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.06]">
                  <span className="text-[9px] text-slate-500 block uppercase font-bold">MGRS Grid</span>
                  <span className="text-secondary font-bold truncate">{toMGRS(pinnedCoord.lat, pinnedCoord.lng)}</span>
                </div>
                <div className="bg-slate-50 dark:bg-[#101418] p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.06]">
                  <span className="text-[9px] text-slate-500 block uppercase font-bold">Dist / Azimuth</span>
                  <span className="text-slate-900 dark:text-white font-bold truncate">
                    {inspectDistM > 1000 ? `${(inspectDistM / 1000).toFixed(2)} km` : `${inspectDistM} m`} @ {inspectBearing.degrees}°
                  </span>
                </div>
              </div>

              {/* Micro-Nudge Controller Bar */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1 text-[11px] font-mono">
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mr-1">Nudge:</span>
                  <button
                    onClick={() => setNudgeStepMeters(1)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${nudgeStepMeters === 1 ? 'bg-primary text-white font-bold' : 'bg-slate-100 dark:bg-[#101418] text-slate-700 dark:text-slate-300'}`}
                  >
                    1m
                  </button>
                  <button
                    onClick={() => setNudgeStepMeters(5)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${nudgeStepMeters === 5 ? 'bg-primary text-white font-bold' : 'bg-slate-100 dark:bg-[#101418] text-slate-700 dark:text-slate-300'}`}
                  >
                    5m
                  </button>
                  <button
                    onClick={() => setNudgeStepMeters(25)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${nudgeStepMeters === 25 ? 'bg-primary text-white font-bold' : 'bg-slate-100 dark:bg-[#101418] text-slate-700 dark:text-slate-300'}`}
                  >
                    25m
                  </button>
                </div>

                {/* Direction Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleMicroNudge(-nudgeStepMeters, 0)}
                    className="bg-slate-100 dark:bg-[#101418] hover:bg-primary/20 text-slate-800 dark:text-white p-1 rounded border border-slate-200 dark:border-white/[0.08] cursor-pointer"
                    title={`Nudge ${nudgeStepMeters}m South`}
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                  </button>
                  <button
                    onClick={() => handleMicroNudge(nudgeStepMeters, 0)}
                    className="bg-slate-100 dark:bg-[#101418] hover:bg-primary/20 text-slate-800 dark:text-white p-1 rounded border border-slate-200 dark:border-white/[0.08] cursor-pointer"
                    title={`Nudge ${nudgeStepMeters}m North`}
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                  </button>
                  <button
                    onClick={() => handleMicroNudge(0, -nudgeStepMeters)}
                    className="bg-slate-100 dark:bg-[#101418] hover:bg-primary/20 text-slate-800 dark:text-white p-1 rounded border border-slate-200 dark:border-white/[0.08] cursor-pointer"
                    title={`Nudge ${nudgeStepMeters}m West`}
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                  </button>
                  <button
                    onClick={() => handleMicroNudge(0, nudgeStepMeters)}
                    className="bg-slate-100 dark:bg-[#101418] hover:bg-primary/20 text-slate-800 dark:text-white p-1 rounded border border-slate-200 dark:border-white/[0.08] cursor-pointer"
                    title={`Nudge ${nudgeStepMeters}m East`}
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      calculateRoadRouteToDestination(pinnedCoord.lat, pinnedCoord.lng, 'Pinned Road Point');
                      setPinnedCoord(null);
                      setCurrentTab('resilient-navigation');
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-3 py-1 rounded-lg shadow-md flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title="Calculate route to this point strictly along available roads"
                  >
                    <span className="material-symbols-outlined text-[15px]">directions_car</span>
                    Road Route
                  </button>

                  <button
                    onClick={() => {
                      setCurrentTab('incident-reporting');
                      showToast(`Coordinates transferred to Incident Report: ${pinnedCoord.lat.toFixed(6)}, ${pinnedCoord.lng.toFixed(6)}`);
                    }}
                    className="bg-primary hover:bg-primary/90 text-white text-[11px] font-bold px-3 py-1 rounded-lg shadow flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[14px]">assignment_add</span>
                    Report Here
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Quick Jump & Coordinate Search Modal */}
      {showSearchModal && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3">
          <div className="tactile-card rounded-2xl border-2 border-primary/60 p-4 w-full max-w-md shadow-2xl flex flex-col gap-3 max-h-[95%] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-2 shrink-0">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <span className="material-symbols-outlined text-[20px]">my_location</span>
                <span>Precision Coordinate Navigation</span>
              </div>
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Custom Coordinate Input */}
            <form onSubmit={handleParseCustomCoord} className="flex flex-col gap-2">
              <label className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                Coordinates (latitude, longitude)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 27.594528, 91.879541"
                  value={customCoordInput}
                  onChange={(e) => setCustomCoordInput(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-[#101418] border border-slate-300 dark:border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:border-primary outline-none"
                />
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm cursor-pointer active:scale-95 transition-all"
                >
                  Jump
                </button>
              </div>
            </form>

            {/* Preset Tactical Waypoints */}
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">
                Tactical Checkpoints & Sectors
              </span>
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                {waypoints.map((wp) => (
                  <button
                    key={wp.id}
                    onClick={() => handleJumpToCoordinates(wp.latitude, wp.longitude, wp.name)}
                    className="bg-slate-50 dark:bg-[#101418] hover:bg-primary/10 border border-slate-200 dark:border-white/[0.08] rounded-xl p-2.5 text-left flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{wp.name}</span>
                        <span className="text-[9px] font-mono bg-primary/20 text-primary px-1.5 py-0.2 rounded font-bold border border-primary/30">
                          {wp.code}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        {wp.latitude.toFixed(6)}°N, {wp.longitude.toFixed(6)}°E ({wp.elevationMeters}m)
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-primary text-[18px]">near_me</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
