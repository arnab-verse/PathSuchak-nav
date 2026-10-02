import React from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useGeolocationTelemetry } from '../context/useGeolocationTelemetry';
import { useDeviceBattery } from '../context/useDeviceBattery';
import { TacticalMap } from './TacticalMap';
import { NetworkSpeedMeter } from './NetworkSpeedMeter';

export const DriverHome: React.FC = () => {
  const battery = useDeviceBattery();
  const {
    isOnline,
    setCurrentTab,
    activeRoute,
    setIsFullScreenMap,
    isRealGPSFix,
    realLocationAddress,
    isLocating,
    activateRealGPS,
  } = useApp();

  const { currentUser, userProfile } = useAuth();

  // Throttled Geolocation & Speed Odometer Telemetry Hook (renders smoothly at ~350ms throttle)
  const {
    currentGPS,
    speedKmH,
    speedStatus,
    tripOdometerKm,
    gpsSource
  } = useGeolocationTelemetry({ throttleMs: 350, minDistanceDeltaMeters: 0.5 });

  return (
    <div className="flex flex-col w-full gap-4 max-w-xl mx-auto pb-6">
      
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
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
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

      {/* User Status / Welcome Banner */}
      {!currentUser ? (
        <div 
          id="driver-auth-prompt-card"
          className="rounded-2xl p-4 bg-orange-50/90 dark:bg-gradient-to-br dark:from-primary/15 dark:via-[#131b29] dark:to-[#0c1119] border border-primary/40 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/50 flex items-center justify-center text-primary shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[24px]">account_circle</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white text-base">
                  Welcome to PathSuchak
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  GUEST
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                Offline tactical navigation, real-time weather tracking, and emergency assistance.
              </p>
            </div>
          </div>
          <button
            id="driver-goto-login-button"
            type="button"
            onClick={() => setCurrentTab('account')}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">login</span>
            <span>Sign in / Register</span>
          </button>
        </div>
      ) : (
        <div 
          id="driver-authenticated-operator-card"
          className="rounded-2xl p-3.5 bg-emerald-50/90 dark:bg-[#0d1420] border border-emerald-500/40 shadow-sm flex items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-slate-600 dark:text-slate-400 font-medium">Welcome:</span>
            <span className="font-bold text-slate-900 dark:text-white truncate">
              {userProfile?.displayName || currentUser.displayName || currentUser.email}
            </span>
            <span className="text-primary font-bold shrink-0">
              ({userProfile?.callsign || 'Traveler'})
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCurrentTab('account')}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline shrink-0 cursor-pointer font-bold"
          >
            View profile →
          </button>
        </div>
      )}

      {/* Active Navigation Trip Status (if route active) */}
      {activeRoute && (
        <div className="tactile-card rounded-2xl p-4 border border-primary/40 bg-orange-50/90 dark:bg-gradient-to-br dark:from-primary/10 dark:via-[#141b27] dark:to-[#0e141f] flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-[22px]">navigation</span>
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider block">
                Active Route in Progress
              </span>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {activeRoute.destination}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                {activeRoute.distanceKm} km • Est. {activeRoute.estMinutes} mins
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCurrentTab('resilient-navigation')}
            className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shrink-0 cursor-pointer active:scale-95 transition-all"
          >
            <span>Resume</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      )}

      {/* Live Location Tactical Map Viewfinder with Integrated Speed Odometer HUD */}
      <div className="tactile-card rounded-2xl p-3 sm:p-4 flex flex-col gap-2 relative viewfinder-bracket shadow-lg">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">my_location</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              Live location & telemetry
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {gpsSource === 'device' ? 'REAL GPS' : 'TACTICAL GPS'}
            </span>
          </div>
          <button
            onClick={() => {
              setCurrentTab('resilient-navigation');
              setIsFullScreenMap(true);
            }}
            className="text-xs text-primary hover:text-amber-500 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            Expand map
            <span className="material-symbols-outlined text-[14px]">fullscreen</span>
          </button>
        </div>

        <TacticalMap
          heightClass="h-56"
          showControls={true}
          interactive={true}
          showZoomControls={false}
          showCacheButton={false}
          showScaleControl={false}
          showRecenterButton={false}
        />

        {/* Real-time GPS Location Coordinates & Speed Odometer Readout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
          {/* Left: GPS Position Coordinates */}
          <div className="flex items-center justify-between bg-slate-100/90 dark:bg-[#0c1017] p-2.5 rounded-xl border border-slate-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
                <span className="material-symbols-outlined text-[18px]">pin_drop</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-mono uppercase text-slate-700 dark:text-slate-400 font-bold tracking-wider">
                  GPS Coordinates
                </span>
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate">
                  {currentGPS.latitude.toFixed(5)}°N, {currentGPS.longitude.toFixed(5)}°E
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] font-mono text-primary font-bold block">
                Alt: {currentGPS.altitude ? `${currentGPS.altitude}m` : '216m'}
              </span>
              <span className="text-[9px] font-mono text-slate-600 dark:text-slate-400 font-semibold block">
                ±{currentGPS.accuracy || 8}m
              </span>
            </div>
          </div>

          {/* Right: Real-time Speed Odometer Readout (Calculated from Geolocation Telemetry) */}
          <div className="flex items-center justify-between bg-slate-100/90 dark:bg-[#0c1017] p-2.5 rounded-xl border border-slate-200 dark:border-white/[0.06] relative overflow-hidden">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                speedKmH > 0 
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 animate-pulse' 
                  : 'bg-slate-200 dark:bg-[#161f2e] border-slate-300 dark:border-white/[0.1] text-slate-600 dark:text-slate-400'
              }`}>
                <span className="material-symbols-outlined text-[18px]">speed</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase text-slate-700 dark:text-slate-400 font-bold tracking-wider">
                    Speed Odometer
                  </span>
                  <span className={`text-[8px] font-mono px-1 py-0.2 rounded font-bold uppercase ${
                    speedKmH > 0 ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30' : 'bg-slate-200 dark:bg-white/[0.08] text-slate-700 dark:text-slate-300'
                  }`}>
                    {speedStatus}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-mono font-black text-slate-900 dark:text-white leading-none">
                    {speedKmH}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">
                    km/h
                  </span>
                </div>
              </div>
            </div>

            {/* Odometer Trip Counter */}
            <div className="text-right shrink-0">
              <span className="text-[9px] font-mono uppercase text-slate-700 dark:text-slate-400 font-bold block">
                Trip ODO
              </span>
              <span className="text-xs font-mono font-bold text-emerald-700 dark:text-secondary">
                {tripOdometerKm} km
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Essential Dashboard Telemetry & Device Battery */}
      <div className="tactile-card rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">battery_charging_full</span>
            Device & system status
          </h3>
          <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Active
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Device Battery % */}
          <div className="bg-slate-50 border border-slate-200 shadow-sm p-3.5 rounded-xl flex flex-col justify-between dark:bg-[#121824] dark:border-white/[0.06] dark:shadow-none">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs font-medium mb-1">
              <span className="flex items-center gap-1.5">
                <span className={`material-symbols-outlined text-[16px] ${
                  battery.isCharging ? 'text-amber-400' : battery.level <= 20 ? 'text-red-500' : 'text-emerald-500'
                }`}>
                  {battery.isCharging ? 'battery_charging_full' : battery.level > 80 ? 'battery_full' : battery.level > 40 ? 'battery_5_bar' : 'battery_low'}
                </span>
                Device battery
              </span>
              <span className={`font-mono font-bold ${
                battery.level <= 20 ? 'text-red-500' : 'text-emerald-700 dark:text-secondary'
              }`}>{battery.level}%</span>
            </div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white flex items-center gap-1">
                {battery.level}%
                {battery.isCharging && (
                  <span className="material-symbols-outlined text-[16px] text-amber-400 animate-pulse" title="Charging">
                    bolt
                  </span>
                )}
              </span>
              <span className={`text-xs font-medium ${
                battery.isCharging ? 'text-amber-400' : battery.level <= 20 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {battery.statusLabel}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-[#1b2434] h-2 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  battery.isCharging ? 'bg-amber-400' : battery.level <= 20 ? 'bg-red-500' : 'bg-emerald-500 dark:bg-secondary'
                }`} 
                style={{ width: `${Math.min(100, Math.max(5, battery.level))}%` }}
              />
            </div>
          </div>

          {/* Network & Uplink Status */}
          <div className="bg-slate-50 border border-slate-200 shadow-sm p-3.5 rounded-xl flex flex-col justify-between dark:bg-[#121824] dark:border-white/[0.06] dark:shadow-none">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs font-medium mb-1">
              <span className="flex items-center gap-1.5">
                <span className={`material-symbols-outlined text-[16px] ${isOnline ? 'text-secondary' : 'text-amber-500'}`}>
                  {isOnline ? 'satellite_alt' : 'cloud_off'}
                </span>
                Uplink status
              </span>
              <span className={`font-mono font-bold text-xs ${isOnline ? 'text-secondary' : 'text-amber-400'}`}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                {isOnline ? 'Mesh Linked' : 'Local Mode'}
              </span>
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {isOnline ? '4G/Sat' : 'Direct'}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-[#1b2434] h-2 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${isOnline ? 'bg-secondary w-[92%]' : 'bg-amber-500 w-[100%]'}`} />
            </div>
          </div>
        </div>

        {/* Live Internet Speed & Latency Meter (Shifted from Vault) */}
        <NetworkSpeedMeter />
      </div>

    </div>
  );
};
