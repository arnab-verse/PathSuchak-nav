import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  EmergencyFacility,
  getNearestEmergencyFacilities,
  calculateHaversineDistanceKm
} from '../services/emergency-support.service';

interface EmergencySupportDirectoryProps {
  onNavigateToFacility?: (facility: EmergencyFacility) => void;
}

export const EmergencySupportDirectory: React.FC<EmergencySupportDirectoryProps> = ({
  onNavigateToFacility
}) => {
  const { 
    currentGPS, 
    gpsSource, 
    isRealGPSFix,
    realLocationAddress, 
    setCurrentTab, 
    calculateRoadRouteToDestination, 
    showToast,
    activateRealGPS,
    isLocating
  } = useApp();

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'hospital' | 'police' | 'rescue' | 'fire' | 'towing' | 'fuel'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [facilities, setFacilities] = useState<EmergencyFacility[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const lastFetchedRef = React.useRef<{ lat: number; lng: number; cat: string } | null>(null);

  // In-memory distance recalculation and sorting: updates instantly on GPS tick without flipping loading state or network requests
  const sortedFacilities = useMemo(() => {
    if (facilities.length === 0) return [];
    return facilities.map((f) => {
      const dist = calculateHaversineDistanceKm(currentGPS.latitude, currentGPS.longitude, f.latitude, f.longitude);
      return {
        ...f,
        distanceKm: dist,
        etaMinutes: Math.max(3, Math.round(dist * 1.8))
      };
    }).sort((a, b) => a.distanceKm - b.distanceKm);
  }, [facilities, currentGPS.latitude, currentGPS.longitude]);

  // Load facilities from service/network only when needed
  const loadFacilities = async (showSpinner = false) => {
    if (showSpinner || facilities.length === 0) {
      setIsLoading(true);
    }
    try {
      const data = await getNearestEmergencyFacilities(
        currentGPS.latitude,
        currentGPS.longitude,
        categoryFilter
      );
      setFacilities(data);
      lastFetchedRef.current = {
        lat: currentGPS.latitude,
        lng: currentGPS.longitude,
        cat: categoryFilter
      };
    } catch (err) {
      console.error('Error fetching emergency facilities:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!lastFetchedRef.current) {
      loadFacilities(true);
      return;
    }

    const { lat, lng, cat } = lastFetchedRef.current;
    if (cat !== categoryFilter) {
      loadFacilities(true);
      return;
    }

    // Only re-query network if user moved significantly (> 500 meters)
    const distMoved = calculateHaversineDistanceKm(currentGPS.latitude, currentGPS.longitude, lat, lng);
    if (distMoved > 0.5) {
      loadFacilities(false);
    }
  }, [currentGPS.latitude, currentGPS.longitude, categoryFilter]);

  const handleEnableDeviceLocation = async () => {
    setIsRefreshing(true);
    const success = await activateRealGPS();
    if (success) {
      showToast('📍 Live device GPS locked! Nearby services updated.');
    }
    await loadFacilities(false);
    setIsRefreshing(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (gpsSource !== 'device' || !isRealGPSFix) {
      await activateRealGPS();
    }
    await loadFacilities(false);
    showToast('Updated nearest available services based on live GPS location!');
  };

  // Filter by search query
  const filteredFacilities = useMemo(() => {
    if (!searchQuery.trim()) return sortedFacilities;
    const q = searchQuery.toLowerCase();
    return sortedFacilities.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.address.toLowerCase().includes(q) ||
        f.typeLabel.toLowerCase().includes(q) ||
        f.capabilities.some((c) => c.toLowerCase().includes(q))
    );
  }, [sortedFacilities, searchQuery]);

  const handleNavigate = (facility: EmergencyFacility) => {
    if (onNavigateToFacility) {
      onNavigateToFacility(facility);
    } else {
      calculateRoadRouteToDestination(facility.latitude, facility.longitude, facility.name);
      setCurrentTab('resilient-navigation');
      showToast(`Calculating route to ${facility.name} (${facility.distanceKm < 1 ? Math.round(facility.distanceKm * 1000) + 'm' : facility.distanceKm + ' km'} away)...`);
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'hospital':
        return {
          icon: 'local_hospital',
          label: 'Hospital / Trauma',
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30'
        };
      case 'police':
        return {
          icon: 'local_police',
          label: 'Police Station / PCR',
          bg: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30'
        };
      case 'rescue':
        return {
          icon: 'support_agent',
          label: 'NDRF / Disaster Rescue',
          bg: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30'
        };
      case 'fire':
        return {
          icon: 'fire_truck',
          label: 'Fire & HAZMAT Squad',
          bg: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30'
        };
      case 'towing':
        return {
          icon: 'car_repair',
          label: 'Roadside Towing & Mechanical Repair',
          bg: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30'
        };
      case 'fuel':
        return {
          icon: 'local_gas_station',
          label: 'Fuel Station & EV Charging Hub',
          bg: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/30'
        };
      default:
        return {
          icon: 'emergency',
          label: 'Emergency Support',
          bg: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-primary/20 dark:text-primary dark:border-primary/30'
        };
    }
  };

  return (
    <div className="flex flex-col w-full gap-4 max-w-2xl mx-auto pb-8">
      {/* Turn On Device Location Request Banner if GPS is Off or Simulated */}
      {(gpsSource !== 'device' || !isRealGPSFix) && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-300 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 animate-fadeIn dark:bg-gradient-to-r dark:from-blue-950/70 dark:via-[#10192a] dark:to-[#121c2e] dark:border-blue-500/50 dark:shadow-xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-300 flex items-center justify-center text-blue-700 shrink-0 mt-0.5 shadow-sm dark:bg-blue-500/20 dark:border-blue-500/40 dark:text-blue-400 dark:shadow-inner">
              <span className="material-symbols-outlined text-[24px]">location_searching</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                  Turn on device location for nearby services
                </h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30">
                  GPS
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                Allow live device location to discover hospitals, police, rescue teams, towing services, and fuel stations closest to your exact coordinates.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleEnableDeviceLocation}
            disabled={isLocating}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
          >
            <span className={`material-symbols-outlined text-[18px] ${isLocating ? 'animate-spin' : ''}`}>
              {isLocating ? 'sync' : 'my_location'}
            </span>
            <span>{isLocating ? 'Locking GPS...' : 'Turn on live location'}</span>
          </button>
        </div>
      )}

      {/* Critical Life-Threatening Emergency Alert Banner */}
      <div className="p-3 rounded-xl bg-red-50 border border-red-300 flex items-center justify-between gap-3 text-xs dark:bg-red-950/40 dark:border-red-500/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-red-800 dark:text-red-300 block text-sm">Critical emergency or vehicle rollover?</span>
            <span className="text-xs text-red-700 dark:text-red-400/80 block truncate">Initiate immediate satellite distress transponder broadcast.</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCurrentTab('emergency-sos')}
          className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer transition-transform active:scale-95 shrink-0 shadow-sm"
        >
          <span className="material-symbols-outlined text-[14px]">emergency</span>
          <span>Distress SOS</span>
        </button>
      </div>

      {/* Live Location Header Card */}
      <div className="tactile-card rounded-2xl p-4 border border-slate-300 bg-white shadow-sm relative overflow-hidden dark:border-white/[0.08] dark:bg-gradient-to-br dark:from-[#101622] dark:via-[#0d121c] dark:to-[#151c2a]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-100 border border-orange-300 flex items-center justify-center text-orange-700 shrink-0 shadow-sm dark:bg-primary/20 dark:border-primary/40 dark:text-primary dark:shadow-lg dark:shadow-primary/10">
              <span className="material-symbols-outlined text-[28px] animate-pulse">crisis_alert</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-orange-800 dark:text-primary">
                  Live emergency responder grid
                </span>
                {gpsSource === 'device' && isRealGPSFix ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-ping" />
                    Live GPS active
                  </span>
                ) : (
                  <button
                    onClick={handleEnableDeviceLocation}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 dark:hover:bg-amber-500/30 transition-colors cursor-pointer"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
                    Turn on device GPS
                  </button>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
                Nearest emergency supports & rescue centers
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-600 dark:text-slate-400">Help seeker location:</span>
                <span className="font-mono text-xs font-medium text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 dark:text-white dark:bg-black/40 dark:border-white/[0.06]">
                  {currentGPS.latitude.toFixed(4)}°N, {currentGPS.longitude.toFixed(4)}°E
                </span>
                {realLocationAddress && (
                  <span className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-xs">
                    • {realLocationAddress}
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 hover:text-slate-900 transition-all cursor-pointer shrink-0 disabled:opacity-50 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] dark:border-white/[0.08] dark:text-slate-300 dark:hover:text-white"
            title="Refresh Live Emergency Distances"
          >
            <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
        </div>

        {/* National Emergency Helplines Speed Bar */}
        <div className="mt-4 pt-3 border-t border-white/[0.08] flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
            Speed dial:
          </span>
          <a
            href="tel:112"
            className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-transform active:scale-95"
            title="National Universal Emergency Hotline (Police, Ambulance, Fire)"
          >
            <span className="material-symbols-outlined text-[14px]">call</span>
            <span><strong className="font-mono">112</strong> (Universal)</span>
          </a>
          <a
            href="tel:108"
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-transform active:scale-95"
            title="National Medical & Ambulance Emergency Hotline"
          >
            <span className="material-symbols-outlined text-[14px]">medical_services</span>
            <span><strong className="font-mono">108</strong> (Medical)</span>
          </a>
          <a
            href="tel:1078"
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-transform active:scale-95"
            title="NDRF National Disaster Response Helpline"
          >
            <span className="material-symbols-outlined text-[14px]">support_agent</span>
            <span><strong className="font-mono">1078</strong> (NDRF Disaster)</span>
          </a>
          <a
            href="tel:101"
            className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-transform active:scale-95"
            title="Fire & Extrication Rescue"
          >
            <span className="material-symbols-outlined text-[14px]">fire_truck</span>
            <span><strong className="font-mono">101</strong> (Fire)</span>
          </a>
          <a
            href="tel:1073"
            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-transform active:scale-95"
            title="National Highway Emergency Patrol Helpline"
          >
            <span className="material-symbols-outlined text-[14px]">local_police</span>
            <span><strong className="font-mono">1073</strong> (NH Patrol)</span>
          </a>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col gap-2.5">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              categoryFilter === 'all'
                ? 'tactile-btn-primary shadow-md'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#101622] dark:border-white/[0.08] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">apps</span>
            <span>All responders</span>
          </button>

          <button
            onClick={() => setCategoryFilter('hospital')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              categoryFilter === 'hospital'
                ? 'bg-emerald-700 text-white shadow-md'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#101622] dark:border-white/[0.08] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-emerald-700 dark:text-emerald-400">local_hospital</span>
            <span>Hospitals & trauma</span>
          </button>

          <button
            onClick={() => setCategoryFilter('police')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              categoryFilter === 'police'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#101622] dark:border-white/[0.08] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-blue-700 dark:text-blue-400">local_police</span>
            <span>Police & PCR units</span>
          </button>

          <button
            onClick={() => setCategoryFilter('rescue')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              categoryFilter === 'rescue'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#101622] dark:border-white/[0.08] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-amber-700 dark:text-amber-400">support_agent</span>
            <span>NDRF & rescue centers</span>
          </button>

          <button
            onClick={() => setCategoryFilter('fire')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              categoryFilter === 'fire'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#101622] dark:border-white/[0.08] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-red-700 dark:text-red-400">fire_truck</span>
            <span>Fire & HAZMAT</span>
          </button>

          <button
            onClick={() => setCategoryFilter('towing')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              categoryFilter === 'towing'
                ? 'bg-purple-700 text-white shadow-md'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#101622] dark:border-white/[0.08] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-purple-700 dark:text-purple-400">car_repair</span>
            <span>Towing & repairs</span>
          </button>

          <button
            onClick={() => setCategoryFilter('fuel')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              categoryFilter === 'fuel'
                ? 'bg-cyan-700 text-white shadow-md'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#101622] dark:border-white/[0.08] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-cyan-700 dark:text-cyan-400">local_gas_station</span>
            <span>Fuel & relief</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by facility name, trauma unit, police post, or locality..."
            className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary font-medium dark:bg-[#101622] dark:border-white/[0.08] dark:text-white dark:placeholder-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Facility Cards List */}
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 font-normal text-sm flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-[32px] text-primary animate-spin">
              progress_activity
            </span>
            <span>Scanning real-time emergency infrastructure within 35km radius...</span>
          </div>
        ) : filteredFacilities.length === 0 ? (
          <div className="p-8 text-center bg-[#101622] rounded-2xl border border-white/[0.06] text-slate-400">
            <span className="material-symbols-outlined text-[36px] text-slate-500 mb-2">
              search_off
            </span>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No facilities match your search criteria</p>
            <p className="text-xs text-slate-500 mt-1">Try clearing the search query or changing categories.</p>
          </div>
        ) : (
          filteredFacilities.map((facility, index) => {
            const badge = getCategoryBadge(facility.category);
            const isClosest = index === 0;

            return (
              <div
                key={facility.id}
                className={`tactile-card rounded-2xl p-4 border transition-all flex flex-col gap-3 relative ${
                  isClosest
                    ? 'border-orange-400 shadow-md bg-white dark:border-primary/50 dark:shadow-[0_0_25px_rgba(59,130,246,0.15)] dark:bg-gradient-to-b dark:from-[#131b2a] dark:to-[#0e1420]'
                    : 'border-slate-300 bg-white hover:border-slate-400 shadow-sm dark:border-white/[0.08] dark:bg-[#0e1420] dark:hover:border-white/[0.15]'
                }`}
              >
                {/* Top Info Bar */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${badge.bg}`}>
                      <span className="material-symbols-outlined text-[22px]">
                        {badge.icon}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badge.bg}`}>
                          {badge.label}
                        </span>
                        {isClosest && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-orange-600 text-white dark:bg-primary dark:text-black">
                            ★ Closest responder
                          </span>
                        )}
                        <span className="text-xs text-emerald-800 dark:text-emerald-400 flex items-center gap-1 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                          {facility.openStatus}
                        </span>
                      </div>

                      <h3 className="font-semibold text-base text-slate-900 dark:text-white tracking-tight mt-1">
                        {facility.name}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-normal">
                        {facility.typeLabel}
                      </p>
                    </div>
                  </div>

                  {/* Distance & ETA Badge */}
                  <div className="text-right shrink-0">
                    <div className="text-base sm:text-lg font-mono font-medium text-orange-800 dark:text-primary">
                      {facility.distanceKm < 1 ? `${Math.round(facility.distanceKm * 1000)}m` : `${facility.distanceKm} km`}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center justify-end gap-1">
                      <span className="material-symbols-outlined text-[13px]">directions_car</span>
                      <span>ETA ~<span className="font-mono font-medium">{facility.etaMinutes} min</span></span>
                    </div>
                  </div>
                </div>

                {/* Address & Capabilities */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2 dark:bg-[#141b28] dark:border-white/[0.06]">
                  <div className="flex items-start gap-1.5 text-slate-700 dark:text-slate-300">
                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[16px] shrink-0 mt-0.5">
                      location_on
                    </span>
                    <span className="text-xs leading-relaxed">
                      {facility.address}
                    </span>
                  </div>

                  {/* Capabilities Tags */}
                  {facility.capabilities && facility.capabilities.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-200 dark:border-white/[0.04]">
                      <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                        Equipped:
                      </span>
                      {facility.capabilities.map((cap, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-slate-100 text-xs text-slate-700 border border-slate-300 dark:bg-white/[0.06] dark:text-slate-300 dark:border-white/[0.04]"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Radio Channel if applicable */}
                  {facility.radioChannel && (
                    <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-secondary pt-0.5 font-medium">
                      <span className="material-symbols-outlined text-[14px]">podcasts</span>
                      <span>Emergency radio guard: <span className="font-mono font-medium">{facility.radioChannel}</span></span>
                    </div>
                  )}
                </div>

                {/* Bottom Action Controls */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <a
                    href={`tel:${facility.phone}`}
                    className="py-2.5 px-3 rounded-xl bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-800 dark:bg-emerald-600/20 dark:hover:bg-emerald-600/30 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">call</span>
                    <span>Call hotline (<span className="font-mono">{facility.phone}</span>)</span>
                  </a>

                  <button
                    onClick={() => handleNavigate(facility)}
                    className="py-2.5 px-3 rounded-xl tactile-btn-primary text-xs font-semibold flex items-center justify-center gap-1.5 transition-transform active:scale-95 cursor-pointer shadow-md"
                  >
                    <span className="material-symbols-outlined text-[18px]">directions</span>
                    <span>Navigate now</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
