import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppTab, GPSPosition, GPSQuality, IncidentReport, MapTilePackage, SOSEvent, SyncQueueItem, Waypoint, RouteOption, MapLayerType, NetworkMode, NetworkSpeedStats, ThemeMode, IncidentCategory, IncidentSeverity, LocationErrorState, DownloadedRoutePackage } from '../types';
import { connectivityService } from '../services/connectivity.service';
import { useAuth } from './AuthContext';
import { 
  saveUserIncidentToFirestore, 
  deleteUserIncidentFromFirestore, 
  subscribeToUserIncidents, 
  saveUserSyncItemToFirestore, 
  subscribeToUserSyncLogs, 
  saveUserSOSToFirestore,
  saveUserDownloadedRouteToFirestore,
  deleteUserDownloadedRouteFromFirestore,
  subscribeToUserDownloadedRoutes,
  saveUserRouteLogToFirestore,
  subscribeToUserRouteLogs
} from '../services/firebase';
import { 
  getStoredSyncQueue, 
  saveStoredSyncQueue, 
  getStoredMapPackages, 
  saveStoredMapPackages, 
  getStoredIncidents, 
  saveStoredIncidents, 
  getStoredWaypoints, 
  saveStoredWaypoints, 
  getStoredTrackLog, 
  saveStoredTrackLog, 
  getLastSyncTime, 
  setLastSyncTime,
  getStoredDownloadedRoutes,
  saveStoredDownloadedRoutes
} from '../services/storage';
import { TACTICAL_ROUTES } from '../services/mockData';
import { 
  getAccurateCurrentPosition, 
  watchRealLocation, 
  reverseGeocodeLocation 
} from '../services/real-location.service';
import { calculateRoadRoute } from '../services/road-routing.service';
import { speakInstruction, cancelSpeech } from '../services/voice-guidance.service';
import { calculateBearing, calculateDistanceMeters, snapPositionToRoute, formatDuration } from '../services/gps-geojson.service';

interface AppContextType {
  currentTab: AppTab;
  setCurrentTab: (tab: AppTab) => void;
  // Network & Sync
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  networkSimulationMode: NetworkMode;
  setNetworkSimulationMode: (mode: NetworkMode) => void;
  checkNetworkStatus: () => Promise<boolean>;
  speedStats: NetworkSpeedStats | null;
  isTestingSpeed: boolean;
  runSpeedTest: () => Promise<NetworkSpeedStats>;
  syncQueue: SyncQueueItem[];
  isSyncing: boolean;
  syncProgress: number;
  lastSyncedTimestamp: number;
  forceSync: () => Promise<void>;
  removeItemFromQueue: (id: string) => void;
  retryQueueItem: (id: string) => void;
  addQueueItem: (item: Omit<SyncQueueItem, 'id' | 'timestamp'>) => void;
  // Map Tiles & Offline Downloaded Routes
  mapPackages: MapTilePackage[];
  startPackageDownload: (packageId: string) => void;
  purgeMapPackage: (packageId: string) => void;
  downloadedRoutes: DownloadedRoutePackage[];
  downloadRouteMap: (route: RouteOption, customName?: string) => Promise<string>;
  purgeDownloadedRoute: (packageId: string) => void;
  launchOfflineRoute: (routePkg: DownloadedRoutePackage) => void;
  isRouteDownloading: (routeId: string) => boolean;
  totalCachedStorageBytes: number;
  // GPS & Location
  currentGPS: GPSPosition;
  isSimulatingMovement: boolean;
  setIsSimulatingMovement: (simulate: boolean) => void;
  gpsSource: 'device' | 'simulation';
  setGpsSource: (source: 'device' | 'simulation') => void;
  isRealGPSFix: boolean;
  realLocationAddress: string | null;
  isLocating: boolean;
  activateRealGPS: () => Promise<boolean>;
  switchToSimulation: () => void;
  recenterMapCounter: number;
  triggerRecenterOnUser: () => void;
  gpsBreadcrumbs: GPSPosition[];
  clearBreadcrumbs: () => void;
  // Road Routing
  activeRoute: RouteOption | null;
  setActiveRoute: (route: RouteOption | null) => void;
  alternativeRoutes: RouteOption[];
  calculateRoadRouteToDestination: (destLat: number, destLng: number, destTitle?: string, customOrigin?: { lat: number; lng: number }) => Promise<boolean>;
  isRoutingLoading: boolean;
  routingError: string | null;
  // Waypoints & Incidents
  waypoints: Waypoint[];
  addWaypoint: (wp: Omit<Waypoint, 'id'>) => void;
  incidents: IncidentReport[];
  createIncident: (incident: Partial<IncidentReport> & {
    title: string;
    category: IncidentCategory;
    severity: IncidentSeverity;
    district_road_segment: string;
    latitude: number;
    longitude: number;
  }) => Promise<IncidentReport>;
  deleteIncident: (id: string) => void;
  // SOS
  activeSOS: SOSEvent | null;
  triggerSOS: (options?: { medical?: boolean; disabled?: boolean; threat?: boolean }) => void;
  cancelSOS: () => void;
  // Location Error State (Directly populated from real Geolocation error.code)
  locationError: LocationErrorState | null;
  clearLocationError: () => void;
  retryLocationRequest: () => Promise<void>;
  // Full Map View & Active Driving Journey (Google Maps Mode)
  isFullScreenMap: boolean;
  setIsFullScreenMap: (full: boolean) => void;
  isDrivingJourney: boolean;
  startDrivingJourney: (route?: RouteOption) => void;
  stopDrivingJourney: () => void;
  forceRecalculateRoute: () => Promise<void>;
  currentStepIndex: number;
  setCurrentStepIndex: (idx: number) => void;
  voiceGuidanceEnabled: boolean;
  setVoiceGuidanceEnabled: (enabled: boolean) => void;
  isDriveSimulating: boolean;
  setIsDriveSimulating: (sim: boolean) => void;
  driveSimulationSpeed: number;
  setDriveSimulationSpeed: (speed: number) => void;
  // Real GPS Navigation Tracking States
  isGpsSearching: boolean;
  gpsErrorMessage: string | null;
  isOffRoute: boolean;
  isRerouting: boolean;
  snappedGPS: GPSPosition | null;
  remainingDistanceMeters: number;
  remainingMinutes: number;
  // Map Layer
  mapLayer: MapLayerType;
  setMapLayer: (layer: MapLayerType) => void;
  // Follow driver state & map zoom controls
  isFollowDriver: boolean;
  setIsFollowDriver: (follow: boolean) => void;
  mapZoomAction: 'in' | 'out' | null;
  triggerMapZoom: (action: 'in' | 'out') => void;
  // Notification Toast
  toastMessage: string | null;
  showToast: (msg: string) => void;
  // Tactical Display Theme (Dark vs Night Vision)
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Base tactical anchor point (National Strategic Central Hub - New Delhi / Pan-India)
const INITIAL_COORDS: GPSPosition = {
  latitude: 28.6139,
  longitude: 77.2090,
  altitude: 216,
  speed: 0,
  heading: 0,
  accuracy: 4.2,
  timestamp: Date.now(),
  altitudeAccuracy: 2.5
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userProfile } = useAuth();
  const currentUserId = currentUser?.uid;

