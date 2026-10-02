import { IncidentReport, MapTilePackage, SyncQueueItem, Waypoint, GPSPosition, DownloadedRoutePackage } from '../types';

const KEYS = {
  SYNC_QUEUE: 'tactical_sync_queue_v1',
  MAP_PACKAGES: 'tactical_map_packages_v1',
  INCIDENTS: 'tactical_incidents_v1',
  WAYPOINTS: 'tactical_waypoints_v1',
  NETWORK_MODE: 'tactical_network_mode_v1',
  LAST_SYNC: 'tactical_last_sync_v1',
  TRACK_LOG: 'tactical_track_log_v1',
  UNIT_ID: 'tactical_unit_id_v1',
  DRIVER_NAME: 'tactical_driver_name_v1',
  DOWNLOADED_ROUTES: 'tactical_downloaded_routes_v1'
};

export const INITIAL_DOWNLOADED_ROUTES: DownloadedRoutePackage[] = [];

export const getStoredDownloadedRoutes = (userId?: string): DownloadedRoutePackage[] => {
  try {
    const key = userId ? `${KEYS.DOWNLOADED_ROUTES}_${userId}` : `${KEYS.DOWNLOADED_ROUTES}_guest`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load downloaded routes', e);
  }
  return [];
};

export const saveStoredDownloadedRoutes = (routes: DownloadedRoutePackage[], userId?: string): void => {
  try {
    const key = userId ? `${KEYS.DOWNLOADED_ROUTES}_${userId}` : `${KEYS.DOWNLOADED_ROUTES}_guest`;
    localStorage.setItem(key, JSON.stringify(routes));
  } catch (e) {
    console.error('Failed to save downloaded routes', e);
  }
};

export const getStoredSyncQueue = (userId?: string): SyncQueueItem[] => {
  try {
    const key = userId ? `${KEYS.SYNC_QUEUE}_${userId}` : `${KEYS.SYNC_QUEUE}_guest`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load sync queue', e);
  }
  return [];
};

export const saveStoredSyncQueue = (items: SyncQueueItem[], userId?: string): void => {
  try {
    const key = userId ? `${KEYS.SYNC_QUEUE}_${userId}` : `${KEYS.SYNC_QUEUE}_guest`;
    localStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save sync queue', e);
  }
};

export const getStoredMapPackages = (): MapTilePackage[] => {
  try {
    const raw = localStorage.getItem(KEYS.MAP_PACKAGES);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load map packages', e);
  }
  return [];
};

export const saveStoredMapPackages = (packages: MapTilePackage[]): void => {
  try {
    localStorage.setItem(KEYS.MAP_PACKAGES, JSON.stringify(packages));
  } catch (e) {
    console.error('Failed to save map packages', e);
  }
};

export const getStoredIncidents = (userId?: string): IncidentReport[] => {
  try {
    const key = userId ? `${KEYS.INCIDENTS}_${userId}` : `${KEYS.INCIDENTS}_guest`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load incidents', e);
  }
  return [];
};

export const saveStoredIncidents = (incidents: IncidentReport[], userId?: string): void => {
  try {
    const key = userId ? `${KEYS.INCIDENTS}_${userId}` : `${KEYS.INCIDENTS}_guest`;
    localStorage.setItem(key, JSON.stringify(incidents));
  } catch (e) {
    console.error('Failed to save incidents', e);
  }
};

export const getStoredWaypoints = (userId?: string): Waypoint[] => {
  try {
    const key = userId ? `${KEYS.WAYPOINTS}_${userId}` : `${KEYS.WAYPOINTS}_guest`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load waypoints', e);
  }
  return [];
};

export const saveStoredWaypoints = (waypoints: Waypoint[], userId?: string): void => {
  try {
    const key = userId ? `${KEYS.WAYPOINTS}_${userId}` : `${KEYS.WAYPOINTS}_guest`;
    localStorage.setItem(key, JSON.stringify(waypoints));
  } catch (e) {
    console.error('Failed to save waypoints', e);
  }
};

export const getStoredTrackLog = (userId?: string): GPSPosition[] => {
  try {
    const key = userId ? `${KEYS.TRACK_LOG}_${userId}` : `${KEYS.TRACK_LOG}_guest`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load track log', e);
  }
  return [];
};

export const saveStoredTrackLog = (tracks: GPSPosition[], userId?: string): void => {
  try {
    // Keep max 500 breadcrumbs
    const trimmed = tracks.slice(-500);
    const key = userId ? `${KEYS.TRACK_LOG}_${userId}` : `${KEYS.TRACK_LOG}_guest`;
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save track log', e);
  }
};

export const getLastSyncTime = (): number => {
  const val = localStorage.getItem(KEYS.LAST_SYNC);
  return val ? parseInt(val, 10) : Date.now();
};

export const setLastSyncTime = (timestamp: number): void => {
  localStorage.setItem(KEYS.LAST_SYNC, timestamp.toString());
};
