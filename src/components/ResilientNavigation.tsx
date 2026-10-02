import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { TacticalMap } from './TacticalMap';
import { Waypoint, RouteOption, RouteIncidentMatch, NavigationStep } from '../types';
import { searchPlaces } from '../services/real-location.service';
import { calculateRoadRoute } from '../services/road-routing.service';
import { formatDuration, parseCoordinateInput } from '../services/gps-geojson.service';

export const ResilientNavigation: React.FC = () => {
  const {
    currentGPS,
    gpsSource,
    isRealGPSFix,
    realLocationAddress,
    isLocating,
    activateRealGPS,
    switchToSimulation,
    recenterMapCounter,
    triggerRecenterOnUser,
    activeRoute,
    setActiveRoute,
    alternativeRoutes,
    calculateRoadRouteToDestination,
    isRoutingLoading,
    routingError,
    waypoints,
    incidents,
    gpsBreadcrumbs,
    clearBreadcrumbs,
    setCurrentTab,
    showToast,
    startDrivingJourney,
    isFullScreenMap,
    setIsFullScreenMap,
    downloadedRoutes,
    downloadRouteMap,
    isRouteDownloading
  } = useApp();

  const { t } = useLanguage();
  const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null);
  const [isPinDropMode, setIsPinDropMode] = useState<boolean>(false);
  const [showWaypointList, setShowWaypointList] = useState<boolean>(false);
  const [showTurnByTurn, setShowTurnByTurn] = useState<boolean>(true);

  // Google Maps Direction Search States
  const [originText, setOriginText] = useState<string>('📍 My Current Location');
  const [originCoord, setOriginCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationText, setDestinationText] = useState<string>('');
  const [destinationCoord, setDestinationCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [showRoutePlanner, setShowRoutePlanner] = useState<boolean>(true);

  // Place search autocomplete suggestions
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchTarget, setSearchTarget] = useState<'origin' | 'destination'>('destination');
  const [placeSuggestions, setPlaceSuggestions] = useState<{ name: string; lat: number; lng: number; address: string }[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const searchTimeoutRef = useRef<any>(null);

  // Update origin label based on real location address (only if not customized manually)
  useEffect(() => {
    if (originCoord) return;
    if (realLocationAddress) {
      setOriginText(`📍 ${realLocationAddress}`);
    } else if (gpsSource === 'device') {
      setOriginText(`📍 Real Location (${currentGPS.latitude.toFixed(5)}°N, ${currentGPS.longitude.toFixed(5)}°E)`);
    } else {
      setOriginText('📍 My Current Location');
    }
  }, [gpsSource, realLocationAddress, currentGPS.latitude, currentGPS.longitude, originCoord]);

  // Convert degrees to cardinal direction
  const getCardinalDirection = (deg: number | null) => {
    if (deg === null) return 'N';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((deg % 360) / 45)) % 8;
    return directions[index];
  };

  const handleMapCoordinateSelected = (lat: number, lng: number) => {
    if (isPinDropMode) {
      setIsPinDropMode(false);
      showToast(`Selected Location: ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E`);
      setCurrentTab('incident-reporting');
    }
  };

  // Distance calculation helper (Haversine formula in meters)
  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Check route clearance and incident matches for any route
  const getRouteIncidents = (route: RouteOption | null): RouteIncidentMatch[] => {
    if (!route || !route.waypoints || route.waypoints.length === 0) return [];
    const matches: RouteIncidentMatch[] = [];

    incidents.forEach((inc) => {
      let minDistance = Infinity;
      let closestIdx = 0;

      route.waypoints.forEach((wp, idx) => {
        const dist = getDistanceMeters(inc.latitude, inc.longitude, wp[0], wp[1]);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      // If incident is within 450 meters of route path, consider it an active route hazard
      if (minDistance <= 450) {
        matches.push({
          incident: inc,
          distanceToRouteMeters: Math.round(minDistance),
          closestWaypointIndex: closestIdx,
          hazardImpact: minDistance < 150 ? 'direct_blockage' : 'corridor_hazard'
        });
      }
    });

    return matches;
  };

  const activeRouteIncidents = useMemo(() => getRouteIncidents(activeRoute), [activeRoute, incidents]);
  const isRouteClear = activeRouteIncidents.length === 0;

  // Search origin location debounce and coordinate parsing
  const handleOriginChange = (text: string) => {
    setOriginText(text);
    setSearchQuery(text);
    setSearchTarget('origin');

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!text || text.trim().length < 2) {
      setPlaceSuggestions([]);
      setShowSuggestions(false);
      setOriginCoord(null);
      return;
    }

    const parsedCoord = parseCoordinateInput(text);
    if (parsedCoord) {
      setOriginCoord(parsedCoord);
      const coordLabel = `📍 Start Coordinates: ${parsedCoord.lat.toFixed(5)}°N, ${parsedCoord.lng.toFixed(5)}°E`;
      setPlaceSuggestions([
        {
          name: coordLabel,
          lat: parsedCoord.lat,
          lng: parsedCoord.lng,
          address: `Exact Latitude & Longitude (${parsedCoord.lat}, ${parsedCoord.lng})`
        }
      ]);
      setShowSuggestions(true);
      setIsSearchingPlaces(false);
      return;
    }

    setIsSearchingPlaces(true);
    setShowSuggestions(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(text, currentGPS.latitude, currentGPS.longitude);
        setPlaceSuggestions(results);
      } catch {
        setPlaceSuggestions([]);
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 400);
  };

  // Search destination places debounce & coordinate auto-detection
  const handleDestinationChange = (text: string) => {
    setDestinationText(text);
    setSearchQuery(text);
    setSearchTarget('destination');

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!text || text.trim().length < 2) {
      setPlaceSuggestions([]);
      setShowSuggestions(false);
      setDestinationCoord(null);
      return;
    }

    // Check if input is direct latitude and longitude coordinates
    const parsedCoord = parseCoordinateInput(text);
    if (parsedCoord) {
      setDestinationCoord(parsedCoord);
      const coordLabel = `📍 Target Coordinates: ${parsedCoord.lat.toFixed(5)}°N, ${parsedCoord.lng.toFixed(5)}°E`;
      setPlaceSuggestions([
        {
          name: coordLabel,
          lat: parsedCoord.lat,
          lng: parsedCoord.lng,
          address: `Exact Latitude & Longitude (${parsedCoord.lat}, ${parsedCoord.lng})`
        }
      ]);
      setShowSuggestions(true);
      setIsSearchingPlaces(false);
      return;
    }

    setIsSearchingPlaces(true);
    setShowSuggestions(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(text, currentGPS.latitude, currentGPS.longitude);
        setPlaceSuggestions(results);
      } catch {
        setPlaceSuggestions([]);
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 400);
  };

  // Handle selecting a place or coordinate suggestion
  const handleSelectSuggestion = (place: { name: string; lat: number; lng: number; address: string }) => {
    const isCoordName = place.name.includes('Coordinates');
    const label = isCoordName ? `Coordinates (${place.lat.toFixed(5)}°N, ${place.lng.toFixed(5)}°E)` : place.name;
    
    if (searchTarget === 'origin') {
      setOriginText(label);
      setOriginCoord({ lat: place.lat, lng: place.lng });
      setShowSuggestions(false);
      showToast(`📍 Start Point Locked: ${label}`);
    } else {
      setDestinationText(label);
      setDestinationCoord({ lat: place.lat, lng: place.lng });
      setShowSuggestions(false);
      
      const startCoord = originCoord || { lat: currentGPS.latitude, lng: currentGPS.longitude };
      calculateRoadRouteToDestination(place.lat, place.lng, label, startCoord);
    }
  };

  // Download map for offline use for any entered destination
  const handleDownloadDestinationMap = async (targetPlace?: { name: string; lat: number; lng: number }) => {
    let targetLat: number | null = targetPlace ? targetPlace.lat : destinationCoord ? destinationCoord.lat : null;
    let targetLng: number | null = targetPlace ? targetPlace.lng : destinationCoord ? destinationCoord.lng : null;
    let destName = targetPlace ? targetPlace.name : destinationText.trim();

    if (!destName && (!targetLat || !targetLng)) {
      showToast('⚠️ Please enter a destination or coordinates first to download offline map.');
      return;
    }

    // If active route matches the entered destination, trigger download directly
    if (activeRoute && (activeRoute.destination.toLowerCase().includes(destName.toLowerCase()) || destName.toLowerCase().includes(activeRoute.destination.toLowerCase()))) {
      downloadRouteMap(activeRoute);
      return;
    }

    // Otherwise, resolve coordinates if needed and calculate route to download
    try {
      if (targetLat === null || targetLng === null) {
        const parsed = parseCoordinateInput(destName);
        if (parsed) {
          targetLat = parsed.lat;
          targetLng = parsed.lng;
        } else {
          const places = await searchPlaces(destName, currentGPS.latitude, currentGPS.longitude);
          if (places && places.length > 0) {
            targetLat = places[0].lat;
            targetLng = places[0].lng;
            destName = places[0].name;
            setDestinationText(places[0].name);
            setDestinationCoord({ lat: places[0].lat, lng: places[0].lng });
          }
        }
      }

      if (targetLat === null || targetLng === null) {
        showToast(`⚠️ Could not locate "${destName}". Please enter valid coordinates or pick from suggestions.`);
        return;
      }

      showToast(`Calculating road corridor for ${destName}...`);
      const routes = await calculateRoadRoute(
        { lat: currentGPS.latitude, lng: currentGPS.longitude },
        { lat: targetLat, lng: targetLng },
        destName
      );

      if (routes && routes.length > 0) {
        setActiveRoute(routes[0]);
        await downloadRouteMap(routes[0]);
      } else {
        showToast('⚠️ Could not determine road corridor for offline map.');
      }
    } catch (err: any) {
      showToast(`⚠️ Offline map download error: ${err?.message || 'Route calculation failed'}`);
    }
  };

  // Handle selecting a tactical waypoint
  const handleSelectWaypointDestination = (wp: Waypoint) => {
    setDestinationText(`${wp.code} - ${wp.name}`);
    setDestinationCoord({ lat: wp.latitude, lng: wp.longitude });
    setShowSuggestions(false);
    const startCoord = originCoord || { lat: currentGPS.latitude, lng: currentGPS.longitude };
    calculateRoadRouteToDestination(wp.latitude, wp.longitude, wp.name, startCoord);
  };

  // Trigger Road Route Calculation supporting both manual origin and destination
  const handleCalculateRoute = async () => {
    let resolvedOrigin = originCoord;
    let resolvedDest = destinationCoord;

    // 1. Resolve Origin Coordinates
    if (!resolvedOrigin) {
      const parsed = parseCoordinateInput(originText);
      if (parsed) {
        resolvedOrigin = parsed;
        setOriginCoord(parsed);
      } else if (originText.includes('Current Location') || originText.includes('My Location')) {
        resolvedOrigin = { lat: currentGPS.latitude, lng: currentGPS.longitude };
      } else if (originText.trim().length > 1) {
        try {
          const results = await searchPlaces(originText, currentGPS.latitude, currentGPS.longitude);
          if (results && results.length > 0) {
            resolvedOrigin = { lat: results[0].lat, lng: results[0].lng };
            setOriginCoord(resolvedOrigin);
            setOriginText(results[0].name);
          }
        } catch {}
      }
    }

    // 2. Resolve Destination Coordinates
    if (!resolvedDest) {
      const parsed = parseCoordinateInput(destinationText);
      if (parsed) {
        resolvedDest = parsed;
        setDestinationCoord(parsed);
      } else if (destinationText.trim().length > 1) {
        try {
          const results = await searchPlaces(destinationText, currentGPS.latitude, currentGPS.longitude);
          if (results && results.length > 0) {
            resolvedDest = { lat: results[0].lat, lng: results[0].lng };
            setDestinationCoord(resolvedDest);
            setDestinationText(results[0].name);
          }
        } catch {}
      }
    }

    if (!resolvedDest) {
      showToast('⚠️ Please enter a valid destination city or coordinates.');
      return;
    }

    const startCoord = resolvedOrigin || { lat: currentGPS.latitude, lng: currentGPS.longitude };
    
    showToast('🚗 Calculating actual route along available roads...');
    setShowSuggestions(false);
    await calculateRoadRouteToDestination(resolvedDest.lat, resolvedDest.lng, destinationText, startCoord);
  };

  // Helper icon for navigation maneuvers
  const getManeuverIcon = (maneuver: string) => {
    if (maneuver.includes('left')) return 'turn_left';
    if (maneuver.includes('right')) return 'turn_right';
    if (maneuver.includes('roundabout')) return 'roundabout_right';
    if (maneuver.includes('arrive')) return 'flag';
    if (maneuver.includes('depart')) return 'navigation';
    if (maneuver.includes('ramp') || maneuver.includes('exit')) return 'ramp_right';
    return 'straight';
  };

  return (
    <div className="flex flex-col w-full gap-3 max-w-xl mx-auto pb-6">
      
      {/* Real-Time Location Tracker Control Bar: Shown when not turned on; once turned on, it goes away on screen */}
      {(!isRealGPSFix || gpsSource !== 'device') && (
        <div className="tactile-card rounded-2xl p-4 transition-all relative overflow-hidden border border-amber-500/30 bg-amber-500/5 shadow-sm animate-fadeIn">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center bg-amber-400 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-amber-500 dark:text-amber-400">
                    Tactical simulation active
                  </span>
                  {isLocating && (
                    <span className="material-symbols-outlined text-blue-400 text-[14px] animate-spin">
                      progress_activity
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px] sm:max-w-xs">
                  {realLocationAddress || (
                    <span className="font-mono">{currentGPS.latitude.toFixed(6)}°N, {currentGPS.longitude.toFixed(6)}°E</span>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={activateRealGPS}
              disabled={isLocating}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-500/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
              title="Trace and lock real device GPS"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isLocating ? 'sync' : 'near_me'}
              </span>
              <span>{isLocating ? 'Acquiring...' : 'Trace device GPS'}</span>
            </button>
          </div>

          {/* Precision readout strip */}
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-200 dark:border-white/[0.06] text-xs text-slate-600 dark:text-slate-400">
            <span>Lat: <b className="text-slate-900 dark:text-white font-mono font-medium">{currentGPS.latitude.toFixed(6)}°</b></span>
            <span>Lng: <b className="text-slate-900 dark:text-white font-mono font-medium">{currentGPS.longitude.toFixed(6)}°</b></span>
            <span>Accuracy: <b className="text-blue-700 dark:text-blue-400 font-mono font-medium">±{Math.round(currentGPS.accuracy)}m</b></span>
            <span>Speed: <b className="text-emerald-700 dark:text-secondary font-mono font-medium">{currentGPS.speed || 0} km/h</b></span>
          </div>
        </div>
      )}

      {/* Route & Location Search Bar */}
      <div className="tactile-card rounded-2xl p-4 flex flex-col gap-2.5 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[19px]">directions</span>
            <span className="text-base font-semibold text-white">
              Road network routing & elevation
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowRoutePlanner(!showRoutePlanner)}
            className="text-xs text-primary font-semibold hover:underline cursor-pointer"
          >
            {showRoutePlanner ? 'Hide' : 'Directions'}
          </button>
        </div>

        {showRoutePlanner && (
          <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
            {/* Origin Input */}
            <div className="flex items-center gap-2">
              <div className="w-6 flex flex-col items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-primary/20 shrink-0" />
                <div className="w-0.5 h-6 bg-white/[0.1] my-0.5" />
              </div>
              <div className="flex-1 flex items-center bg-[#101622] rounded-xl px-3 py-2 border border-white/[0.08] focus-within:border-primary/60 transition-colors">
                <input
                  type="text"
                  value={originText}
                  onChange={(e) => handleOriginChange(e.target.value)}
                  onFocus={() => {
                    setSearchTarget('origin');
                    if (originText.length >= 2) setShowSuggestions(true);
                  }}
                  placeholder="Enter starting location or coordinates..."
                  className="w-full bg-transparent text-xs text-white focus:outline-none truncate font-medium"
                />
                <button
                  type="button"
                  onClick={() => {
                    setOriginCoord(null);
                    if (realLocationAddress) {
                      setOriginText(`📍 ${realLocationAddress}`);
                    } else {
                      setOriginText('📍 My Current Location');
                    }
                    activateRealGPS();
                    showToast('📍 Locked to real device GPS location');
                  }}
                  className="text-[11px] text-primary font-semibold px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 whitespace-nowrap cursor-pointer transition-all active:scale-95"
                  title="Lock start point to current device GPS coordinates"
                >
                  Lock GPS
                </button>
              </div>
            </div>

            {/* Destination Input with Autocomplete */}
            <div className="flex items-center gap-2 relative">
              <div className="w-6 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-500 text-[18px]">location_on</span>
              </div>
              <div className="flex-1 flex items-center bg-[#101622] rounded-xl px-3 py-2 border border-white/[0.08] focus-within:border-primary/60 transition-colors">
                <input
                  type="text"
                  value={destinationText}
                  onChange={(e) => handleDestinationChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCalculateRoute();
                    }
                  }}
                  onFocus={() => {
                    setSearchTarget('destination');
                    if (destinationText.length >= 2) setShowSuggestions(true);
                  }}
                  placeholder="Enter destination, city (e.g. Delhi, Mumbai, Bengaluru), or NH highway..."
                  className="w-full bg-transparent text-xs text-white font-medium focus:outline-none"
                />
                {isSearchingPlaces ? (
                  <span className="material-symbols-outlined text-[16px] text-slate-400 animate-spin">
                    progress_activity
                  </span>
                ) : destinationText ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDestinationText('');
                      setDestinationCoord(null);
                      setPlaceSuggestions([]);
                      setActiveRoute(null);
                    }}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                ) : null}
              </div>
            </div>

            {/* Place Autocomplete Suggestions Dropdown with Quick Offline Download */}
            {showSuggestions && placeSuggestions.length > 0 && (
              <div className={`absolute left-8 right-3 z-30 bg-[#141b26] border border-white/[0.12] rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto backdrop-blur-2xl divide-y divide-white/[0.04] ${searchTarget === 'origin' ? 'top-[72px]' : 'top-[115px]'}`}>
                {placeSuggestions.map((place, idx) => {
                  const downloadedPkg = downloadedRoutes.find(
                    r => r.destination.toLowerCase().includes(place.name.toLowerCase()) || r.name.toLowerCase().includes(place.name.toLowerCase())
                  );
                  const isDownloaded = !!downloadedPkg && downloadedPkg.status === 'downloaded';
                  const isDownloading = !!downloadedPkg && downloadedPkg.status === 'downloading';

                  return (
                    <div
                      key={idx}
                      className="p-2.5 hover:bg-[#1f2937] flex items-center justify-between gap-2 text-xs transition-colors"
                    >
                      <div
                        onClick={() => handleSelectSuggestion(place)}
                        className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-primary text-[16px] mt-0.5 shrink-0">place</span>
                        <div className="flex-1 truncate">
                          <div className="font-bold text-white truncate">{place.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{place.address}</div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {isDownloaded ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentTab('offline-sync-center');
                            }}
                            className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                            title="Saved in Offline Vault"
                          >
                            <span className="material-symbols-outlined text-[12px]">verified</span>
                            <span>In Vault</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowSuggestions(false);
                              handleDownloadDestinationMap(place);
                            }}
                            disabled={isDownloading}
                            className="px-2.5 py-1 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                            title="Download map for offline use and save in Offline Vault"
                          >
                            <span className={`material-symbols-outlined text-[12px] ${isDownloading ? 'animate-spin' : ''}`}>
                              {isDownloading ? 'sync' : 'download'}
                            </span>
                            <span>{isDownloading ? 'Syncing...' : 'Download Map'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Offline Pre-cache Notice if Destination Entered */}
            {destinationText.trim().length > 1 && (
              <div className="mt-1 p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/30 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-blue-400 text-[18px] shrink-0">cloud_download</span>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-white truncate">Offline Map Available for this Destination</span>
                    <span className="text-[11px] text-slate-400 truncate">Save road tiles to local storage for navigation with zero internet.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadDestinationMap()}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] flex items-center gap-1 shrink-0 shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[13px]">download_for_offline</span>
                  <span>Save in Vault</span>
                </button>
              </div>
            )}

            {/* Action Buttons: Calculate Route */}
            <div className="mt-1">
              <button
                type="button"
                onClick={handleCalculateRoute}
                disabled={isRoutingLoading}
                className="w-full py-2.5 px-4 rounded-xl tactile-btn-primary font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isRoutingLoading ? 'sync' : 'directions_car'}
                </span>
                <span>
                  {isRoutingLoading
                    ? 'Calculating road route...'
                    : 'Calculate route'}
                </span>
              </button>
            </div>

            {routingError && (
              <p className="text-[11px] text-red-400 font-medium pl-8">
                ⚠️ {routingError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Main Interactive Tactical Map */}
      <TacticalMap
        heightClass="h-[380px] sm:h-[440px]"
        onSelectCoordinate={handleMapCoordinateSelected}
        isPinDropMode={isPinDropMode}
        onSelectWaypoint={(wp) => setSelectedWaypoint(wp)}
      />

      {/* Map Action Quick Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <button
          type="button"
          onClick={() => {
            triggerRecenterOnUser();
            showToast('📍 Centered map on current location');
          }}
          className="py-2 px-3 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white border border-blue-500 shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 col-span-2 sm:col-span-1"
          title="Center map on my current GPS location"
        >
          <span className="material-symbols-outlined text-[18px]">my_location</span>
          <span>Center GPS</span>
        </button>

        <button
          type="button"
          onClick={() => setIsPinDropMode(!isPinDropMode)}
          className={`py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all border cursor-pointer ${
            isPinDropMode
              ? 'bg-amber-500 text-black border-amber-400 shadow-lg'
              : 'bg-[#121824] hover:bg-[#1a2332] text-slate-200 border-white/[0.08]'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isPinDropMode ? 'cancel' : 'add_location_alt'}
          </span>
          {isPinDropMode ? t('hud.cancel_pin') : t('hud.drop_pin')}
        </button>

        <button
          type="button"
          onClick={() => setShowWaypointList(!showWaypointList)}
          className="py-2 px-3 rounded-xl font-semibold text-xs bg-[#121824] hover:bg-[#1a2332] text-slate-200 border border-white/[0.08] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">flag</span>
          {t('hud.waypoints')} ({waypoints.length})
        </button>

        <button
          type="button"
          onClick={() => {
            const next = !isFullScreenMap;
            setIsFullScreenMap(next);
            showToast(next ? 'Full Map View: Maximized' : 'Exited Full Map View');
          }}
          className={`py-2 px-3 rounded-xl font-semibold text-xs border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            isFullScreenMap
              ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-md'
              : 'bg-[#121824] hover:bg-[#1a2332] text-slate-200 border-white/[0.08]'
          }`}
          title={isFullScreenMap ? "Minimise Map" : "Open Fullscreen Driving Map"}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isFullScreenMap ? 'fullscreen_exit' : 'fullscreen'}
          </span>
          <span>{isFullScreenMap ? 'Minimise' : 'Full map'}</span>
        </button>

        <button
          type="button"
          onClick={clearBreadcrumbs}
          disabled={gpsBreadcrumbs.length === 0}
          className="py-2 px-3 rounded-xl font-semibold text-xs bg-[#121824] hover:bg-[#1a2332] text-slate-400 hover:text-red-400 border border-white/[0.08] flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
          {t('hud.reset_track')}
        </button>
      </div>

      {/* Empty State / Prompt to Enter Destination */}
      {!activeRoute && !isRoutingLoading && (
        <div className="flex flex-col gap-3">
          <div className="tactile-card rounded-2xl p-4 flex items-center gap-3.5 border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#101622]/80 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-[24px]">explore</span>
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-base text-slate-900 dark:text-white">Ready for Navigation & Offline Pre-caching</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                Enter any destination above or tap anywhere on the map to calculate real road routes and offline GPS navigation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Road Route Guidance & Turn-by-Turn Maneuvers */}
      {activeRoute && (
        <div className="tactile-card rounded-2xl p-4 flex flex-col gap-3.5">
          
          {/* Header & Road Summary Banner */}
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-primary">
                  {activeRoute.isRealRoadRoute ? '🚗 Drivable road route' : 'Tactical corridor'}
                </span>
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20">
                  {activeRoute.callsign || 'ROAD-NAV'}
                </span>
              </div>
              <h3 className="font-semibold text-base text-white mt-0.5">{activeRoute.name}</h3>
              <p className="text-xs text-slate-400">Destination: {activeRoute.destination}</p>
            </div>


          </div>

          {/* Quick Metrics: Distance, ETA, Elevation */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 border border-slate-200 shadow-sm p-2.5 rounded-xl dark:bg-[#101622] dark:border-white/[0.06] dark:shadow-none">
              <span className="text-slate-600 dark:text-slate-400 text-xs block font-medium">Distance</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white text-base">{activeRoute.distanceKm} km</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 shadow-sm p-2.5 rounded-xl dark:bg-[#101622] dark:border-white/[0.06] dark:shadow-none">
              <span className="text-slate-600 dark:text-slate-400 text-xs block font-medium">Estimated time</span>
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400 text-base">{formatDuration(activeRoute.estMinutes)}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 shadow-sm p-2.5 rounded-xl dark:bg-[#101622] dark:border-white/[0.06] dark:shadow-none">
              <span className="text-slate-600 dark:text-slate-400 text-xs block font-medium">Elevation gain</span>
              <span className="font-mono font-bold text-orange-700 dark:text-primary text-base">+{activeRoute.elevationGainM} m</span>
            </div>
          </div>

          {/* Offline Route Map Cache & Sync Status Banner */}
          {(() => {
            const downloadedPkg = downloadedRoutes.find(
              r => r.routeId === activeRoute.id || r.name === activeRoute.name
            );
            const isDownloaded = !!downloadedPkg && downloadedPkg.status === 'downloaded';
            const isDownloading = !!downloadedPkg && downloadedPkg.status === 'downloading';
            const estimatedTiles = Math.max(320, Math.round(activeRoute.distanceKm * 4.6 + 160));
            const estimatedMb = ((estimatedTiles * 13800) / (1024 * 1024)).toFixed(1);

            return (
              <div className={`p-3 rounded-xl border transition-all ${
                isDownloaded
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-500/30'
                  : isDownloading
                  ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-500/30'
                  : 'bg-slate-50 border-slate-200 dark:bg-[#121927] dark:border-white/[0.08]'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isDownloaded
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                        : isDownloading
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                        : 'bg-orange-100 text-orange-700 dark:bg-primary/20 dark:text-primary'
                    }`}>
                      <span className={`material-symbols-outlined text-[18px] ${isDownloading ? 'animate-spin' : ''}`}>
                        {isDownloaded ? 'verified' : isDownloading ? 'sync' : 'cloud_download'}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {isDownloaded
                            ? 'Offline Route Map Cached'
                            : isDownloading
                            ? `Downloading Route Map (${downloadedPkg?.downloadProgress || 10}%)`
                            : 'Download Route for Offline Use'}
                        </span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                          isDownloaded
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-700 dark:bg-white/[0.1] dark:text-slate-300'
                        }`}>
                          {isDownloaded ? downloadedPkg?.sizeFormatted : `~${estimatedMb} MB`}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                        {isDownloaded
                          ? 'Saved in Offline Vault • Ready for disconnected navigation'
                          : isDownloading
                          ? 'Caching road network tiles to offline storage...'
                          : `Pre-cache ~${estimatedTiles.toLocaleString()} road corridor tiles into Offline Vault`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isDownloaded ? (
                      <button
                        type="button"
                        onClick={() => setCurrentTab('offline-sync-center')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                        title="View and manage in Offline Vault"
                      >
                        <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                        <span className="hidden sm:inline">View in</span> Vault
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => downloadRouteMap(activeRoute)}
                        disabled={isDownloading}
                        className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-primary/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          {isDownloading ? 'sync' : 'download'}
                        </span>
                        <span>{isDownloading ? `${downloadedPkg?.downloadProgress}%` : 'Download'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Download Progress Bar */}
                {isDownloading && (
                  <div className="w-full bg-slate-200 dark:bg-[#101622] h-1.5 rounded-full overflow-hidden mt-2.5">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${downloadedPkg?.downloadProgress || 10}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Alternative Road Routes Switcher with Instant Offline Download */}
          {alternativeRoutes.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Alternative road routes ({alternativeRoutes.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {alternativeRoutes.map((altRoute) => {
                  const downloadedPkg = downloadedRoutes.find(
                    r => r.routeId === altRoute.id || r.name === altRoute.name
                  );
                  const isDownloaded = !!downloadedPkg && downloadedPkg.status === 'downloaded';
                  const isDownloading = !!downloadedPkg && downloadedPkg.status === 'downloading';

                  return (
                    <div
                      key={altRoute.id}
                      className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#101622] dark:hover:bg-[#182030] border border-slate-200 dark:border-white/[0.08] text-xs flex items-center justify-between gap-2 transition-colors shadow-sm dark:shadow-none"
                    >
                      <button
                        type="button"
                        onClick={() => setActiveRoute(altRoute)}
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        <span className="font-bold text-slate-900 dark:text-white truncate block">{altRoute.name}</span>
                        <span className="text-[11px] text-primary font-medium mt-0.5 block">
                          <span className="font-mono">{altRoute.distanceKm} km</span> • <span className="font-mono">{formatDuration(altRoute.estMinutes)}</span>
                        </span>
                      </button>

                      <div className="shrink-0 flex items-center gap-1">
                        {isDownloaded ? (
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20" title="Saved in Sync Center">
                            <span className="material-symbols-outlined text-[12px]">check</span>
                            <span>Sync</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadRouteMap(altRoute);
                            }}
                            disabled={isDownloading}
                            className="p-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary dark:bg-primary/20 dark:hover:bg-primary/30 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                            title="Download alternative route to Offline Sync Center"
                          >
                            <span className={`material-symbols-outlined text-[14px] ${isDownloading ? 'animate-spin' : ''}`}>
                              {isDownloading ? 'sync' : 'download'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step-by-step Turn Maneuvers List */}
          {activeRoute.steps && activeRoute.steps.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowTurnByTurn(!showTurnByTurn)}
                className="flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition-colors py-1 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-primary">turn_slight_right</span>
                  <span>Turn-by-turn road directions ({activeRoute.steps.length} turns)</span>
                </div>
                <span className="material-symbols-outlined text-[18px]">
                  {showTurnByTurn ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {showTurnByTurn && (
                <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                  {activeRoute.steps.map((step, sIdx) => (
                    <div
                      key={sIdx}
                      className="p-3 rounded-xl bg-white dark:bg-[#101622] border border-slate-200 dark:border-white/[0.08] shadow-sm dark:shadow-none flex items-start gap-3"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5 border border-primary/30">
                        <span className="material-symbols-outlined text-[19px]">
                          {getManeuverIcon(step.maneuver)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                          {step.instruction}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300 mt-1 font-semibold">
                          <span className="font-mono text-primary">{step.distanceMeters > 1000 ? `${(step.distanceMeters / 1000).toFixed(1)} km` : `${step.distanceMeters} m`}</span>
                          {step.roadName && (
                            <span className="text-slate-800 dark:text-slate-200 truncate max-w-[200px] font-mono">
                              {step.roadName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Waypoint Details Drawer / Popover if Selected */}
      {selectedWaypoint && (
        <div className="bg-surface-container rounded-xl p-4 border border-primary/50 shadow-xl flex flex-col gap-2 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">place</span>
              <h4 className="font-bold text-sm text-on-surface">{selectedWaypoint.name}</h4>
            </div>
            <button
              type="button"
              onClick={() => setSelectedWaypoint(null)}
              className="text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <p className="text-xs text-on-surface-variant">{selectedWaypoint.description}</p>
          <div className="flex items-center justify-between text-xs text-outline pt-1">
            <span>Elevation: <span className="font-mono">{selectedWaypoint.elevationMeters}m</span></span>
            <span className="font-mono">{selectedWaypoint.latitude.toFixed(4)}°N, {selectedWaypoint.longitude.toFixed(4)}°E</span>
          </div>
          <button
            type="button"
            onClick={() => handleSelectWaypointDestination(selectedWaypoint)}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 mt-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">directions_car</span>
            <span>Navigate to this waypoint via roads</span>
          </button>
        </div>
      )}

      {/* Waypoints List Expansion */}
      {showWaypointList && (
        <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/30 flex flex-col gap-2">
          <h3 className="text-base font-semibold text-on-surface-variant mb-1">
            Sector objectives & waypoints
          </h3>
          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
            {waypoints.map((wp) => (
              <div
                key={wp.id}
                onClick={() => setSelectedWaypoint(wp)}
                className="bg-surface-container-high p-2.5 rounded-lg flex items-center justify-between hover:bg-surface-container-highest cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-semibold text-primary bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/40">
                    {wp.code}
                  </span>
                  <div>
                    <span className="text-sm font-semibold text-on-surface block">{wp.name}</span>
                    <span className="text-xs text-on-surface-variant">{wp.type} • Alt <span className="font-mono">{wp.elevationMeters}m</span></span>
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                  wp.status === 'active' ? 'bg-secondary/20 text-secondary' : 'bg-tertiary/20 text-tertiary'
                }`}>
                  {wp.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