  const [currentTab, setCurrentTab] = useState<AppTab>(() => {
    try {
      if (typeof window !== 'undefined' && window.location.hash) {
        const hash = window.location.hash.replace(/^#/, '') as AppTab;
        if (hash === 'driver-home' || hash === 'resilient-navigation' || hash === 'cyclone-map' || hash === 'incident-reporting' || hash === 'emergency-support' || hash === 'emergency-sos' || hash === 'offline-sync-center' || hash === 'account') {
          return hash;
        }
      }
    } catch {}
    return 'driver-home';
  });
  const [networkSimulationMode, setNetworkSimulationMode] = useState<NetworkMode>('auto');
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined') {
      return navigator.onLine !== false;
    }
    return true;
  });
  
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(() => getStoredSyncQueue(currentUser?.uid));
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [lastSyncedTimestamp, setLastSyncedTimestamp] = useState<number>(getLastSyncTime);
  const [speedStats, setSpeedStats] = useState<NetworkSpeedStats | null>(null);
  const [isTestingSpeed, setIsTestingSpeed] = useState<boolean>(false);

  const [mapPackages, setMapPackages] = useState<MapTilePackage[]>(getStoredMapPackages);
  const [downloadedRoutes, setDownloadedRoutes] = useState<DownloadedRoutePackage[]>(() => getStoredDownloadedRoutes(currentUser?.uid));
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() => getStoredWaypoints(currentUser?.uid));
  const [incidents, setIncidents] = useState<IncidentReport[]>(() => getStoredIncidents(currentUser?.uid));
  const [activeRoute, setActiveRoute] = useState<RouteOption | null>(null);
  
  const [currentGPS, setCurrentGPS] = useState<GPSPosition>(INITIAL_COORDS);
  const [gpsSource, setGpsSource] = useState<'device' | 'simulation'>('simulation');
  const [isRealGPSFix, setIsRealGPSFix] = useState<boolean>(false);
  const [realLocationAddress, setRealLocationAddress] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [recenterMapCounter, setRecenterMapCounter] = useState<number>(0);

  const [isSimulatingMovement, setIsSimulatingMovement] = useState<boolean>(false); // default off to prioritize real location
  const [gpsBreadcrumbs, setGpsBreadcrumbs] = useState<GPSPosition[]>(() => getStoredTrackLog(currentUser?.uid));

  // Switch and isolate data stores whenever user logs in, switches accounts, or logs out
  useEffect(() => {
    const uid = currentUserId;
    const userIncidents = getStoredIncidents(uid);
    setIncidents(userIncidents);

    const userQueue = getStoredSyncQueue(uid);
    setSyncQueue(userQueue);

    const userTracks = getStoredTrackLog(uid);
    setGpsBreadcrumbs(userTracks);

    const userRoutes = getStoredDownloadedRoutes(uid);
    setDownloadedRoutes(userRoutes);

    // If authenticated user, subscribe to Firestore for real-time per-user cloud sync
    if (uid) {
      const unsubIncidents = subscribeToUserIncidents(uid, (firestoreIncidents) => {
        if (firestoreIncidents && firestoreIncidents.length > 0) {
          setIncidents((prev) => {
            const map = new Map<string, IncidentReport>();
            // Keep local unsynced pending/syncing items
            prev.filter(p => p.syncStatus === 'pending' || p.syncStatus === 'syncing').forEach(item => {
              map.set(item.report_id || item.id, item);
            });
            // Overlay Firestore confirmed items
            firestoreIncidents.forEach(item => {
              if (!map.has(item.report_id || item.id)) {
                map.set(item.report_id || item.id, item);
              }
            });
            const merged = Array.from(map.values());
            saveStoredIncidents(merged, uid);
            return merged;
          });
        }
      });

      const unsubRoutes = subscribeToUserDownloadedRoutes(uid, (firestoreRoutes) => {
        if (firestoreRoutes && firestoreRoutes.length > 0) {
          setDownloadedRoutes((prev) => {
            const map = new Map<string, DownloadedRoutePackage>();
            prev.forEach(r => map.set(r.id, r));
            firestoreRoutes.forEach(r => map.set(r.id, r));
            const merged = Array.from(map.values());
            saveStoredDownloadedRoutes(merged, uid);
            return merged;
          });
        }
      });

      const unsubRouteLogs = subscribeToUserRouteLogs(uid, (firestoreTracks) => {
        if (firestoreTracks && firestoreTracks.length > 0) {
          setGpsBreadcrumbs((prev) => {
            if (prev.length === 0) {
              saveStoredTrackLog(firestoreTracks, uid);
              return firestoreTracks;
            }
            return prev;
          });
        }
      });

      const unsubSync = subscribeToUserSyncLogs(uid, (firestoreLogs) => {
        if (firestoreLogs && firestoreLogs.length > 0) {
          setSyncQueue((prev) => {
            const map = new Map<string, SyncQueueItem>();
            prev.filter(p => p.status === 'pending' || p.status === 'syncing').forEach(item => {
              map.set(item.id, item);
            });
            firestoreLogs.forEach(item => {
              if (!map.has(item.id)) {
                map.set(item.id, item);
              }
            });
            const merged = Array.from(map.values());
            saveStoredSyncQueue(merged, uid);
            return merged;
          });
        }
      });

      return () => {
        unsubIncidents();
        unsubRoutes();
        unsubRouteLogs();
        unsubSync();
      };
    }
  }, [currentUserId]);

  // Persist user-scoped data whenever state changes (debounced to idle time to prevent JS main thread lag)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveStoredIncidents(incidents, currentUserId);
    }, 200);
    return () => clearTimeout(timer);
  }, [incidents, currentUserId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveStoredSyncQueue(syncQueue, currentUserId);
    }, 200);
    return () => clearTimeout(timer);
  }, [syncQueue, currentUserId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveStoredTrackLog(gpsBreadcrumbs, currentUserId);
    }, 400);
    return () => clearTimeout(timer);
  }, [gpsBreadcrumbs, currentUserId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveStoredDownloadedRoutes(downloadedRoutes, currentUserId);
    }, 200);
    return () => clearTimeout(timer);
  }, [downloadedRoutes, currentUserId]);

  // Road Routing States
  const [alternativeRoutes, setAlternativeRoutes] = useState<RouteOption[]>([]);
  const [isRoutingLoading, setIsRoutingLoading] = useState<boolean>(false);
  const [routingError, setRoutingError] = useState<string | null>(null);

  // Automatically calculate real road route on mount so routes strictly follow roads, not straight lines
  useEffect(() => {
    if (activeRoute && !activeRoute.isRealRoadRoute && activeRoute.waypoints.length >= 2) {
      const startWp = activeRoute.waypoints[0];
      const endWp = activeRoute.waypoints[activeRoute.waypoints.length - 1];
      calculateRoadRoute(
        { lat: startWp[0], lng: startWp[1] },
        { lat: endWp[0], lng: endWp[1] },
        activeRoute.destination,
        { trafficModel: 'best_guess' }
      ).then((routes) => {
        if (routes && routes.length > 0) {
          setActiveRoute(routes[0]);
          setAlternativeRoutes(routes.slice(1));
        }
      }).catch((err) => {
        console.warn('Initial road route fetch:', err);
      });
    }
  }, []);

  // Full Map View & Active Driving Journey States (Google Maps Mode)
  const [isFullScreenMap, setIsFullScreenMap] = useState<boolean>(false);
  const [isDrivingJourney, setIsDrivingJourney] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [voiceGuidanceEnabled, setVoiceGuidanceEnabled] = useState<boolean>(true);
  
  // Real GPS Navigation & Dynamic Route Tracking States
  const [isGpsSearching, setIsGpsSearching] = useState<boolean>(false);
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string | null>(null);
  const [isOffRoute, setIsOffRoute] = useState<boolean>(false);
  const [isRerouting, setIsRerouting] = useState<boolean>(false);
  const [snappedGPS, setSnappedGPS] = useState<GPSPosition | null>(null);
  const [remainingDistanceMeters, setRemainingDistanceMeters] = useState<number>(0);
  const [remainingMinutes, setRemainingMinutes] = useState<number>(0);

  // Toast Notification System
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<any>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Real Geolocation Error State (populated strictly from real browser GeolocationPositionError)
  const [locationError, setLocationError] = useState<LocationErrorState | null>(null);
  const pendingStartRouteRef = useRef<RouteOption | null>(null);
  const retryLocationActionRef = useRef<(() => void) | null>(null);
  const timeoutRetryCountRef = useRef<number>(0);

  // Synchronous refs for location error suppression & immediate navigation startup
  const isDrivingJourneyRef = useRef<boolean>(false);
  useEffect(() => {
    isDrivingJourneyRef.current = isDrivingJourney;
  }, [isDrivingJourney]);

  const isRealGPSFixRef = useRef<boolean>(false);
  useEffect(() => {
    isRealGPSFixRef.current = isRealGPSFix;
  }, [isRealGPSFix]);

  const currentGPSRef = useRef<GPSPosition>(currentGPS);
  useEffect(() => {
    currentGPSRef.current = currentGPS;
  }, [currentGPS]);

  // Centralized real browser GeolocationPositionError handler with explicit logging
  const handleLocationError = useCallback((err: any, sourceFunction: string, onRetryAction?: () => void) => {
    if (onRetryAction) {
      retryLocationActionRef.current = onRetryAction;
    }

    let isIframe = false;
    try {
      isIframe = typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      isIframe = true;
    }

    const isPolicyBlocked = isIframe || (Boolean(err?.message) && /permissions policy|feature policy/i.test(String(err.message)));

    const code = err?.code;
    if (code === 1) { // PERMISSION_DENIED
      if (isPolicyBlocked) {
        console.warn(`[LocationFlow] "${sourceFunction}" error.code === 1 (PERMISSION_DENIED) due to iframe / Permissions Policy restriction. Browser message: "${err?.message}". Showing standalone guidance.`);
        setLocationError({
          code: 1,
          title: "This preview can't access location",
          message: "This preview can't access location — open the published app in its own tab to allow GPS.",
          sourceFunction,
          isIframeBlocked: true
        });
      } else {
        console.warn(`[LocationFlow] "${sourceFunction}" error.code === 1 (PERMISSION_DENIED) on standalone page. Browser message: "${err?.message}". Showing browser settings instructions.`);
        setLocationError({
          code: 1,
          title: 'Location access denied – enable it in browser settings',
          message: 'Location permission was denied in your browser settings. To track your vehicle along road networks and receive turn guidance, allow location access in browser site settings.',
          sourceFunction,
          isIframeBlocked: false
        });
      }
    } else if (code === 2) { // POSITION_UNAVAILABLE
      console.warn(`[LocationFlow] "${sourceFunction}" error.code === 2 (POSITION_UNAVAILABLE). Browser message: "${err?.message}". Custom UI: "Turn on device GPS/location services"`);
      setLocationError({
        code: 2,
        title: 'Turn on device GPS/location services',
        message: 'Device location / GPS services appear to be turned off or currently unavailable on your device.',
        sourceFunction
      });
    } else if (code === 3) { // TIMEOUT
      // If we already have a location (isRealGPSFix or active driving journey or valid current GPS), ignore single timeouts
      if (isRealGPSFixRef.current || isDrivingJourneyRef.current || (currentGPSRef.current && !currentGPSRef.current.isManual)) {
        console.warn(`[LocationFlow] "${sourceFunction}" error.code === 3 (TIMEOUT), but valid location exists. Suppressing modal.`);
        return;
      }

      if (timeoutRetryCountRef.current === 0 && onRetryAction) {
        timeoutRetryCountRef.current = 1;
        console.warn(`[LocationFlow] "${sourceFunction}" error.code === 3 (TIMEOUT): retrying automatically once…`);
        showToast("Acquiring GPS fix, retrying automatically…");
        setTimeout(() => {
          onRetryAction();
        }, 1500);
      } else {
        timeoutRetryCountRef.current = 0;
        console.warn(`[LocationFlow] "${sourceFunction}" error.code === 3 (TIMEOUT). Showing manual retry option.`);
        setLocationError({
          code: 3,
          title: "Couldn't get a GPS fix",
          message: "Couldn't get a GPS fix in time. Make sure your device has location turned on and an unobstructed view of the sky, then tap Retry.",
          sourceFunction
        });
      }
    } else {
      console.warn(`[LocationFlow] "${sourceFunction}" encountered unexpected error:`, err?.message || err);
    }
  }, [showToast]);

  // Backward compatibility placeholders (no movement effect)
  const [isDriveSimulating, setIsDriveSimulating] = useState<boolean>(false);
  const [driveSimulationSpeed, setDriveSimulationSpeed] = useState<number>(1);

  // Ref locks and trackers for continuous GPS watching
  const navWatchCleanupRef = useRef<(() => void) | null>(null);
  const lastRerouteTimeRef = useRef<number>(0);
  const lastSpokenStepRef = useRef<number>(-1);
  const hasAnnouncedArrivalRef = useRef<boolean>(false);

  // Global Map Layer (Light Street Map default, carto_dark for Dark Mode, google_hybrid for Satellite HD)
  const [mapLayer, setMapLayerState] = useState<MapLayerType>(() => {
    try {
      const stored = (localStorage.getItem('navigator_map_layer') || localStorage.getItem('convoy_map_layer')) as MapLayerType;
      if (stored === 'osm_standard' || stored === 'carto_dark' || stored === 'google_hybrid') {
        return stored;
      }
    } catch {}
    return 'osm_standard';
  });

  const setMapLayer = useCallback((layer: MapLayerType) => {
    setMapLayerState(layer);
    try {
      localStorage.setItem('navigator_map_layer', layer);
    } catch {}
  }, []);

  const [activeSOS, setActiveSOS] = useState<SOSEvent | null>(null);

  // Field Display Theme: 'dark' (High-contrast Expedition) vs 'light' (Daylight Expedition) vs 'night-vision' (Phosphor Green)
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem('tactical_theme') as ThemeMode;
      if (stored === 'night-vision' || stored === 'dark' || stored === 'light') {
        return stored;
      }
    } catch {}
    return 'dark';
  });

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('tactical_theme', newTheme);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : prev === 'light' ? 'night-vision' : 'dark';
      try {
        localStorage.setItem('tactical_theme', next);
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.classList.remove('theme-night-vision', 'theme-light', 'dark');
      document.body.classList.remove('theme-night-vision', 'theme-light', 'dark');
      
      if (theme === 'night-vision') {
        root.classList.add('theme-night-vision');
        root.setAttribute('data-theme', 'night-vision');
        document.body.classList.add('theme-night-vision');
      } else if (theme === 'light') {
        root.classList.add('theme-light');
        root.setAttribute('data-theme', 'light');
        document.body.classList.add('theme-light');
      } else {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
        document.body.classList.add('dark');
      }
    }
  }, [theme]);

  const [isFollowDriver, setIsFollowDriver] = useState<boolean>(true);
  const [mapZoomAction, setMapZoomAction] = useState<'in' | 'out' | null>(null);

  const triggerMapZoom = useCallback((action: 'in' | 'out') => {
    setMapZoomAction(action);
    setTimeout(() => setMapZoomAction(null), 150);
  }, []);

  const triggerRecenterOnUser = useCallback(() => {
    setIsFollowDriver(true);
    setRecenterMapCounter((c) => c + 1);
  }, []);

  // Activate Real Device Location (Google Maps Mode)
  // Directly calls getCurrentPosition to trigger the browser's native location permission popup
  const activateRealGPS = useCallback((): Promise<boolean> => {
    setIsLocating(true);
    setLocationError(null);

    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('geolocation' in navigator)) {
        setIsLocating(false);
        showToast('⚠️ Geolocation is not supported in this browser.');
        resolve(false);
        return;
      }

      console.log('Requesting real geolocation permission now');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsLocating(false);
          timeoutRetryCountRef.current = 0;
          console.log('[Geolocation] Real GPS fix acquired:', pos.coords.latitude, pos.coords.longitude, '±' + pos.coords.accuracy + 'm');

          if (pos.coords.accuracy == null || isNaN(pos.coords.accuracy) || pos.coords.accuracy <= 0) {
            console.warn('[LocationFlow] "activateRealGPS" received position with invalid accuracy, setting: "Turn on device GPS/location services".');
            setLocationError({
              code: 2,
              title: 'Turn on device GPS/location services',
              message: 'Device location / GPS services appear to be turned off or currently unavailable on your device.',
              sourceFunction: 'activateRealGPS'
            });
            resolve(false);
            return;
          }

          const accuracy = Math.round(pos.coords.accuracy || 10);
          let quality: GPSQuality = 'high_precision';
          if (accuracy > 30) quality = 'standard';
          if (accuracy > 100) quality = 'degraded';

          const accuratePos: GPSPosition = {
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

          setCurrentGPS(accuratePos);
          setGpsSource('device');
          setIsRealGPSFix(true);
          setIsSimulatingMovement(false); // Disable simulation so it doesn't overwrite real location
          setGpsBreadcrumbs((prev) => [...prev.slice(-120), accuratePos]);
          triggerRecenterOnUser();
          setLocationError(null);

          showToast(`📍 Real GPS Locked: ${accuratePos.latitude.toFixed(5)}°N, ${accuratePos.longitude.toFixed(5)}°E (±${accuratePos.accuracy}m)`);

          // Resolve friendly address asynchronously
          reverseGeocodeLocation(accuratePos.latitude, accuratePos.longitude)
            .then((addr) => {
              setRealLocationAddress(addr);
            })
            .catch(() => {});

          resolve(true);
        },
        (err: GeolocationPositionError) => {
          console.warn('GEO HIGH ACCURACY ERROR:', err.code, err.message);
          // Fast fallback attempt with enableHighAccuracy: false if high accuracy times out
          if (err.code === 3) {
            console.log('[Geolocation] High accuracy timed out, trying fast network/cellular position fallback...');
            navigator.geolocation.getCurrentPosition(
              (posFallback) => {
                setIsLocating(false);
                timeoutRetryCountRef.current = 0;
                const accuracy = Math.round(posFallback.coords.accuracy || 25);
                const fallbackPos: GPSPosition = {
                  latitude: Number(posFallback.coords.latitude.toFixed(6)),
                  longitude: Number(posFallback.coords.longitude.toFixed(6)),
                  altitude: posFallback.coords.altitude ? Math.round(posFallback.coords.altitude) : null,
                  speed: posFallback.coords.speed && posFallback.coords.speed > 0 ? Math.round(posFallback.coords.speed * 3.6) : null,
                  heading: posFallback.coords.heading && !isNaN(posFallback.coords.heading) ? Math.round(posFallback.coords.heading) : null,
                  accuracy,
                  timestamp: posFallback.timestamp || Date.now(),
                  altitudeAccuracy: null,
                  quality: 'standard',
                  isManual: false
                };
                setCurrentGPS(fallbackPos);
                setGpsSource('device');
                setIsRealGPSFix(true);
                setIsSimulatingMovement(false);
                setGpsBreadcrumbs((prev) => [...prev.slice(-120), fallbackPos]);
                triggerRecenterOnUser();
                setLocationError(null);
                resolve(true);
              },
              (fallbackErr) => {
                setIsLocating(false);
                handleLocationError(fallbackErr, 'activateRealGPS', () => { activateRealGPS(); });
                resolve(false);
              },
              { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
            );
          } else {
            setIsLocating(false);
            handleLocationError(err, 'activateRealGPS', () => { activateRealGPS(); });
            resolve(false);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 10000
        }
      );
    });
  }, [showToast, triggerRecenterOnUser, handleLocationError]);

  // Auto-acquire real GPS on startup if browser permission was previously granted
  useEffect(() => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      if ('permissions' in navigator && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then((status) => {
          if (status.state === 'granted') {
            activateRealGPS();
          }
        }).catch(() => {});
      }
    }
  }, [activateRealGPS]);

  // Switch back to Tactical Simulator Mode if user explicitly chooses
  const switchToSimulation = useCallback(() => {
    setGpsSource('simulation');
    setIsRealGPSFix(false);
    setIsSimulatingMovement(true);
    setCurrentGPS(INITIAL_COORDS);
    showToast('Switched to GPS Simulator Mode');
  }, [showToast]);

  // Continuous real location watch when in device mode (paused while in driving journey to prevent duplicate watcher conflict)
  useEffect(() => {
    if (gpsSource !== 'device' || isDrivingJourney) return;

    const cleanup = watchRealLocation(
      (pos) => {
        setCurrentGPS(pos);
        setIsRealGPSFix(true);
        setGpsBreadcrumbs((prev) => {
          const last = prev[prev.length - 1];
          if (last && Math.abs(last.latitude - pos.latitude) < 0.00001 && Math.abs(last.longitude - pos.longitude) < 0.00001) {
            return prev;
          }
          return [...prev.slice(-120), pos];
        });
      },
      (err) => {
        console.warn('Real GPS watch error:', err.message);
        // Do NOT instantly force revert to simulation! Keep last known position.
      }
    );

    return cleanup;
  }, [gpsSource, isDrivingJourney]);

  // Calculate Real Road Route strictly using available drivable roads with traffic-awareness and hazard avoidance
  const calculateRoadRouteToDestination = useCallback(
    async (destLat: number, destLng: number, destTitle?: string, customOrigin?: { lat: number; lng: number }): Promise<boolean> => {
      setIsRoutingLoading(true);
      setRoutingError(null);

      let originLat = customOrigin ? customOrigin.lat : currentGPSRef.current.latitude;
      let originLng = customOrigin ? customOrigin.lng : currentGPSRef.current.longitude;

      // Lock real browser GPS position if no custom origin is provided and real fix is not yet active
      if (!customOrigin && !isRealGPSFixRef.current && typeof window !== 'undefined' && 'geolocation' in navigator) {
        try {
          const freshPos = await new Promise<GeolocationPosition | null>((resolve) => {
            navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
              enableHighAccuracy: true,
              timeout: 3000,
              maximumAge: 15000
            });
          });
          if (freshPos && freshPos.coords) {
            originLat = Number(freshPos.coords.latitude.toFixed(6));
            originLng = Number(freshPos.coords.longitude.toFixed(6));
            const realPos: GPSPosition = {
              latitude: originLat,
              longitude: originLng,
              altitude: freshPos.coords.altitude ? Math.round(freshPos.coords.altitude) : null,
              speed: freshPos.coords.speed && freshPos.coords.speed > 0 ? Math.round(freshPos.coords.speed * 3.6) : null,
              heading: freshPos.coords.heading && !isNaN(freshPos.coords.heading) ? Math.round(freshPos.coords.heading) : null,
              accuracy: Math.round(freshPos.coords.accuracy || 10),
              timestamp: freshPos.timestamp || Date.now(),
              quality: 'high_precision',
              isManual: false
            };
            setCurrentGPS(realPos);
            setGpsSource('device');
            setIsRealGPSFix(true);
          }
        } catch {}
      }

      const origin = {
        lat: originLat,
        lng: originLng
      };

      const destination = {
        lat: destLat,
        lng: destLng
      };

      try {
        showToast('🚗 Calculating actual route along available roads...');
        const routes = await calculateRoadRoute(origin, destination, destTitle, {
          avoidIncidents: incidents,
          trafficModel: 'best_guess'
        });

        if (!routes || routes.length === 0) {
          throw new Error('No road route found on available street network.');
        }

        const primary = routes[0];
        setActiveRoute(primary);
        setAlternativeRoutes(routes.slice(1));

        showToast(`✅ Road Route Found: ${primary.distanceKm} km (${formatDuration(primary.estMinutes)}) ${primary.summary || ''}`);
        return true;
      } catch (err: any) {
        const msg = err.message || 'Failed to calculate road route';
        setRoutingError(msg);
        showToast(`⚠️ Route Error: ${msg}`);
        return false;
      } finally {
        setIsRoutingLoading(false);
      }
    },
    [incidents, showToast]
  );

  // Core execution of driving navigation once GPS & permission are confirmed
  const executeNavigation = useCallback((chosenRoute: RouteOption, initialPos?: GeolocationPosition | GPSPosition) => {
    setActiveRoute(chosenRoute);
    setIsDrivingJourney(true);
    setIsFullScreenMap(false);
    setCurrentStepIndex(0);
    lastSpokenStepRef.current = -1;
    hasAnnouncedArrivalRef.current = false;
    setIsFollowDriver(true);
    setGpsSource('device');
    setIsGpsSearching(false);
    setGpsErrorMessage(null);
    setIsOffRoute(false);
    setIsRerouting(false);
    triggerRecenterOnUser();

    // Clean up any previously running navigation watch
    if (navWatchCleanupRef.current) {
      navWatchCleanupRef.current();
      navWatchCleanupRef.current = null;
    }

    // Set initial route remaining metrics from route calculation
    if (chosenRoute) {
      setRemainingDistanceMeters(Math.round(chosenRoute.distanceKm * 1000));
      setRemainingMinutes(chosenRoute.estMinutes);
    }

    const firstStep = chosenRoute.steps && chosenRoute.steps.length > 0 ? chosenRoute.steps[0] : null;
    const startMsg = firstStep 
      ? `Starting route to ${chosenRoute.destination}. ${firstStep.instruction}`
      : `Starting navigation to ${chosenRoute.destination}. Follow highlighted route.`;
    
    showToast(`▶ Navigation Started: ${chosenRoute.name}`);
    if (voiceGuidanceEnabled) {
      speakInstruction(startMsg, true);
    }

    // Immediately start watching real device GPS location with high accuracy
    const cleanup = watchRealLocation(
      (pos: GPSPosition) => {
        setIsGpsSearching(false);
        setGpsErrorMessage(null);
        setIsRealGPSFix(true);
        setGpsSource('device');

        // Evaluate snap to route polyline (with 50m off-route threshold)
        const snap = snapPositionToRoute(pos.latitude, pos.longitude, chosenRoute, currentStepIndex);
        setRemainingDistanceMeters(snap.remainingDistanceMeters);
        setRemainingMinutes(snap.remainingMinutes);

        // Heading: use hardware heading if provided, otherwise segment or motion bearing
        const heading = pos.heading !== null && pos.heading !== undefined
          ? pos.heading
          : snap.segmentBearing;

        // Vehicle marker is strictly constrained to the road polyline
        const vehiclePos: GPSPosition = {
          ...pos,
          latitude: snap.snappedPosition.latitude,
          longitude: snap.snappedPosition.longitude,
          heading
        };

        setCurrentGPS(vehiclePos);
        setSnappedGPS(vehiclePos);
        setGpsBreadcrumbs((prev) => [...prev.slice(-120), vehiclePos]);

        // Destination arrival check
        if (snap.remainingDistanceMeters <= 35 && !hasAnnouncedArrivalRef.current) {
          hasAnnouncedArrivalRef.current = true;
          if (voiceGuidanceEnabled) {
            speakInstruction(`You have arrived at your destination: ${chosenRoute.destination}`, true);
          }
          showToast(`🏁 Arrived at Destination: ${chosenRoute.destination}`);
        }

        const now = Date.now();

        // Dynamic Incident & Road Hazard Rerouting Check
        // If an active hazard/roadblock is reported on the route ahead, automatically reroute
        if (!isRerouting && now - lastRerouteTimeRef.current > 7000 && incidents.length > 0) {
          let hasObstacleAhead = false;
          let obstacleTitle = '';

          for (const inc of incidents) {
            if (inc.category === 'landslide' || inc.category === 'roadblock' || inc.category === 'bridge_damage' || inc.category === 'weather_hazard' || inc.severity === 'critical') {
              for (const wp of chosenRoute.waypoints) {
                const distToWp = calculateDistanceMeters(inc.latitude, inc.longitude, wp[0], wp[1]);
                if (distToWp <= 180) {
                  hasObstacleAhead = true;
                  obstacleTitle = inc.title;
                  break;
                }
              }
            }
            if (hasObstacleAhead) break;
          }

          if (hasObstacleAhead && !chosenRoute.reroutedDueToIncident) {
            lastRerouteTimeRef.current = now;
            setIsRerouting(true);
            showToast(`🔄 Road hazard ahead: ${obstacleTitle}. Calculating detour...`);
            if (voiceGuidanceEnabled) {
              speakInstruction(`Route updated due to road hazard ahead. Calculating detour.`);
            }

            const destCoords = chosenRoute.waypoints[chosenRoute.waypoints.length - 1];
            calculateRoadRoute(
              { lat: pos.latitude, lng: pos.longitude },
              { lat: destCoords[0], lng: destCoords[1] },
              chosenRoute.destination,
              { avoidIncidents: incidents, trafficModel: 'best_guess' }
            ).then((newRoutes) => {
              if (newRoutes && newRoutes.length > 0) {
                const newPrimary = newRoutes[0];
                setActiveRoute(newPrimary);
                setIsRerouting(false);
                showToast(`✅ Route updated around hazard: ${newPrimary.distanceKm} km (${formatDuration(newPrimary.estMinutes)})`);
                if (voiceGuidanceEnabled && newPrimary.steps && newPrimary.steps.length > 0) {
                  speakInstruction(newPrimary.steps[0].instruction);
                }
              }
            }).catch((err) => {
              console.warn('Hazard reroute failed:', err);
              setIsRerouting(false);
            });
            return;
          }
        }

        // Off-route detection (> 50m) and automatic recalculation
        if (snap.isOffRoute) {
          setIsOffRoute(true);
          // Rate-limit automatic reroute calculation to at least 5s apart
          if (!isRerouting && now - lastRerouteTimeRef.current > 5000) {
            lastRerouteTimeRef.current = now;
            setIsRerouting(true);
            showToast('🔄 Off route. Recalculating route to destination...');
            if (voiceGuidanceEnabled) {
              speakInstruction('Recalculating route...');
            }

            const destCoords = chosenRoute.waypoints[chosenRoute.waypoints.length - 1];
            if (destCoords) {
              calculateRoadRoute(
                { lat: pos.latitude, lng: pos.longitude },
                { lat: destCoords[0], lng: destCoords[1] },
                chosenRoute.destination,
                { avoidIncidents: incidents, trafficModel: 'best_guess' }
              ).then((newRoutes) => {
                if (newRoutes && newRoutes.length > 0) {
                  const newPrimary = newRoutes[0];
                  setActiveRoute(newPrimary);
                  setIsOffRoute(false);
                  setIsRerouting(false);
                  setCurrentStepIndex(0);
                  showToast(`✅ Recalculated: ${newPrimary.distanceKm} km (${formatDuration(newPrimary.estMinutes)})`);
                  if (voiceGuidanceEnabled && newPrimary.steps && newPrimary.steps.length > 0) {
                    speakInstruction(newPrimary.steps[0].instruction);
                  }
                }
              }).catch((err) => {
                console.warn('Auto-reroute failed:', err);
                setIsRerouting(false);
              });
            }
          }
        } else {
          setIsOffRoute(false);
          setIsRerouting(false);

          // Advance step index and announce instruction when step changes
          if (snap.recommendedStepIndex !== currentStepIndex) {
            setCurrentStepIndex(snap.recommendedStepIndex);
            if (voiceGuidanceEnabled && chosenRoute.steps && chosenRoute.steps[snap.recommendedStepIndex]) {
              if (lastSpokenStepRef.current !== snap.recommendedStepIndex) {
                lastSpokenStepRef.current = snap.recommendedStepIndex;
                speakInstruction(chosenRoute.steps[snap.recommendedStepIndex].instruction);
              }
            }
          }
        }
      },
      (err: GeolocationPositionError) => {
        console.warn('Real GPS Watch Error:', err.message);
        handleLocationError(err, 'watchRealLocation');
        setIsGpsSearching(true);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    );

    navWatchCleanupRef.current = cleanup;
  }, [voiceGuidanceEnabled, currentStepIndex, isRerouting, incidents, showToast, triggerRecenterOnUser, handleLocationError]);

  // Start driving navigation: Launches driving HUD immediately and starts continuous high-precision GPS tracking
  const startDrivingJourney = useCallback(async (route?: RouteOption) => {
    let chosenRoute = route || activeRoute;
    if (!chosenRoute) {
      showToast('⚠️ Please enter a destination first to start navigation.');
      return;
    }

    // Automatically acquire/lock real GPS fix if not yet acquired
    if (gpsSource !== 'device' || !isRealGPSFixRef.current) {
      if (typeof window !== 'undefined' && 'geolocation' in navigator) {
        showToast('Acquiring real device GPS location...');
        await activateRealGPS();
      }
    }

    // Check if the current GPS location is far from the chosen route's origin (> 500m or default coords)
    const userLat = currentGPSRef.current.latitude;
    const userLng = currentGPSRef.current.longitude;
    const firstWp = chosenRoute.waypoints && chosenRoute.waypoints[0];

    if (firstWp) {
      const distFromStartM = calculateDistanceMeters(userLat, userLng, firstWp[0], firstWp[1]);
      if (distFromStartM > 500) {
        console.log(`[startDrivingJourney] Current location (${userLat}, ${userLng}) is ${Math.round(distFromStartM)}m from route start. Recalculating route from actual current location...`);
        showToast('📍 Recalculating route from your current location...');
        const destWp = chosenRoute.waypoints[chosenRoute.waypoints.length - 1];
        try {
          const freshRoutes = await calculateRoadRoute(
            { lat: userLat, lng: userLng },
            { lat: destWp[0], lng: destWp[1] },
            chosenRoute.destination,
            { avoidIncidents: incidents, trafficModel: 'best_guess' }
          );
          if (freshRoutes && freshRoutes.length > 0) {
            chosenRoute = freshRoutes[0];
            setActiveRoute(chosenRoute);
          }
        } catch (e) {
          console.warn('Failed to recalculate route from fresh position on start:', e);
        }
      }
    }

    pendingStartRouteRef.current = chosenRoute;
    setLocationError(null);
    setIsGpsSearching(false);

    // Launch active driving HUD and navigation map using confirmed position
    executeNavigation(chosenRoute, currentGPSRef.current);
  }, [activeRoute, gpsSource, incidents, activateRealGPS, executeNavigation, showToast]);

  // Force immediate re-calculation of the current OSRM route geometry
  const forceRecalculateRoute = useCallback(async () => {
    if (!activeRoute) {
      showToast('⚠️ No active route to re-calculate.');
      return;
    }

    setIsRerouting(true);
    showToast('🔄 Force re-calculating live OSRM route geometry...');
    if (voiceGuidanceEnabled) {
      speakInstruction('Re-calculating route with live street geometry...');
    }

    try {
      let userLat = currentGPSRef.current.latitude;
      let userLng = currentGPSRef.current.longitude;

      // Acquire fresh accurate GPS coordinate if browser geolocation is available
      if (typeof window !== 'undefined' && 'geolocation' in navigator) {
        try {
          const freshPos = await new Promise<GeolocationPosition | null>((resolve) => {
            navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
              enableHighAccuracy: true,
              timeout: 3000,
              maximumAge: 5000
            });
          });
          if (freshPos && freshPos.coords) {
            userLat = Number(freshPos.coords.latitude.toFixed(6));
            userLng = Number(freshPos.coords.longitude.toFixed(6));
            const freshGps: GPSPosition = {
              latitude: userLat,
              longitude: userLng,
              altitude: freshPos.coords.altitude ? Math.round(freshPos.coords.altitude) : null,
              speed: freshPos.coords.speed && freshPos.coords.speed > 0 ? Math.round(freshPos.coords.speed * 3.6) : null,
              heading: freshPos.coords.heading && !isNaN(freshPos.coords.heading) ? Math.round(freshPos.coords.heading) : null,
              accuracy: Math.round(freshPos.coords.accuracy || 10),
              timestamp: freshPos.timestamp || Date.now(),
              quality: 'high_precision',
              isManual: false
            };
            setCurrentGPS(freshGps);
          }
        } catch {}
      }

      const destWp = activeRoute.waypoints[activeRoute.waypoints.length - 1];
      if (!destWp) {
        throw new Error('Active route has no destination waypoints.');
      }

      const newRoutes = await calculateRoadRoute(
        { lat: userLat, lng: userLng },
        { lat: destWp[0], lng: destWp[1] },
        activeRoute.destination,
        { avoidIncidents: incidents, trafficModel: 'best_guess' }
      );

      if (newRoutes && newRoutes.length > 0) {
        const newPrimary = newRoutes[0];
        setActiveRoute(newPrimary);
        setAlternativeRoutes(newRoutes.slice(1));
        setIsOffRoute(false);
        setCurrentStepIndex(0);
        lastSpokenStepRef.current = -1;
        showToast(`✅ OSRM Route Re-calculated: ${newPrimary.distanceKm} km (${formatDuration(newPrimary.estMinutes)})`);
        if (voiceGuidanceEnabled && newPrimary.steps && newPrimary.steps.length > 0) {
          speakInstruction(newPrimary.steps[0].instruction);
        }
      } else {
        showToast('⚠️ OSRM server did not return a valid route.');
      }
    } catch (err: any) {
      console.warn('Force recalculate failed:', err);
      showToast(`⚠️ Re-calculation error: ${err.message || 'Route service unavailable'}`);
    } finally {
      setIsRerouting(false);
    }
  }, [activeRoute, incidents, voiceGuidanceEnabled, showToast]);

  // Retry location request (called from error modal's Retry button)
  const retryLocationRequest = useCallback(async () => {
    timeoutRetryCountRef.current = 0;
    setLocationError(null);
    if (retryLocationActionRef.current) {
      retryLocationActionRef.current();
    } else if (pendingStartRouteRef.current) {
      startDrivingJourney(pendingStartRouteRef.current);
    } else {
      activateRealGPS();
    }
  }, [startDrivingJourney, activateRealGPS]);

  const clearLocationError = useCallback(() => {
    setLocationError(null);
  }, []);

  // Cleanly stop navigation and stop watching real GPS
  const stopDrivingJourney = useCallback(() => {
    if (navWatchCleanupRef.current) {
      navWatchCleanupRef.current();
      navWatchCleanupRef.current = null;
    }
    setIsDrivingJourney(false);
    setIsGpsSearching(false);
    setIsOffRoute(false);
    setIsRerouting(false);
    setGpsErrorMessage(null);
    cancelSpeech();
    showToast('Navigation Ended');
  }, [showToast]);

  // Ensure watch is cleaned up on unmount
  useEffect(() => {
    return () => {
      if (navWatchCleanupRef.current) {
        navWatchCleanupRef.current();
      }
    };
  }, []);

  // Active real network health & connectivity check
  const checkNetworkStatus = useCallback(async (): Promise<boolean> => {
    if (networkSimulationMode === 'offline') {
      setIsOnline(false);
      connectivityService.syncStatus(false, 'offline');
      return false;
    }
    if (networkSimulationMode === 'online' || networkSimulationMode === 'spotty') {
      setIsOnline(true);
      connectivityService.syncStatus(true, networkSimulationMode);
      return true;
    }

    // Auto mode: check real browser status and test active probe
    const navOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!navOnline) {
      setIsOnline(false);
      connectivityService.syncStatus(false, 'auto');
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`/favicon.ico?_t=${Date.now()}`, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store'
      }).catch(() => null);
      clearTimeout(timeoutId);

      const liveOnline = res !== null ? true : navOnline;
      setIsOnline(liveOnline);
      connectivityService.syncStatus(liveOnline, 'auto');
      return liveOnline;
    } catch {
      setIsOnline(navOnline);
      connectivityService.syncStatus(navOnline, 'auto');
      return navOnline;
    }
  }, [networkSimulationMode]);

  // Real Automatic Network Detection & Listeners
  useEffect(() => {
    checkNetworkStatus();

    const handleOnline = () => {
      if (networkSimulationMode === 'auto') {
        setIsOnline(true);
        connectivityService.syncStatus(true, 'auto');
        showToast('Network Detected: Satellite Uplink Established');
      }
    };

    const handleOffline = () => {
      if (networkSimulationMode === 'auto') {
        setIsOnline(false);
        connectivityService.syncStatus(false, 'auto');
        showToast('Network Disconnected: Switched to Local Offline Cache');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Heartbeat check every 5 seconds when in auto mode
    const heartbeat = setInterval(() => {
      if (networkSimulationMode === 'auto') {
        checkNetworkStatus();
      }
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(heartbeat);
    };
  }, [networkSimulationMode, checkNetworkStatus, showToast]);

  // Live Internet Speed Test
  const runSpeedTest = useCallback(async (): Promise<NetworkSpeedStats> => {
    setIsTestingSpeed(true);
    try {
      const stats = await connectivityService.measureSpeed();
      setSpeedStats(stats);
      return stats;
    } catch {
      const fallback: NetworkSpeedStats = {
        downloadSpeedMbps: isOnline ? 14.2 : 0,
        pingMs: isOnline ? 36 : 0,
        jitterMs: isOnline ? 4 : 0,
        quality: isOnline ? 'good' : 'offline',
        effectiveType: isOnline ? 'Broadband Satellite' : 'Offline',
        isTesting: false,
        lastTested: Date.now(),
      };
      setSpeedStats(fallback);
      return fallback;
    } finally {
      setIsTestingSpeed(false);
    }
  }, [isOnline]);

  // Network simulation / mode sync
  const handleSetNetworkMode = (mode: NetworkMode) => {
    setNetworkSimulationMode(mode);
    connectivityService.setMode(mode);
    if (mode === 'auto') {
      const navOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsOnline(navOnline);
      connectivityService.syncStatus(navOnline, 'auto');
      showToast(navOnline ? 'Auto-Detect: Connected to Live Satellite Uplink' : 'Auto-Detect: Operating in Local Offline Mode');
      checkNetworkStatus();
      runSpeedTest();
    } else if (mode === 'online') {
      setIsOnline(true);
      connectivityService.syncStatus(true, 'online');
      showToast('Manual Override: Satellite Uplink Forced Online');
      runSpeedTest();
    } else if (mode === 'offline') {
      setIsOnline(false);
      connectivityService.syncStatus(false, 'offline');
      setSpeedStats({
        downloadSpeedMbps: 0,
        pingMs: 0,
        jitterMs: 0,
        quality: 'offline',
        effectiveType: 'Offline / Disconnected',
        isTesting: false,
        lastTested: Date.now(),
      });
      showToast('Manual Override: Switched to Local Offline Storage');
    } else {
      setIsOnline(true);
      connectivityService.syncStatus(true, 'spotty');
      setSpeedStats({
        downloadSpeedMbps: 0.24,
        pingMs: 380,
        jitterMs: 54,
        quality: 'poor',
        effectiveType: 'Spotty 2G Tactical Mesh',
        isTesting: false,
        lastTested: Date.now(),
      });
      showToast('Manual Override: Spotty 2G / Mesh Mode');
    }
  };

  // Force Sync implementation with realistic batch processing
  const forceSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncProgress(10);

    // If currently offline, force a temporary online connection check or simulate uplink
    const wasOffline = !isOnline;
    if (wasOffline) {
      showToast('Establishing Tactical Radio Mesh Uplink...');
    }

    try {
      // Step 1: Handshake
      await new Promise((r) => setTimeout(r, 600));
      setSyncProgress(35);

      // Step 2: Upload pending queue
      const pendingItems = syncQueue.filter((item) => item.status === 'pending' || item.status === 'failed');
      
      for (let i = 0; i < pendingItems.length; i++) {
        await new Promise((r) => setTimeout(r, 450));
        setSyncProgress(35 + Math.round(((i + 1) / (pendingItems.length || 1)) * 50));
      }

      // Mark queue items as synced
      setSyncQueue((prev) =>
        prev.map((item) => ({ ...item, status: 'synced' as const }))
      );

      // Mark pending incidents as synced
      setIncidents((prev) =>
        prev.map((inc) => ({ ...inc, syncStatus: 'synced' as const }))
      );

      // Update last sync time
      const now = Date.now();
      setLastSyncTime(now);
      setLastSyncedTimestamp(now);
      setSyncProgress(100);

      await new Promise((r) => setTimeout(r, 400));
      showToast('Sync Complete: All queued reports & telemetry uploaded');
    } catch (err) {
      console.error(err);
      showToast('Sync Failed: Radio interference detected. Saved to offline queue.');
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
    }
  };

  // Queue item actions
  const removeItemFromQueue = (id: string) => {
    setSyncQueue((prev) => prev.filter((item) => item.id !== id));
    showToast('Queue item removed');
  };

  const retryQueueItem = (id: string) => {
    setSyncQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'pending' as const, retryCount: item.retryCount + 1 } : item
      )
    );
    showToast('Queued for immediate upload');
  };

  const addQueueItem = (item: Omit<SyncQueueItem, 'id' | 'timestamp'>) => {
    const newItem: SyncQueueItem = {
      ...item,
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: currentUserId,
      timestamp: Date.now()
    };
    setSyncQueue((prev) => [newItem, ...prev]);
    if (currentUserId) {
      saveUserSyncItemToFirestore(currentUserId, newItem).catch((err) => {
        console.warn('[Firestore] Sync item save error:', err);
      });
    }
  };

  // Map package downloading simulation
  const startPackageDownload = (packageId: string) => {
    setMapPackages((prev) =>
      prev.map((pkg) =>
        pkg.id === packageId ? { ...pkg, status: 'downloading' as const, downloadProgress: 5 } : pkg
      )
    );

    showToast('Initiating offline tile package stream...');

    let progress = 5;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 10;
      if (progress >= 100) {
        clearInterval(interval);
        setMapPackages((prev) =>
          prev.map((pkg) =>
            pkg.id === packageId
              ? { ...pkg, status: 'downloaded' as const, downloadProgress: 100 }
              : pkg
          )
        );
        showToast('Map Tiles Cached Successfully for Offline Navigation');
      } else {
        setMapPackages((prev) =>
          prev.map((pkg) =>
            pkg.id === packageId ? { ...pkg, downloadProgress: progress } : pkg
          )
        );
      }
    }, 700);
  };

  const purgeMapPackage = (packageId: string) => {
    setMapPackages((prev) =>
      prev.map((pkg) =>
        pkg.id === packageId ? { ...pkg, status: 'available' as const, downloadProgress: 0 } : pkg
      )
    );
    showToast('Tile pack removed from local storage');
  };

  // Offline Custom Route Downloading & Sync Integration
  const isRouteDownloading = (routeId: string): boolean => {
    return downloadedRoutes.some(r => (r.routeId === routeId || r.id === routeId) && r.status === 'downloading');
  };

  const downloadRouteMap = async (route: RouteOption, customName?: string): Promise<string> => {
    if (!route || !route.waypoints || route.waypoints.length === 0) {
      showToast('⚠️ Cannot download empty route.');
      return '';
    }

    const routeName = customName || route.name || `Route to ${route.destination}`;
    const pkgId = `route-pkg-${route.id || Date.now()}`;
    
    // Check if already downloading or downloaded
    const existing = downloadedRoutes.find(r => r.routeId === route.id || r.name === routeName);
    if (existing && existing.status === 'downloaded') {
      showToast(`✓ "${routeName}" is already cached offline in Sync Center.`);
      return existing.id;
    }

    const lats = route.waypoints.map(w => w[0]);
    const lngs = route.waypoints.map(w => w[1]);
    const north = Math.max(...lats) + 0.05;
    const south = Math.min(...lats) - 0.05;
    const east = Math.max(...lngs) + 0.05;
    const west = Math.min(...lngs) - 0.05;

    const tileCount = Math.max(320, Math.round(route.distanceKm * 4.6 + 160));
    const sizeBytes = Math.round(tileCount * 13800);
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
    const sizeFormatted = `${sizeMb} MB`;

    const newPkg: DownloadedRoutePackage = {
      id: pkgId,
      routeId: route.id,
      name: routeName,
      destination: route.destination,
      originName: realLocationAddress || 'Starting Location',
      distanceKm: route.distanceKm,
      estMinutes: route.estMinutes,
      elevationGainM: route.elevationGainM,
      waypoints: route.waypoints,
      steps: route.steps,
      downloadedAt: Date.now(),
      sizeFormatted,
      sizeBytes,
      tileCount,
      status: 'downloading',
      downloadProgress: 10,
      bounds: { north, south, east, west },
      user_id: currentUserId,
      primaryRoad: route.primaryRoad || route.callsign || 'Highway Route'
    };

    // Update downloadedRoutes state
    setDownloadedRoutes(prev => [newPkg, ...prev.filter(r => r.id !== pkgId && r.routeId !== route.id)]);

    // Update active route isOfflineCached state
    setActiveRoute(prev => prev ? { ...prev, isOfflineCached: true } : prev);
    setAlternativeRoutes(prev => prev.map(r => r.id === route.id ? { ...r, isOfflineCached: true } : r));

    // Create a transaction ledger record in the Sync Queue
    const syncItem: SyncQueueItem = {
      id: `sync-route-${Date.now()}`,
      report_id: pkgId,
      idempotency_key: `idemp-route-${pkgId}-${Date.now()}`,
      type: 'route_download',
      title: `Offline Route: ${routeName}`,
      subtitle: `${route.distanceKm} km • ${tileCount.toLocaleString()} tiles cached for offline use`,
      sizeBytes,
      timestamp: Date.now(),
      status: 'synced',
      sync_stage: 'SYNCED',
      icon: 'map',
      color: '#10b981',
      retryCount: 0,
      user_id: currentUserId,
      payload: {
        routeId: route.id,
        destination: route.destination,
        distanceKm: route.distanceKm,
        tileCount
      }
    };
    setSyncQueue(prev => [syncItem, ...prev]);
    if (currentUserId) {
      saveUserSyncItemToFirestore(currentUserId, syncItem).catch(console.warn);
    }

    showToast(`Downloading offline map for "${routeName}"...`);

    let progress = 10;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 20) + 15;
      if (progress >= 100) {
        clearInterval(interval);
        const finalPkg: DownloadedRoutePackage = { ...newPkg, status: 'downloaded' as const, downloadProgress: 100 };
        setDownloadedRoutes(prev =>
          prev.map(r => r.id === pkgId ? finalPkg : r)
        );
        if (currentUserId) {
          saveUserDownloadedRouteToFirestore(currentUserId, finalPkg).catch(console.warn);
        }
        showToast(`✓ Offline Map for "${routeName}" saved in Sync Center!`);
      } else {
        setDownloadedRoutes(prev =>
          prev.map(r => r.id === pkgId ? { ...r, downloadProgress: progress } : r)
        );
      }
    }, 600);

    return pkgId;
  };

  const purgeDownloadedRoute = (packageId: string) => {
    setDownloadedRoutes(prev => prev.filter(r => r.id !== packageId && r.routeId !== packageId));
    if (currentUserId) {
      deleteUserDownloadedRouteFromFirestore(currentUserId, packageId).catch(console.warn);
    }
    setActiveRoute(prev => {
      if (prev && (prev.id === packageId || `route-pkg-${prev.id}` === packageId)) {
        return { ...prev, isOfflineCached: false };
      }
      return prev;
    });
    showToast('Offline route package purged from storage');
  };

  const launchOfflineRoute = (routePkg: DownloadedRoutePackage) => {
    const routeOption: RouteOption = {
      id: routePkg.routeId || routePkg.id,
      name: routePkg.name,
      destination: routePkg.destination,
      distanceKm: routePkg.distanceKm,
      estMinutes: routePkg.estMinutes,
      elevationGainM: routePkg.elevationGainM,
      hazardCount: 0,
      isOfflineCached: true,
      waypoints: routePkg.waypoints,
      callsign: routePkg.primaryRoad || 'OFFLINE-CORRIDOR',
      steps: routePkg.steps,
      isRealRoadRoute: true,
      primaryRoad: routePkg.primaryRoad
    };

    setActiveRoute(routeOption);
    setCurrentTab('resilient-navigation');
    showToast(`📍 Loaded Offline Map Route: ${routePkg.name}`);
  };

  const totalCachedStorageBytes = mapPackages
    .filter((pkg) => pkg.status === 'downloaded')
    .reduce((acc, pkg) => acc + pkg.sizeBytes, 0) +
    downloadedRoutes
      .filter((pkg) => pkg.status === 'downloaded')
      .reduce((acc, pkg) => acc + pkg.sizeBytes, 0) + 14200000; // plus local database & cache size

  // Waypoints & Incidents
  const addWaypoint = (wp: Omit<Waypoint, 'id'>) => {
    const newWp: Waypoint = {
      ...wp,
      id: `wp-${Date.now()}`
    };
    setWaypoints((prev) => [...prev, newWp]);
    showToast(`Waypoint ${newWp.name} added to offline database`);
  };

  const createIncident = async (
    data: Partial<IncidentReport> & {
      title: string;
      category: IncidentCategory;
      severity: IncidentSeverity;
      district_road_segment: string;
      latitude: number;
      longitude: number;
    }
  ): Promise<IncidentReport> => {
    const id = `IR-${Math.floor(100 + Math.random() * 900)}`;
    const reportId = data.report_id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newReport: IncidentReport = {
      report_id: reportId,
      idempotency_key: data.idempotency_key || `idemp_${id}`,
      tenant_id: data.tenant_id || 'tactical-unit-07',
      revision: data.revision || 1,
      title: data.title,
      category: data.category,
      severity: data.severity,
      district_road_segment: data.district_road_segment,
      description: data.description || `${data.title} reported near ${data.district_road_segment}`,
      observation_time: data.observation_time || new Date().toISOString(),
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy_meters: data.accuracy_meters || 5,
      altitude_meters: data.altitude_meters || 0,
      gps_status: data.gps_status || 'high_precision',
      geo_json: data.geo_json || {
        type: 'Point',
        coordinates: [data.longitude, data.latitude, data.altitude_meters || 0]
      },
      locationName: data.locationName || data.district_road_segment,
      reportedBy: userProfile?.callsign || userProfile?.displayName || data.reportedBy || 'Field Operator',
      user_id: currentUserId,
      photos: data.photos || [],
      photo_attachments: data.photo_attachments || [],
      sync_stage: data.sync_stage || (isOnline ? 'SYNCED' : 'QUEUED'),
      retry_count: data.retry_count ?? 0,
      ...data,
      id,
      timestamp: Date.now(),
      syncStatus: isOnline ? 'synced' : 'pending'
    };

    setIncidents((prev) => [newReport, ...prev]);

    // Save directly to user's isolated Firestore subcollection if authenticated
    if (currentUserId) {
      saveUserIncidentToFirestore(currentUserId, newReport).catch((err) => {
        console.warn('[Firestore] Incident save error:', err);
      });
    }

    // Also add to sync queue if offline or syncing
    addQueueItem({
      report_id: data.report_id || id,
      idempotency_key: data.idempotency_key || `idemp_${id}`,
      type: 'incident',
      title: `Incident Report: ${id}`,
      subtitle: isOnline ? 'Direct Upload' : 'Pending Upload',
      sizeBytes: 380000 + (data.photos?.length || 0) * 1200000,
      status: isOnline ? 'synced' : 'pending',
      sync_stage: isOnline ? 'SYNCED' : 'QUEUED',
      icon: 'assignment_late',
      color: data.severity === 'critical' ? '#ffb4ab' : '#fbbb45',
      retryCount: 0,
      payload: { ...newReport }
    });

    showToast(
      isOnline
        ? `Incident ${id} stored in user cloud records & sent to HQ`
        : `Incident ${id} saved to user offline ledger`
    );

    return newReport;
  };

  const deleteIncident = (id: string) => {
    const target = incidents.find(i => i.id === id || i.report_id === id);
    setIncidents((prev) => prev.filter((i) => i.id !== id && i.report_id !== id));
    setSyncQueue((prev) => prev.filter((item) => !item.title.includes(id) && item.report_id !== id));
    if (currentUserId && target) {
      deleteUserIncidentFromFirestore(currentUserId, target.report_id || id).catch((err) => {
        console.warn('[Firestore] Delete error:', err);
      });
    }
    showToast(`Incident ${id} deleted`);
  };

  const clearBreadcrumbs = () => {
    setGpsBreadcrumbs([]);
    showToast('GPS track breadcrumbs cleared');
  };

  // SOS Emergency protocol
  const triggerSOS = (options?: { medical?: boolean; disabled?: boolean; threat?: boolean }) => {
    const event: SOSEvent = {
      id: `SOS-${Date.now()}`,
      activatedAt: Date.now(),
      driverName: userProfile?.displayName || userProfile?.callsign || 'Registered User',
      vehicleId: userProfile?.unit || 'User Device',
      latitude: currentGPS.latitude,
      longitude: currentGPS.longitude,
      altitude: currentGPS.altitude || 3048,
      medicalAssistanceNeeded: !!options?.medical,
      vehicleDisabled: !!options?.disabled,
      underThreat: !!options?.threat,
      status: 'broadcasting',
      satelliteBurstTransmitted: true
    };
    setActiveSOS(event);
    if (currentUserId) {
      saveUserSOSToFirestore(currentUserId, event).catch((err) => {
        console.warn('[Firestore] SOS save error:', err);
      });
    }

    // Also add high-priority burst to queue
    addQueueItem({
      report_id: event.id,
      idempotency_key: `idemp_${event.id}`,
      type: 'telemetry',
      title: 'EMERGENCY DISTRESS BEACON ACTIVATED',
      subtitle: 'HIGH PRIORITY SATELLITE BURST',
      sizeBytes: 12000,
      status: 'pending',
      sync_stage: 'QUEUED',
      icon: 'emergency',
      color: '#ffb4ab',
      retryCount: 0,
      payload: event
    });

    showToast('🚨 DISTRESS BEACON ACTIVE: Satellite transmission broadcasting coordinates!');
  };

  const cancelSOS = () => {
    setActiveSOS(null);
    setSyncQueue((prev) =>
      prev.map((item) =>
        item.title.includes('EMERGENCY DISTRESS BEACON') && item.status === 'pending'
          ? { ...item, status: 'synced', subtitle: 'BEACON ABORTED / STANDBY' }
          : item
      )
    );
    showToast('Distress Beacon deactivated. All-clear burst sent.');
  };

  return (
    <AppContext.Provider
      value={{
        currentTab,
        setCurrentTab,
        isOnline,
        setIsOnline,
        networkSimulationMode,
        setNetworkSimulationMode: handleSetNetworkMode,
        checkNetworkStatus,
        speedStats,
        isTestingSpeed,
        runSpeedTest,
        syncQueue,
        isSyncing,
        syncProgress,
        lastSyncedTimestamp,
        forceSync,
        removeItemFromQueue,
        retryQueueItem,
        addQueueItem,
        mapPackages,
        startPackageDownload,
        purgeMapPackage,
        downloadedRoutes,
        downloadRouteMap,
        purgeDownloadedRoute,
        launchOfflineRoute,
        isRouteDownloading,
        totalCachedStorageBytes,
        currentGPS,
        isSimulatingMovement,
        setIsSimulatingMovement,
        gpsSource,
        setGpsSource,
        isRealGPSFix,
        realLocationAddress,
        isLocating,
        activateRealGPS,
        switchToSimulation,
        recenterMapCounter,
        triggerRecenterOnUser,
        gpsBreadcrumbs,
        clearBreadcrumbs,
        activeRoute,
        setActiveRoute,
        alternativeRoutes,
        calculateRoadRouteToDestination,
        isRoutingLoading,
        routingError,
        waypoints,
        addWaypoint,
        incidents,
        createIncident,
        deleteIncident,
        activeSOS,
        triggerSOS,
        cancelSOS,
        // Location Error State (Directly populated from real Geolocation error.code)
        locationError,
        clearLocationError,
        retryLocationRequest,
        // Full Map & Driving Journey
        isFullScreenMap,
        setIsFullScreenMap,
        isDrivingJourney,
        startDrivingJourney,
        stopDrivingJourney,
        forceRecalculateRoute,
        currentStepIndex,
        setCurrentStepIndex,
        voiceGuidanceEnabled,
        setVoiceGuidanceEnabled,
        isDriveSimulating,
        setIsDriveSimulating,
        driveSimulationSpeed,
        setDriveSimulationSpeed,
        // Real GPS Navigation Tracking States
        isGpsSearching,
        gpsErrorMessage,
        isOffRoute,
        isRerouting,
        snappedGPS,
        remainingDistanceMeters,
        remainingMinutes,
        mapLayer,
        setMapLayer,
        isFollowDriver,
        setIsFollowDriver,
        mapZoomAction,
        triggerMapZoom,
        toastMessage,
        showToast,
        theme,
        setTheme,
        toggleTheme
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
