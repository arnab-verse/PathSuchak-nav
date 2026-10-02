import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { DownloadedRoutePackage, RouteOption, IncidentReport, GPSPosition } from '../types';
import { incidentSyncService, SyncProgressEvent } from '../services/incident-sync.service';
import { IncidentTestRunner } from './IncidentTestRunner';
import { calculateRoadRoute } from '../services/road-routing.service';
import { searchPlaces } from '../services/real-location.service';
import { formatDuration } from '../services/gps-geojson.service';

export const OfflineSyncCenter: React.FC = () => {
  const {
    isOnline,
    networkSimulationMode,
    setNetworkSimulationMode,
    checkNetworkStatus,
    isSyncing,
    syncProgress,
    lastSyncedTimestamp,
    forceSync,
    downloadedRoutes,
    downloadRouteMap,
    purgeDownloadedRoute,
    launchOfflineRoute,
    incidents,
    gpsBreadcrumbs,
    clearBreadcrumbs,
    activeRoute,
    currentGPS,
    realLocationAddress,
    setCurrentTab,
    showToast
  } = useApp();

  const { currentUser, userProfile } = useAuth();

  const [activeSyncEvent, setActiveSyncEvent] = useState<SyncProgressEvent | null>(null);
  const [showTestRunner, setShowTestRunner] = useState<boolean>(false);
  const [isProbing, setIsProbing] = useState<boolean>(false);

  // Offline Corridor Downloader State
  const [customOriginText] = useState<string>('📍 Current GPS Location');
  const [customDestinationText, setCustomDestinationText] = useState<string>('');
  const [customOriginCoord, setCustomOriginCoord] = useState<{ lat: number; lng: number }>({
    lat: currentGPS.latitude,
    lng: currentGPS.longitude
  });
  const [customDestinationCoord, setCustomDestinationCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [customPlaceSuggestions, setCustomPlaceSuggestions] = useState<{ name: string; lat: number; lng: number; address: string }[]>([]);
  const [isSearchingDest, setIsSearchingDest] = useState<boolean>(false);
  const [showDestSuggestions, setShowDestSuggestions] = useState<boolean>(false);
  const [calculatedCustomRoute, setCalculatedCustomRoute] = useState<RouteOption | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);
  const [customRouteCalcError, setCustomRouteCalcError] = useState<string | null>(null);
  const destSearchTimeoutRef = useRef<any>(null);

  // Update origin coordinates when currentGPS changes
  useEffect(() => {
    if (currentGPS) {
      setCustomOriginCoord({ lat: currentGPS.latitude, lng: currentGPS.longitude });
    }
  }, [currentGPS.latitude, currentGPS.longitude]);

  // Handle Destination search query with debounce
  const handleDestinationSearchChange = (val: string) => {
    setCustomDestinationText(val);
    setCustomDestinationCoord(null);
    setCalculatedCustomRoute(null);
    setCustomRouteCalcError(null);

    if (destSearchTimeoutRef.current) clearTimeout(destSearchTimeoutRef.current);
    if (val.trim().length < 2) {
      setCustomPlaceSuggestions([]);
      setShowDestSuggestions(false);
      return;
    }

    setIsSearchingDest(true);
    destSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(val, currentGPS.latitude, currentGPS.longitude);
        setCustomPlaceSuggestions(results);
        setShowDestSuggestions(results.length > 0);
      } catch (err) {
        console.warn('Place search error:', err);
      } finally {
        setIsSearchingDest(false);
      }
    }, 350);
  };

  const handleSelectDestSuggestion = (place: { name: string; lat: number; lng: number; address: string }) => {
    setCustomDestinationText(place.name);
    setCustomDestinationCoord({ lat: place.lat, lng: place.lng });
    setShowDestSuggestions(false);
    setCustomPlaceSuggestions([]);
  };

  // Calculate Custom Route for Offline Download
  const handleCalculateCustomRoute = async () => {
    if (!customDestinationText.trim()) {
      showToast('⚠️ Please enter a destination city or highway corridor.');
      return;
    }

    setIsCalculatingRoute(true);
    setCustomRouteCalcError(null);
    setCalculatedCustomRoute(null);

    try {
      let targetCoord = customDestinationCoord;
      if (!targetCoord) {
        const places = await searchPlaces(customDestinationText, currentGPS.latitude, currentGPS.longitude);
        if (places.length > 0) {
          targetCoord = { lat: places[0].lat, lng: places[0].lng };
          setCustomDestinationCoord(targetCoord);
        } else {
          throw new Error(`Could not locate "${customDestinationText}". Please select from suggestions.`);
        }
      }

      const routes = await calculateRoadRoute(
        customOriginCoord,
        targetCoord,
        customDestinationText
      );

      if (routes && routes.length > 0) {
        setCalculatedCustomRoute(routes[0]);
        showToast(`✓ Calculated Corridor: ${routes[0].distanceKm} km (${formatDuration(routes[0].estMinutes)})`);
      } else {
        throw new Error('No road route could be determined for this destination.');
      }
    } catch (err: any) {
      setCustomRouteCalcError(err.message || 'Failed to calculate route geometry.');
      showToast(`⚠️ ${err.message || 'Routing error'}`);
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleProbeNow = async () => {
    setIsProbing(true);
    const connected = await checkNetworkStatus();
    setIsProbing(false);
    showToast(connected ? 'Live Network Confirmed: Uplink Synchronized' : 'Hardware Network Unreachable: Operating Offline');
  };

  useEffect(() => {
    const unsub = incidentSyncService.subscribe((event) => {
      setActiveSyncEvent(event);
    });
    return () => unsub();
  }, []);

  // Relative time helper
  const getRelativeTime = (ts: number) => {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  // Export Route Log
  const handleExportRouteLog = () => {
    if (gpsBreadcrumbs.length === 0) {
      showToast('⚠️ No route log entries to export.');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gpsBreadcrumbs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `route-log-${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('✓ Route Log exported successfully');
  };

  // Total offline cache calculation
  const totalCachedBytes = downloadedRoutes
    .filter((pkg) => pkg.status === 'downloaded')
    .reduce((acc, pkg) => acc + pkg.sizeBytes, 0);

  const pendingWeatherReports = incidents.filter(i => i.syncStatus === 'pending' || i.syncStatus === 'syncing');

  return (
    <div className="flex flex-col w-full gap-4 max-w-xl mx-auto pb-6">
      
      {/* Top Syncing Status Indicator */}
      {isSyncing && (
        <div className="flex justify-center -mt-2 mb-1">
          <div className="bg-orange-50 text-orange-950 border border-orange-300 dark:bg-[#121824] dark:text-white dark:border-primary/40 rounded-full px-4 py-1.5 flex items-center gap-2 shadow-md animate-pulse">
            <span className="material-symbols-outlined text-[16px] animate-spin text-primary">refresh</span>
            <span className="text-[12px] font-mono font-semibold text-orange-950 dark:text-white">
              {activeSyncEvent
                ? `Syncing [${activeSyncEvent.stage}]: ${activeSyncEvent.progressPercent}%`
                : `Synchronizing user data (${syncProgress}%)...`}
            </span>
          </div>
        </div>
      )}

      {/* Primary Network Status Card */}
      <div className="tactile-card rounded-2xl p-4 sm:p-5 flex flex-col gap-2 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Tactical mesh uplink status
            </span>
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-[22px] ${isOnline ? 'text-secondary' : 'text-amber-500 dark:text-amber-400'}`}>
                {isOnline ? 'satellite_alt' : 'cloud_off'}
              </span>
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {isOnline ? 'Satellite uplink active' : 'Offline local mode'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-200/80 text-slate-700 dark:bg-white/[0.06] dark:text-slate-300">
                Mode: {networkSimulationMode === 'auto' ? 'Auto-detect' : networkSimulationMode.charAt(0).toUpperCase() + networkSimulationMode.slice(1)}
              </span>
              <button
                type="button"
                onClick={handleProbeNow}
                disabled={isProbing}
                className="text-xs font-medium text-primary hover:text-orange-700 dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span className={`material-symbols-outlined text-[13px] ${isProbing ? 'animate-spin' : ''}`}>
                  {isProbing ? 'progress_activity' : 'refresh'}
                </span>
                <span>{isProbing ? 'Detecting...' : 'Probe uplink'}</span>
              </button>
            </div>
          </div>

          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#101622] flex items-center justify-center shrink-0 shadow-inner relative border border-slate-200 dark:border-white/[0.08]">
            <span className={`material-symbols-outlined text-[24px] ${isOnline ? 'text-secondary' : 'text-slate-500 dark:text-slate-400'}`}>
              {isOnline ? 'sync' : 'sync_problem'}
            </span>
          </div>
        </div>

        {/* User Isolation & Ledger Bar */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#0b1019] dark:border-white/[0.06] text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${currentUser ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse' : 'bg-amber-500 dark:bg-amber-400'}`} />
            <span className="text-slate-600 dark:text-slate-400 truncate">
              {currentUser ? 'Unique user ledger:' : 'Guest ledger:'}
            </span>
            <span className="font-semibold text-slate-900 dark:text-white truncate">
              {currentUser 
                ? (userProfile?.callsign || currentUser.displayName || currentUser.email) 
                : 'Local guest storage (Starts fresh on sign in)'}
            </span>
          </div>
          {currentUser ? (
            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-300 dark:text-emerald-400 dark:bg-emerald-950/60 dark:border-emerald-500/40 px-2 py-0.5 rounded shrink-0 font-medium">
              Cloud isolated
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentTab('account')}
              className="text-[10px] text-primary hover:text-white bg-primary/20 hover:bg-primary/30 border border-primary/50 px-2 py-0.5 rounded font-semibold transition-all cursor-pointer shrink-0"
            >
              Sign in / Register
            </button>
          )}
        </div>

        {/* Quick Network Selector Chips */}
        <div className="grid grid-cols-4 gap-1.5 mt-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 dark:bg-[#101622] dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => setNetworkSimulationMode('auto')}
            className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
              networkSimulationMode === 'auto'
                ? 'bg-orange-500 text-white shadow-sm dark:bg-primary/20 dark:text-primary dark:border dark:border-primary/40'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.04]'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">radar</span>
            Auto
          </button>

          <button
            type="button"
            onClick={() => setNetworkSimulationMode('online')}
            className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
              networkSimulationMode === 'online'
                ? 'bg-emerald-600 text-white shadow-sm dark:bg-secondary/20 dark:text-secondary dark:border dark:border-secondary/40'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.04]'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">satellite_alt</span>
            Online
          </button>

          <button
            type="button"
            onClick={() => setNetworkSimulationMode('spotty')}
            className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
              networkSimulationMode === 'spotty'
                ? 'bg-amber-500 text-white shadow-sm dark:bg-amber-500/20 dark:text-amber-400 dark:border dark:border-amber-500/40'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.04]'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">cell_wifi</span>
            Spotty
          </button>

          <button
            type="button"
            onClick={() => setNetworkSimulationMode('offline')}
            className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
              networkSimulationMode === 'offline'
                ? 'bg-amber-600 text-white shadow-sm dark:bg-tertiary/20 dark:text-tertiary dark:border dark:border-tertiary/40'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.04]'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">cloud_off</span>
            Offline
          </button>
        </div>

        {/* Sync Action Strip */}
        <div className="flex items-center justify-between bg-slate-50 px-4 py-3 rounded-xl mt-1 border border-slate-200 shadow-sm dark:bg-[#101622] dark:border-white/[0.06] dark:shadow-none">
          <div className="flex flex-col">
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Last synced: <span className="text-slate-900 dark:text-white font-mono font-bold">{getRelativeTime(lastSyncedTimestamp)}</span>
            </span>
            <span className="text-[11px] text-slate-600 dark:text-slate-400">
              <strong className="font-mono font-bold text-slate-900 dark:text-white">{downloadedRoutes.length}</strong> routes • <strong className="font-mono font-bold text-slate-900 dark:text-white">{gpsBreadcrumbs.length}</strong> track points • <strong className="font-mono font-bold text-slate-900 dark:text-white">{incidents.length}</strong> weather reports
            </span>
          </div>

          <button
            onClick={forceSync}
            disabled={isSyncing}
            id="sync-btn"
            className="tactile-btn-primary font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95 transition-all"
          >
            <span className={`material-symbols-outlined text-[17px] ${isSyncing ? 'animate-spin' : ''}`}>
              {isSyncing ? 'refresh' : 'sync'}
            </span>
            {isSyncing ? 'Syncing...' : 'Force sync'}
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: ROUTE LOG (USER TRAVEL & GPS BREADCRUMBS)
          ========================================================================= */}
      <div className="tactile-card rounded-2xl p-4 sm:p-5 border border-primary/30 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">timeline</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Route Log</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/25">
                  {gpsBreadcrumbs.length} points logged
                </span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                User-isolated GPS route tracks, active journey checkpoints, and speed breadcrumbs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportRouteLog}
              disabled={gpsBreadcrumbs.length === 0}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-slate-800 dark:text-white text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer"
              title="Export recorded GPS Route Log"
            >
              <span className="material-symbols-outlined text-[14px]">file_download</span>
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              type="button"
              onClick={() => {
                clearBreadcrumbs();
                showToast('✓ Route Log cleared for this session');
              }}
              disabled={gpsBreadcrumbs.length === 0}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700 dark:bg-white/[0.06] dark:hover:bg-red-950/40 dark:text-slate-300 dark:hover:text-red-400 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer"
              title="Clear recorded track log"
            >
              <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>

        {gpsBreadcrumbs.length === 0 ? (
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#101622] dark:border-white/[0.06] text-center flex flex-col items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">explore</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">No Route Log recorded yet</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 max-w-sm leading-relaxed">
                As you drive or track GPS in Navigation, your route breadcrumbs, travel checkpoints, and speed logs will be saved and isolated here for your unique account.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentTab('resilient-navigation')}
              className="mt-1 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:bg-primary/90 cursor-pointer transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">navigation</span>
              <span>Open Navigation & Start Tracking</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Quick summary strip */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#101622] border border-slate-200 dark:border-white/[0.06]">
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Recorded Points</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{gpsBreadcrumbs.length}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#101622] border border-slate-200 dark:border-white/[0.06]">
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Current Speed</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-secondary text-sm">{currentGPS.speed || 0} km/h</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#101622] border border-slate-200 dark:border-white/[0.06]">
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Current Altitude</span>
                <span className="font-mono font-bold text-blue-700 dark:text-blue-400 text-sm">{currentGPS.altitude || 216} m</span>
              </div>
            </div>

            {/* Recent track points list */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {gpsBreadcrumbs.slice(-10).reverse().map((point, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#121824] dark:border-white/[0.04] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span className="font-mono font-medium text-slate-900 dark:text-white truncate">
                      {point.latitude.toFixed(5)}°N, {point.longitude.toFixed(5)}°E
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] font-mono text-slate-500 shrink-0">
                    <span>{point.speed ? `${point.speed} km/h` : '0 km/h'}</span>
                    <span>•</span>
                    <span>{getRelativeTime(point.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          SECTION 2: DOWNLOADED ROUTES (OFFLINE ROAD CORRIDORS)
          ========================================================================= */}
      <div className="tactile-card rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 border border-primary/20">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 dark:text-secondary text-[22px]">download_for_offline</span>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Downloaded Routes</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                  {downloadedRoutes.length} saved
                </span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Full road vector corridors, elevation geometry, and turn maneuvers saved for offline navigation
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium shrink-0">
            Total cache: <span className="text-emerald-600 dark:text-secondary font-mono font-bold">{(totalCachedBytes / (1024 * 1024)).toFixed(1)} MB</span>
          </span>
        </div>

        {/* Custom Route Downloader Input */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#101622] dark:border-white/[0.06] flex flex-col gap-2.5 relative">
          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-[16px]">add_location_alt</span>
            Download New Route for Offline Use
          </span>

          <div className="flex items-center gap-2 relative">
            <span className="w-5 flex justify-center text-red-500">
              <span className="material-symbols-outlined text-[18px]">location_on</span>
            </span>
            <div className="flex-1 flex items-center bg-white dark:bg-[#141b26] rounded-xl px-3 py-2 border border-slate-200 dark:border-white/[0.08] focus-within:border-primary transition-colors">
              <input
                type="text"
                value={customDestinationText}
                onChange={(e) => handleDestinationSearchChange(e.target.value)}
                onFocus={() => customDestinationText.length >= 2 && setShowDestSuggestions(true)}
                placeholder="Enter destination city (e.g. Jaipur, Agra, Mumbai, Delhi)..."
                className="w-full bg-transparent text-xs text-slate-900 dark:text-white font-medium focus:outline-none placeholder-slate-400"
              />
              {isSearchingDest ? (
                <span className="material-symbols-outlined text-[16px] text-slate-400 animate-spin">
                  progress_activity
                </span>
              ) : customDestinationText ? (
                <button
                  type="button"
                  onClick={() => {
                    setCustomDestinationText('');
                    setCustomDestinationCoord(null);
                    setCalculatedCustomRoute(null);
                    setCustomPlaceSuggestions([]);
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Autocomplete Dropdown */}
          {showDestSuggestions && customPlaceSuggestions.length > 0 && (
            <div className="absolute top-[85px] left-9 right-4 z-30 bg-white dark:bg-[#141b26] border border-slate-200 dark:border-white/[0.12] rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
              {customPlaceSuggestions.map((place, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectDestSuggestion(place)}
                  className="p-2.5 hover:bg-slate-100 dark:hover:bg-[#1f2937] cursor-pointer border-b border-slate-100 dark:border-white/[0.04] last:border-0 flex items-start gap-2 text-xs"
                >
                  <span className="material-symbols-outlined text-primary text-[16px] mt-0.5 shrink-0">place</span>
                  <div className="flex-1 truncate">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{place.name}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{place.address}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleCalculateCustomRoute}
            disabled={isCalculatingRoute || !customDestinationText.trim()}
            className="w-full py-2.5 px-4 rounded-xl tactile-btn-primary font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <span className={`material-symbols-outlined text-[18px] ${isCalculatingRoute ? 'animate-spin' : ''}`}>
              {isCalculatingRoute ? 'sync' : 'route'}
            </span>
            <span>
              {isCalculatingRoute ? 'Calculating road corridor geometry...' : 'Calculate Corridor for Offline Download'}
            </span>
          </button>

          {customRouteCalcError && (
            <p className="text-[11px] text-red-600 dark:text-red-400 font-medium pl-6">
              ⚠️ {customRouteCalcError}
            </p>
          )}

          {/* Calculated Route Preview Card */}
          {calculatedCustomRoute && (
            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-300 dark:bg-[#0f1725] dark:border-emerald-500/40 flex flex-col gap-2.5 mt-1 animate-fadeIn">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                    {calculatedCustomRoute.name}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                    <span>{calculatedCustomRoute.distanceKm} km</span>
                    <span>•</span>
                    <span>{formatDuration(calculatedCustomRoute.estMinutes)}</span>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
                  {(() => {
                    const tiles = Math.max(320, Math.round(calculatedCustomRoute.distanceKm * 4.6 + 160));
                    return `~${((tiles * 13800) / (1024 * 1024)).toFixed(1)} MB`;
                  })()}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  downloadRouteMap(calculatedCustomRoute);
                  setCalculatedCustomRoute(null);
                  setCustomDestinationText('');
                }}
                className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">download_for_offline</span>
                <span>Download & Save Route in Sync</span>
              </button>
            </div>
          )}
        </div>

        {/* Downloaded Routes Grid */}
        {downloadedRoutes.length === 0 ? (
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#101622] dark:border-white/[0.06] text-center flex flex-col items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">map</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">No offline routes downloaded yet</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 max-w-sm">
                Enter any destination above or tap "Download Map for Offline" in the Navigation tab to cache road vector corridors.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {downloadedRoutes.map((routePkg) => {
              const isDownloaded = routePkg.status === 'downloaded';
              const isDownloading = routePkg.status === 'downloading';

              return (
                <div
                  key={routePkg.id}
                  className="bg-white border border-slate-200 shadow-sm rounded-xl p-3.5 flex flex-col justify-between gap-3 dark:bg-[#121927] dark:border-white/[0.08] dark:shadow-none"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider truncate">
                          {routePkg.primaryRoad || 'HIGHWAY CORRIDOR'}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
                          {routePkg.name}
                        </h4>
                        <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                          Dest: <b className="text-slate-800 dark:text-slate-200 font-medium">{routePkg.destination}</b>
                        </span>
                      </div>

                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded shrink-0 border ${
                        isDownloaded
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                          : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                      }`}>
                        {routePkg.sizeFormatted}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 mt-1 text-center text-[10px] font-mono">
                      <div className="bg-slate-50 dark:bg-[#0c1119] p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.04]">
                        <span className="text-slate-500 block text-[9px]">DIST</span>
                        <span className="font-bold text-slate-900 dark:text-white">{routePkg.distanceKm} km</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-[#0c1119] p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.04]">
                        <span className="text-slate-500 block text-[9px]">TIME</span>
                        <span className="font-bold text-blue-700 dark:text-blue-400">
                          {Math.floor(routePkg.estMinutes / 60)}h {routePkg.estMinutes % 60}m
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-[#0c1119] p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.04]">
                        <span className="text-slate-500 block text-[9px]">TILES</span>
                        <span className="font-bold text-emerald-700 dark:text-secondary">{routePkg.tileCount.toLocaleString()}</span>
                      </div>
                    </div>

                    {isDownloading && (
                      <div className="w-full bg-slate-200 dark:bg-[#0c1119] h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className="bg-amber-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${routePkg.downloadProgress}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/[0.04] text-xs">
                    <button
                      type="button"
                      onClick={() => purgeDownloadedRoute(routePkg.id)}
                      className="text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      title="Remove route from local storage"
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                      <span>Purge</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => launchOfflineRoute(routePkg)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">navigation</span>
                      <span>Navigate offline</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          SECTION 3: WEATHER REPORTS (HAZARDS & SEVERE WEATHER LOGS)
          ========================================================================= */}
      <div className="tactile-card rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 border border-primary/20">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500 dark:text-amber-400 text-[22px]">warning</span>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Weather Reports</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  {incidents.length} logged
                </span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Severe cyclone alerts, road flood hazards, storm warnings, and operator weather reports
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCurrentTab('incident-reporting')}
            className="px-2.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[15px]">add</span>
            <span>Report Hazard</span>
          </button>
        </div>

        {incidents.length === 0 ? (
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#101622] dark:border-white/[0.06] text-center flex flex-col items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">cloud_done</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">No Weather Reports logged yet</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 max-w-sm">
                Driver-submitted weather hazard reports, cyclone warnings, and road blockages will sync securely with your cloud ledger.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentTab('incident-reporting')}
              className="mt-1 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:bg-primary/90 cursor-pointer transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">add_alert</span>
              <span>Report Weather Hazard</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {incidents.map((incident) => {
              const isSynced = incident.syncStatus === 'synced';

              return (
                <div
                  key={incident.id || incident.report_id}
                  className="bg-white border border-slate-200 shadow-sm p-3.5 rounded-xl dark:bg-[#121824] dark:border-white/[0.08] dark:shadow-none flex flex-col gap-2 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 border border-amber-500/20">
                        <span className="material-symbols-outlined text-[18px]">
                          {incident.category === 'landslide' ? 'landslide' : incident.category === 'weather_hazard' ? 'thunderstorm' : 'warning'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {incident.title}
                          </span>
                          <span className="text-[10px] font-mono uppercase font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-300">
                            {incident.category.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed line-clamp-2">
                          {incident.description}
                        </p>
                      </div>
                    </div>

                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 border flex items-center gap-1 ${
                      isSynced
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                        : 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                    }`}>
                      <span className="material-symbols-outlined text-[12px]">
                        {isSynced ? 'check_circle' : 'cloud_upload'}
                      </span>
                      <span>{isSynced ? 'Synced' : 'Pending'}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-slate-500 border-t border-slate-100 dark:border-white/[0.04]">
                    <span>📍 {incident.latitude.toFixed(4)}°N, {incident.longitude.toFixed(4)}°E</span>
                    <span>{incident.district_road_segment || getRelativeTime(incident.timestamp)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Diagnostics Verification Suite (Collapsible) */}
      <div className="flex items-center justify-between mt-1 px-1">
        <h2 className="text-xs font-semibold text-slate-400">
          Architecture & offline verification diagnostics
        </h2>
        <button
          onClick={() => setShowTestRunner(!showTestRunner)}
          className="text-xs text-primary font-semibold hover:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">
            {showTestRunner ? 'expand_less' : 'biotech'}
          </span>
          {showTestRunner ? 'Hide diagnostics' : 'Open diagnostics'}
        </button>
      </div>

      {showTestRunner && (
        <IncidentTestRunner />
      )}

    </div>
  );
};
