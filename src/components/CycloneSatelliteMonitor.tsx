import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  ACTIVE_CYCLONE_SYSTEMS,
  CycloneSystem,
  getCycloneThreatAssessment
} from '../services/cyclone-tracker.service';

interface CycloneSatelliteMonitorProps {
  selectedCycloneId?: string;
  onSelectCyclone?: (cyclone: CycloneSystem) => void;
  onTimelineHourChange?: (hours: number) => void;
  selectedTimelineHour?: number;
  onClose?: () => void;
}

export const CycloneSatelliteMonitor: React.FC<CycloneSatelliteMonitorProps> = ({
  selectedCycloneId = '',
  onSelectCyclone,
  onTimelineHourChange,
  selectedTimelineHour = 0,
  onClose
}) => {
  const { currentGPS, showToast } = useApp();
  const [activeSystemId, setActiveSystemId] = useState<string>(selectedCycloneId);
  const [activeHour, setActiveHour] = useState<number>(selectedTimelineHour);

  const currentCyclone = useMemo(() => {
    return ACTIVE_CYCLONE_SYSTEMS.find((c) => c.id === activeSystemId) || ACTIVE_CYCLONE_SYSTEMS[0] || null;
  }, [activeSystemId]);

  const threatAssessment = useMemo(() => {
    if (!currentCyclone) return null;
    return getCycloneThreatAssessment(currentGPS.latitude, currentGPS.longitude, currentCyclone);
  }, [currentGPS.latitude, currentGPS.longitude, currentCyclone]);

  const handleSystemChange = (system: CycloneSystem) => {
    setActiveSystemId(system.id);
    setActiveHour(0);
    if (onSelectCyclone) onSelectCyclone(system);
    if (onTimelineHourChange) onTimelineHourChange(0);
    showToast(`Switched tracking to ${system.name}`);
  };

  const handleHourSelect = (hours: number) => {
    setActiveHour(hours);
    if (onTimelineHourChange) onTimelineHourChange(hours);
  };

  const selectedForecastPoint = useMemo(() => {
    if (!currentCyclone) return null;
    return (
      currentCyclone.forecastTrack.find((p) => p.hoursAhead === activeHour) ||
      currentCyclone.forecastTrack[0]
    );
  }, [currentCyclone, activeHour]);

  const getAlertBadge = (level: string) => {
    if (level.includes('Red')) {
      return 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse';
    }
    if (level.includes('Orange')) {
      return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    }
    return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
  };

  if (!currentCyclone) {
    return (
      <div className="flex flex-col w-full gap-3 text-white">
        <div className="p-4 rounded-xl bg-[#101726] border border-emerald-500/30 text-center space-y-2">
          <span className="material-symbols-outlined text-emerald-400 text-[28px]">verified</span>
          <p className="text-xs font-mono font-bold text-white">No Active Cyclones or Depressions Declared</p>
          <p className="text-[11px] text-slate-400 font-mono">
            Real-time UN OCHA / GDACS and IMD satellite telemetry reports clear seas and zero active tropical storm threats in the region.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-3 text-white">
      {/* Top Header & Satellite Status */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
            <span className="material-symbols-outlined text-[20px] animate-spin">
              cyclone
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-400">
                SATELLITE CYCLONE PREDICTOR
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <h3 className="font-display font-bold text-xs sm:text-sm text-white">
              INSAT-3DR & IMD Doppler Monitoring
            </h3>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      {/* Storm Selector Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {ACTIVE_CYCLONE_SYSTEMS.map((system) => (
          <button
            key={system.id}
            onClick={() => handleSystemChange(system)}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-display font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeSystemId === system.id
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/25 border border-red-400'
                : 'bg-[#121824] border border-white/[0.08] text-slate-400 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {system.basin.includes('Bay') ? 'tsunami' : system.basin.includes('Arabian') ? 'water' : 'air'}
            </span>
            <span>{system.name.split(' ')[system.name.split(' ').length - 1].replace(/"/g, '')}</span>
          </button>
        ))}
      </div>

      {/* Active Cyclone Info Card */}
      <div className="bg-[#101726] rounded-xl p-3.5 border border-white/[0.08] flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${getAlertBadge(currentCyclone.alertLevel)}`}>
                {currentCyclone.alertLevel.split(' ')[0]} ALERT
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.06] text-slate-300 border border-white/[0.04]">
                {currentCyclone.basin}
              </span>
            </div>
            <h4 className="font-display font-black text-sm text-white mt-1">
              {currentCyclone.name}
            </h4>
          </div>

          <div className="text-right shrink-0">
            <div className="text-sm sm:text-base font-mono font-bold text-red-400">
              {currentCyclone.maxSustainedWindKmph} km/h
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Gusts {currentCyclone.peakGustsKmph} km/h
            </div>
          </div>
        </div>

        {/* Vital Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 text-center font-mono">
          <div className="bg-[#0b101a] p-2 rounded-lg border border-white/[0.04]">
            <span className="text-[9px] text-slate-400 block uppercase">Central Pressure</span>
            <span className="text-xs font-bold text-primary">{currentCyclone.centralPressureHpa} hPa</span>
          </div>
          <div className="bg-[#0b101a] p-2 rounded-lg border border-white/[0.04]">
            <span className="text-[9px] text-slate-400 block uppercase">Movement</span>
            <span className="text-xs font-bold text-secondary">{currentCyclone.movementSpeedKmph} km/h NW</span>
          </div>
          <div className="bg-[#0b101a] p-2 rounded-lg border border-white/[0.04]">
            <span className="text-[9px] text-slate-400 block uppercase">Eye Diameter</span>
            <span className="text-xs font-bold text-white">{currentCyclone.eyeDiameterKm} km</span>
          </div>
        </div>

        {/* Live Threat to User / Device GPS */}
        <div className="bg-[#0d1320] p-2.5 rounded-lg border border-white/[0.06] flex items-start gap-2 text-xs">
          <span className="material-symbols-outlined text-amber-400 text-[18px] shrink-0 mt-0.5">
            distance
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-slate-300">
                Distance to Storm Eye:
              </span>
              <span className={`font-mono font-bold ${threatAssessment.threatColor}`}>
                {threatAssessment.distanceKm} km away
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              {threatAssessment.advisory}
            </p>
          </div>
        </div>

        {/* Landfall Prediction Box */}
        {currentCyclone.landfall.isLandfallExpected && (
          <div className="bg-red-950/20 border border-red-500/30 p-2.5 rounded-lg text-xs">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-red-400">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">crisis_alert</span>
                Projected Landfall ETA:
              </span>
              <span>{currentCyclone.landfall.estimatedTime}</span>
            </div>
            <p className="text-[11px] text-slate-300 mt-1">
              Target: <span className="font-bold text-white">{currentCyclone.landfall.locationName}</span>
            </p>
            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
              Storm Surge Height: ~{currentCyclone.landfall.expectedSurgeMeters}m above normal tide
            </div>
          </div>
        )}
      </div>

      {/* Trajectory Prediction Timeline Scrubber */}
      <div className="bg-[#101726] rounded-xl p-3 border border-white/[0.08] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-primary">timeline</span>
            Future Movement Trajectory Predictor
          </span>
          <span className="text-[11px] font-mono font-bold text-primary">
            {selectedForecastPoint.timeFormatted}
          </span>
        </div>

        {/* Hour Tabs */}
        <div className="grid grid-cols-5 gap-1.5">
          {currentCyclone.forecastTrack.map((track) => (
            <button
              key={track.hoursAhead}
              onClick={() => handleHourSelect(track.hoursAhead)}
              className={`py-1.5 px-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer text-center ${
                activeHour === track.hoursAhead
                  ? 'bg-primary text-black shadow-md font-black'
                  : 'bg-[#151d2d] border border-white/[0.06] text-slate-400 hover:text-white'
              }`}
            >
              {track.hoursAhead === 0 ? 'LIVE' : `+${track.hoursAhead}h`}
            </button>
          ))}
        </div>

        {/* Selected Forecast Details */}
        <div className="bg-[#0b101a] p-2.5 rounded-lg border border-white/[0.04] text-[11px] space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span>Predicted Position:</span>
            <span className="font-mono text-white font-bold">
              {selectedForecastPoint.latitude.toFixed(2)}°N, {selectedForecastPoint.longitude.toFixed(2)}°E
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Predicted Intensity:</span>
            <span className="font-mono text-amber-400 font-bold">
              {selectedForecastPoint.category} ({selectedForecastPoint.sustainedWindKmph} km/h)
            </span>
          </div>
          <div className="text-[10px] text-slate-400 italic pt-1 border-t border-white/[0.04]">
            {selectedForecastPoint.statusDescription}
          </div>
        </div>
      </div>
    </div>
  );
};
