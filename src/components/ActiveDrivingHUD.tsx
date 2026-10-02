import React, { useState } from 'react';
import { 
  Navigation, 
  ArrowUp, 
  CornerUpLeft, 
  CornerUpRight, 
  GitFork, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  X, 
  Compass, 
  AlertTriangle, 
  MapPin, 
  ListOrdered, 
  Flag,
  Crosshair,
  Layers,
  Plus,
  Minus,
  RefreshCw,
  Radio
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TacticalMap } from './TacticalMap';
import { calculateDistanceMeters, formatDuration } from '../services/gps-geojson.service';
import { speakInstruction } from '../services/voice-guidance.service';
import { IncidentCategory } from '../types';

export const ActiveDrivingHUD: React.FC = () => {
  const {
    activeRoute,
    currentGPS,
    currentStepIndex,
    setCurrentStepIndex,
    stopDrivingJourney,
    forceRecalculateRoute,
    voiceGuidanceEnabled,
    setVoiceGuidanceEnabled,
    triggerRecenterOnUser,
    isFollowDriver,
    triggerMapZoom,
    createIncident,
    showToast,
    mapLayer,
    setMapLayer,
    isGpsSearching,
    gpsErrorMessage,
    isOffRoute,
    isRerouting,
    remainingDistanceMeters: contextRemainingMeters,
    remainingMinutes: contextRemainingMinutes
  } = useApp();

  const [showStepsDrawer, setShowStepsDrawer] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [showQuickHazardModal, setShowQuickHazardModal] = useState(false);
  const [hazardCategory, setHazardCategory] = useState<IncidentCategory>('landslide');

  // Ensure full-screen driving map layout is computed and all tiles load immediately on first start
  React.useEffect(() => {
    const triggerResize = () => {
      window.dispatchEvent(new Event('resize'));
    };
    triggerResize();
    const t1 = setTimeout(triggerResize, 80);
    const t2 = setTimeout(triggerResize, 250);
    const t3 = setTimeout(triggerResize, 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // If no active route, fallback gracefully
  if (!activeRoute) return null;

  const steps = activeRoute.steps || [];
  const currentStep = steps[currentStepIndex] || steps[0] || {
    instruction: `Proceed along ${activeRoute.roadSegment || activeRoute.name}`,
    distanceMeters: 500,
    durationSeconds: 120,
    maneuver: 'straight',
    roadName: activeRoute.roadSegment || 'Main Highway',
    location: activeRoute.waypoints[0]
  };

  const nextStep = steps[currentStepIndex + 1] || null;

  // Real remaining distance & time directly computed from device progress
  const remainingDistanceMeters = contextRemainingMeters > 0
    ? contextRemainingMeters
    : Math.round(activeRoute.distanceKm * 1000);

  const remainingKm = Math.max(0.1, Number((remainingDistanceMeters / 1000).toFixed(1)));
  const remainingMinutes = contextRemainingMinutes > 0
    ? contextRemainingMinutes
    : Math.max(1, Math.round((remainingKm / 35) * 60));

  // Compute estimated arrival clock time
  const arrivalDate = new Date(Date.now() + remainingMinutes * 60000);
  const arrivalTimeStr = arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Distance to the current turn maneuver
  const distanceToManeuver = currentStep.location
    ? calculateDistanceMeters(
        currentGPS.latitude,
        currentGPS.longitude,
        currentStep.location[0],
        currentStep.location[1]
      )
    : currentStep.distanceMeters;

  // Dynamic Speedometer Visual Thresholds (Safe: <=60 km/h, Advisory: 61-85 km/h, High Speed: >85 km/h)
  const currentSpeed = Math.round(currentGPS.speed || 0);

  const getSpeedometerStyle = (speed: number) => {
    if (speed <= 2) {
      return {
        cardClass: 'bg-black/75 border-slate-700/80 shadow-md',
        textClass: 'text-slate-200',
        unitClass: 'text-slate-400',
        badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
        statusLabel: 'IDLE'
      };
    }
    if (speed <= 60) {
      return {
        cardClass: 'bg-emerald-950/80 border-emerald-500/80 shadow-[0_0_14px_rgba(16,185,129,0.35)]',
        textClass: 'text-emerald-400',
        unitClass: 'text-emerald-300',
        badgeClass: 'bg-emerald-900/60 text-emerald-300 border-emerald-500/40',
        statusLabel: 'SAFE'
      };
    }
    if (speed <= 85) {
      return {
        cardClass: 'bg-amber-950/85 border-amber-500/90 shadow-[0_0_15px_rgba(245,158,11,0.4)]',
        textClass: 'text-amber-400',
        unitClass: 'text-amber-300',
        badgeClass: 'bg-amber-900/60 text-amber-300 border-amber-500/40',
        statusLabel: 'ADVISORY'
      };
    }
    return {
      cardClass: 'bg-red-950/90 border-red-500 shadow-[0_0_18px_rgba(239,68,68,0.65)] animate-pulse',
      textClass: 'text-red-400',
      unitClass: 'text-red-200',
      badgeClass: 'bg-red-900/80 text-red-200 border-red-500/50',
      statusLabel: 'FAST'
    };
  };

  const speedStyle = getSpeedometerStyle(currentSpeed);

  const renderManeuverIcon = (maneuver: string, className = "w-8 h-8 text-white") => {
    switch (maneuver) {
      case 'turn-left':
        return <CornerUpLeft className={className} />;
      case 'turn-right':
        return <CornerUpRight className={className} />;
      case 'fork-left':
      case 'fork-right':
        return <GitFork className={className} />;
      case 'roundabout':
        return <RotateCw className={className} />;
      case 'arrive':
        return <Flag className={className} />;
      default:
        return <ArrowUp className={className} />;
    }
  };

  const formatDistance = (meters: number) => {
    if (meters < 35) return 'Turn Now';
    if (meters < 1000) return `In ${Math.round(meters / 10) * 10} m`;
    return `In ${(meters / 1000).toFixed(1)} km`;
  };

  const handleQuickReportHazard = async () => {
    try {
      await createIncident({
        title: `Road Hazard: ${hazardCategory.toUpperCase().replace('_', ' ')}`,
        category: hazardCategory,
        severity: 'critical',
        district_road_segment: activeRoute.roadSegment || 'En Route Highway',
        latitude: currentGPS.latitude,
        longitude: currentGPS.longitude,
        altitude_meters: currentGPS.altitude,
        accuracy_meters: currentGPS.accuracy,
        photos: []
      });
      setShowQuickHazardModal(false);
      showToast('⚠️ Hazard beacon registered on live road map!');
    } catch {
      showToast('Failed to report hazard');
    }
  };

  return (
    <div 
      id="active-driving-fullscreen-hud" 
      data-driving-hud="true"
      className="fixed inset-0 z-50 bg-[#0c1014] flex flex-col select-none overflow-hidden font-sans"
    >
      {/* 1. Fullscreen Map Background */}
      <div className="absolute inset-0 z-0">
        <TacticalMap 
          heightClass="h-full w-full"
          showControlsBar={false}
          showTileCacheIndicator={false}
          showGridOverlay={false}
        />
      </div>

      {/* 2. Top Status Bar: GPS Lost / Searching Indicator */}
      {(isGpsSearching || gpsErrorMessage || isRerouting || isOffRoute || activeRoute.reroutedDueToIncident) && (
        <div className="relative z-30 pt-2 px-3 sm:px-6 pointer-events-none animate-fadeIn">
          <div className="max-w-xl mx-auto pointer-events-auto flex flex-col gap-1.5">
            {activeRoute.reroutedDueToIncident && (
              <div className="bg-[#064e3b] text-emerald-100 text-xs font-mono font-bold px-3.5 py-2.5 rounded-xl shadow-2xl flex items-center justify-between gap-2 border-2 border-emerald-400 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔄</span>
                  <span>Route updated: Detour active ({activeRoute.avoidedIncidentTitle || 'Bypassing road hazard'})</span>
                </div>
                <span className="text-[10px] bg-emerald-400 text-black px-2 py-0.5 rounded font-mono font-black shrink-0">
                  ROAD CLEAR
                </span>
              </div>
            )}
            {gpsErrorMessage ? (
              <div className="bg-red-600 text-white text-xs font-mono font-bold px-3 py-2 rounded-xl shadow-2xl flex items-center justify-between gap-2 border border-red-400">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-white shrink-0" />
                  <span>{gpsErrorMessage}</span>
                </div>
              </div>
            ) : isRerouting || isOffRoute ? (
              <div className="bg-amber-600 text-white text-xs font-mono font-bold px-3 py-2 rounded-xl shadow-2xl flex items-center gap-2 border border-amber-400">
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span>Recalculating route along available streets...</span>
              </div>
            ) : isGpsSearching ? (
              <div className="bg-[#0f1d2e] text-cyan-200 text-xs font-mono font-bold px-3 py-2 rounded-xl shadow-2xl flex items-center gap-2 border border-cyan-400 backdrop-blur-md">
                <Radio className="w-4 h-4 text-cyan-300 animate-pulse shrink-0" />
                <span className="flex-1">Searching for GPS signal...</span>
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 3. Top Google Maps Turn Card - Ultra High Contrast */}
      <header className="relative z-20 pt-2.5 px-3 sm:px-6 pointer-events-none">
        <div className="relative max-w-xl mx-auto pointer-events-auto bg-[#071911] border-2 border-emerald-400 rounded-2xl p-3 sm:p-4 shadow-2xl backdrop-blur-md text-white transition-all duration-300">
          {/* Card Top Row: Maneuver icon, remaining turn distance, and action buttons */}
          <div className="flex items-center justify-between gap-2 border-b border-emerald-500/40 pb-2.5 mb-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/30 border-2 border-emerald-400 flex items-center justify-center flex-shrink-0 shadow-inner">
                {renderManeuverIcon(currentStep.maneuver, "w-6 h-6 text-emerald-300 stroke-[2.5]")}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm sm:text-base uppercase tracking-wider font-mono text-emerald-300 font-black leading-none">
                  {formatDistance(distanceToManeuver)}
                </span>
                {activeRoute.roadSegment && (
                  <span className="text-xs text-emerald-100 font-mono font-bold truncate mt-1">
                    {activeRoute.roadSegment}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Action Buttons: Voice Guidance, Map Style Selector, Steps List */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                id="hud-voice-toggle-btn"
                type="button"
                onClick={() => {
                  const nextState = !voiceGuidanceEnabled;
                  setVoiceGuidanceEnabled(nextState);
                  if (nextState) {
                    speakInstruction(currentStep.instruction, true);
                  }
                  showToast(nextState ? 'Voice Guidance: Enabled' : 'Voice Guidance: Muted');
                }}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                  voiceGuidanceEnabled 
                    ? 'bg-emerald-500 text-black border-emerald-400 hover:bg-emerald-400 font-bold' 
                    : 'bg-black/60 border-white/30 text-slate-300 hover:text-white'
                }`}
                title="Toggle Voice Guidance"
              >
                {voiceGuidanceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {/* Map Layer Switcher Button */}
              <button
                id="hud-layer-toggle-btn"
                type="button"
                onClick={() => setShowLayerMenu(!showLayerMenu)}
                className={`h-9 px-2.5 rounded-xl border transition-colors flex items-center gap-1 cursor-pointer font-bold ${
                  mapLayer === 'carto_dark'
                    ? 'bg-blue-600/40 border-blue-400 text-blue-200 hover:bg-blue-600/50'
                    : mapLayer === 'osm_standard'
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200 hover:bg-amber-500/40'
                    : 'bg-emerald-500/30 border-emerald-400 text-emerald-200 hover:bg-emerald-500/40'
                }`}
                title="Change Map Theme & Style (Light Mode / Dark Mode / Satellite HD)"
              >
                <Layers className="w-4 h-4" />
                <span className="text-[10px] font-mono font-bold uppercase">
                  {mapLayer === 'carto_dark' ? 'Dark' : mapLayer === 'osm_standard' ? 'Light' : 'Sat'}
                </span>
              </button>

              <button
                id="hud-force-recalculate-banner-btn"
                type="button"
                onClick={forceRecalculateRoute}
                disabled={isRerouting}
                className="h-9 px-2.5 rounded-xl bg-blue-900/60 border border-blue-400 text-blue-200 hover:text-white hover:bg-blue-800 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                title="Force Re-calculate live OSRM route geometry"
              >
                <RefreshCw className={`w-4 h-4 text-blue-300 ${isRerouting ? 'animate-spin' : ''}`} />
                <span className="text-[10px] font-mono font-bold uppercase hidden sm:inline">Recalc</span>
              </button>

              <button
                id="hud-steps-toggle-btn"
                type="button"
                onClick={() => setShowStepsDrawer(!showStepsDrawer)}
                className="w-9 h-9 rounded-xl bg-black/60 border border-white/30 text-white hover:bg-black/80 flex items-center justify-center transition-colors cursor-pointer"
                title="View All Turn Directions"
              >
                <ListOrdered className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Instruction Details - High Contrast Opaque Text */}
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug drop-shadow">
            {currentStep.instruction}
          </h2>

          {/* Next Turn Preview - 100% Solid Opacity & Clear Contrast */}
          {nextStep && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-emerald-500/30 text-xs font-semibold">
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-black shrink-0">
                THEN
              </span>
              <span className="truncate text-emerald-100 font-bold">{nextStep.instruction}</span>
            </div>
          )}

          {/* Map Layer Selector Menu in HUD */}
          {showLayerMenu && (
            <div className="absolute top-full right-3 sm:right-6 mt-2 w-64 bg-[#0f1722] border-2 border-slate-600 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl flex flex-col gap-1.5 animate-fadeIn z-40 pointer-events-auto">
              <div className="text-[10px] font-mono uppercase text-slate-300 font-bold px-2 py-0.5 flex items-center justify-between border-b border-white/10 pb-1.5 mb-0.5">
                <span>Navigation Map Mode</span>
                <span className="text-[9px] text-blue-400 font-mono font-bold">In-Map Theme</span>
              </div>

              {/* 1. Light Mode Map */}
              <button
                id="hud-layer-light-mode"
                type="button"
                onClick={() => {
                  setMapLayer('osm_standard');
                  setShowLayerMenu(false);
                  showToast('☀️ Light Mode Map: Standard High-Contrast Vectors');
                }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-mono font-medium transition-colors text-left cursor-pointer ${
                  mapLayer === 'osm_standard'
                    ? 'bg-amber-500/30 text-white border-2 border-amber-400 shadow-sm'
                    : 'text-slate-200 hover:bg-white/10 border border-transparent'
                }`}
              >
                <span className="text-base">☀️</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-amber-200 flex items-center gap-1.5">
                    <span>Light Mode Map</span>
                  </div>
                  <div className="text-[10px] text-slate-300 font-sans">Clean light vector roads & labels</div>
                </div>
              </button>



              {/* 3. Satellite HD */}
              <button
                id="hud-layer-google-hybrid"
                type="button"
                onClick={() => {
                  setMapLayer('google_hybrid');
                  setShowLayerMenu(false);
                  showToast('🛰️ Satellite HD: Photogrammetry & Road Overlay');
                }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-mono font-medium transition-colors text-left cursor-pointer ${
                  mapLayer === 'google_hybrid'
                    ? 'bg-emerald-500/30 text-white border-2 border-emerald-400 shadow-sm'
                    : 'text-slate-200 hover:bg-white/10 border border-transparent'
                }`}
              >
                <span className="text-base">🛰️</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-emerald-200">Satellite HD</div>
                  <div className="text-[10px] text-slate-300 font-sans">High-res aerial imagery + road lines</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 4. Floating Controls (Re-centre & Zoom Buttons) */}
      <div className="relative z-20 pointer-events-none mt-auto mb-3 px-3 sm:px-4 max-w-xl mx-auto w-full flex flex-col items-center gap-2">
        {/* Floating Google Maps Style "Re-centre" Button */}
        {!isFollowDriver && (
          <button
            id="hud-recenter-driver-btn"
            type="button"
            onClick={() => {
              triggerRecenterOnUser();
              showToast('📍 Re-centred on vehicle');
            }}
            className="pointer-events-auto flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-slate-100 text-slate-900 font-sans font-bold text-xs shadow-2xl border border-slate-200 active:scale-95 transition-all backdrop-blur-md animate-fadeIn cursor-pointer"
            title="Re-center on vehicle location"
          >
            <Navigation className="w-4 h-4 text-blue-600 fill-blue-600" />
            <span>Re-centre</span>
          </button>
        )}

        <div className="w-full flex items-end justify-between gap-2">
          {/* Left: Real Device GPS status badge */}
          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0c121c]/90 border border-emerald-500/40 text-emerald-300 shadow-xl backdrop-blur-md text-xs font-mono">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span>GPS ±{currentGPS.accuracy || 8}m</span>
          </div>

          {/* Right: Map Zoom Controls (+ / -) */}
          <div className="pointer-events-auto flex flex-col gap-1.5 shrink-0">
            <button
              id="hud-zoom-in-btn"
              type="button"
              onClick={() => triggerMapZoom('in')}
              className="w-10 h-10 rounded-xl bg-[#101418]/90 hover:bg-[#1f2731] text-white border border-slate-700/80 flex items-center justify-center shadow-xl backdrop-blur-md active:scale-95 transition-all cursor-pointer"
              title="Zoom In"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              id="hud-zoom-out-btn"
              type="button"
              onClick={() => triggerMapZoom('out')}
              className="w-10 h-10 rounded-xl bg-[#101418]/90 hover:bg-[#1f2731] text-white border border-slate-700/80 flex items-center justify-center shadow-xl backdrop-blur-md active:scale-95 transition-all cursor-pointer"
              title="Zoom Out"
            >
              <Minus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Bottom Google Maps Driving Summary Bar */}
      <footer className="relative z-20 p-2.5 sm:p-4 bg-[#090e16] border-t-2 border-slate-700 backdrop-blur-lg shadow-2xl text-white">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          {/* Remaining ETA, Distance & Destination */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 sm:gap-2">
              <span className="text-xl sm:text-3xl font-black text-emerald-400 tracking-tight font-mono">
                {formatDuration(remainingMinutes)}
              </span>
              <span className="text-xs sm:text-sm font-mono text-white font-bold">
                ({remainingKm} km)
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-200 mt-0.5 sm:mt-1 font-mono font-bold truncate">
              <span className="text-emerald-300 shrink-0">ETA {arrivalTimeStr}</span>
              <span>•</span>
              <span className="text-white truncate">{activeRoute.destination}</span>
            </div>
          </div>

          {/* Right Action Controls Cluster - Guaranteed No Overlap */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Real-time Dynamic Speedometer Badge */}
            <div 
              id="hud-speedometer-badge"
              className={`flex flex-col items-center justify-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border font-mono transition-all duration-300 backdrop-blur-md shrink-0 ${speedStyle.cardClass}`}
              title={`Vehicle Speed: ${currentSpeed} km/h (${speedStyle.statusLabel})`}
            >
              <div className="flex items-baseline gap-0.5 leading-none">
                <span className={`text-lg sm:text-2xl font-black tracking-tight ${speedStyle.textClass}`}>
                  {currentSpeed}
                </span>
                <span className={`text-[9px] uppercase font-bold tracking-wider ${speedStyle.unitClass}`}>
                  km/h
                </span>
              </div>
              <span className={`text-[7px] sm:text-[8px] uppercase tracking-wider px-1 py-0.2 rounded font-black border mt-0.5 leading-none ${speedStyle.badgeClass}`}>
                {speedStyle.statusLabel}
              </span>
            </div>

            {/* Quick Hazard Report Button */}
            <button
              id="hud-quick-hazard-btn"
              type="button"
              onClick={() => setShowQuickHazardModal(true)}
              className="p-2 sm:p-2.5 rounded-xl bg-amber-500/30 border border-amber-400 text-amber-300 hover:bg-amber-500/40 transition-colors cursor-pointer shrink-0"
              title="Report Road Hazard Ahead"
            >
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Force Re-calculate OSRM Route Button */}
            <button
              id="hud-force-recalculate-btn"
              type="button"
              onClick={forceRecalculateRoute}
              disabled={isRerouting}
              className="flex items-center gap-1 p-2 sm:px-2.5 sm:py-2.5 rounded-xl bg-blue-900/60 border border-blue-400 text-blue-200 hover:bg-blue-800 hover:text-white transition-all font-mono text-xs font-bold shadow-lg cursor-pointer disabled:opacity-50 shrink-0"
              title="Force Re-calculate live OSRM route geometry"
            >
              <RefreshCw className={`w-4 h-4 text-blue-300 ${isRerouting ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Recalc</span>
            </button>

            {/* Large Exit / End Button (Google Maps red exit button) */}
            <button
              id="hud-end-navigation-btn"
              type="button"
              onClick={stopDrivingJourney}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs sm:text-sm tracking-wide shadow-lg shadow-red-950 border border-red-400 transition-colors font-mono cursor-pointer shrink-0"
            >
              <X className="w-4 h-4 stroke-[3]" />
              <span>END</span>
            </button>
          </div>
        </div>
      </footer>

      {/* 6. Directions Drawer (Slide-up list of all upcoming turns) */}
      {showStepsDrawer && (
        <div className="absolute inset-x-0 bottom-0 top-20 z-40 bg-[#0e1318] border-t-2 border-slate-600 p-4 rounded-t-3xl shadow-2xl flex flex-col backdrop-blur-xl animate-in slide-in-from-bottom duration-200 text-white">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-5 h-5 text-emerald-400" />
              <h3 className="font-black text-white text-base">Turn-by-Turn Directions</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowStepsDrawer(false)}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 mt-2 pr-1">
            {steps.map((step, idx) => {
              const isCurrent = idx === currentStepIndex;
              const isPassed = idx < currentStepIndex;

              return (
                <div
                  key={`hud-step-${idx}`}
                  onClick={() => {
                    setCurrentStepIndex(idx);
                    if (voiceGuidanceEnabled) speakInstruction(step.instruction, true);
                  }}
                  className={`p-3.5 flex items-start gap-3.5 cursor-pointer rounded-xl transition-colors ${
                    isCurrent 
                      ? 'bg-[#064e3b] border-2 border-emerald-400 text-white shadow-lg' 
                      : isPassed
                      ? 'bg-slate-900/40 text-slate-400 hover:text-white hover:bg-slate-800'
                      : 'hover:bg-slate-800/80 text-slate-100'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isCurrent ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {renderManeuverIcon(step.maneuver, "w-5 h-5")}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold leading-snug ${isCurrent ? 'text-white' : 'text-slate-100'}`}>
                      {step.instruction}
                    </p>
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold text-slate-300 mt-1">
                      <span>{step.distanceMeters > 1000 ? `${(step.distanceMeters / 1000).toFixed(1)} km` : `${step.distanceMeters} m`}</span>
                      <span>•</span>
                      <span className="truncate">{step.roadName || 'Road'}</span>
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400 text-black font-black uppercase ml-auto">
                          Active Turn
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowStepsDrawer(false)}
            className="w-full py-3 mt-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors cursor-pointer shadow-lg"
          >
            Resume Live Driving View
          </button>
        </div>
      )}

      {/* 7. Quick Road Hazard Reporter Modal */}
      {showQuickHazardModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12171d] border border-amber-500/50 rounded-2xl max-w-sm w-full p-5 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-white text-lg">Report Road Obstacle</h3>
            </div>
            <p className="text-xs text-slate-300 mb-4 font-mono">
              Instantly broadcast road obstacle at GPS {currentGPS.latitude.toFixed(5)}°N, {currentGPS.longitude.toFixed(5)}°E to all vehicles.
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { id: 'landslide', label: '🪨 Rockfall / Slide' },
                { id: 'weather_hazard', label: '🌊 Road Washout' },
                { id: 'roadblock', label: '🛑 Blocked Road' },
                { id: 'bridge_damage', label: '🌉 Damaged Bridge' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setHazardCategory(opt.id as IncidentCategory)}
                  className={`p-2.5 text-xs rounded-xl font-medium border text-left transition-colors cursor-pointer ${
                    hazardCategory === opt.id 
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200' 
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowQuickHazardModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleQuickReportHazard}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors cursor-pointer"
              >
                Broadcast Hazard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
