import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';

interface NetworkSpeedMeterProps {
  compact?: boolean;
  onRetest?: () => void;
}

export const NetworkSpeedMeter: React.FC<NetworkSpeedMeterProps> = ({ compact = false, onRetest }) => {
  const { speedStats, isTestingSpeed, runSpeedTest, isOnline, networkSimulationMode } = useApp();

  // Automatically trigger speed measurement once user opens network settings
  useEffect(() => {
    if (!speedStats || (Date.now() - (speedStats.lastTested || 0) > 15000)) {
      runSpeedTest();
    }
  }, [runSpeedTest, speedStats]);

  const handleTestClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await runSpeedTest();
    if (onRetest) onRetest();
  };

  const speed = speedStats ? speedStats.downloadSpeedMbps : (isOnline ? 18.5 : 0);
  const ping = speedStats ? speedStats.pingMs : (isOnline ? 32 : 0);
  const jitter = speedStats ? speedStats.jitterMs : (isOnline ? 3 : 0);
  const quality = speedStats ? speedStats.quality : (isOnline ? 'good' : 'offline');
  const effectiveType = speedStats ? speedStats.effectiveType : (isOnline ? 'Tactical Satellite Uplink' : 'Offline Storage');

  // Gauge percentage (0 to 100 Mbps scale)
  const gaugePercent = Math.min(100, Math.max(isOnline ? 5 : 0, (speed / 60) * 100));

  const getQualityBadge = () => {
    if (!isOnline || quality === 'offline') {
      return { label: 'OFFLINE', bg: 'bg-red-500/20 text-red-400 border-red-500/30' };
    }
    if (networkSimulationMode === 'spotty' || quality === 'poor') {
      return { label: 'SPOTTY / DEGRADED', bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    }
    if (quality === 'fair') {
      return { label: 'STANDARD UPLINK', bg: 'bg-sky-500/20 text-sky-400 border-sky-500/30' };
    }
    if (quality === 'excellent') {
      return { label: 'ULTRA FAST', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    }
    return { label: 'HIGH SPEED', bg: 'bg-teal-500/20 text-teal-400 border-teal-500/30' };
  };

  const badge = getQualityBadge();

  return (
    <div className="bg-slate-50 border border-slate-200 dark:bg-[#0b1019] dark:border-white/[0.08] rounded-xl p-3 sm:p-3.5 my-2.5 relative overflow-hidden shadow-sm dark:shadow-inner">
      {/* Background ambient glow */}
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${
        !isOnline ? 'bg-red-500/5' : isTestingSpeed ? 'bg-primary/20 animate-pulse' : 'bg-secondary/10'
      }`} />

      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
        <div className="flex items-center gap-1.5">
          <span className={`material-symbols-outlined text-[16px] ${
            isTestingSpeed ? 'text-primary animate-spin' : isOnline ? 'text-secondary' : 'text-slate-500'
          }`}>
            {isTestingSpeed ? 'progress_activity' : 'speed'}
          </span>
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Internet Speed & Latency
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] font-mono font-extrabold uppercase px-2 py-0.5 rounded border ${badge.bg}`}>
            {badge.label}
          </span>
          <button
            type="button"
            onClick={handleTestClick}
            disabled={isTestingSpeed}
            title="Re-test Internet Speed"
            className="flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-300 text-[10px] font-mono text-slate-700 hover:text-slate-900 shadow-sm dark:bg-[#162030] dark:hover:bg-[#1f2d44] dark:border-white/[0.1] dark:text-slate-300 dark:hover:text-white transition-all cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <span className={`material-symbols-outlined text-[12px] ${isTestingSpeed ? 'animate-spin text-primary' : 'text-primary'}`}>
              refresh
            </span>
            <span className="hidden xs:inline">{isTestingSpeed ? 'Measuring...' : 'Test Speed'}</span>
          </button>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 relative z-10">
        {/* Download Speed */}
        <div className="bg-white border border-slate-200 shadow-sm p-2.5 rounded-lg dark:bg-[#121927] dark:border-white/[0.05] dark:shadow-none flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase text-slate-600 dark:text-slate-400 font-bold">Download</span>
            <span className="material-symbols-outlined text-[14px] text-primary">download</span>
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="font-display font-black text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight">
              {isTestingSpeed ? (
                <span className="inline-block animate-pulse text-primary text-base">TESTING...</span>
              ) : (
                speed.toFixed(1)
              )}
            </span>
            {!isTestingSpeed && (
              <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400">Mbps</span>
            )}
          </div>
          <span className="text-[9px] font-mono font-medium text-slate-600 dark:text-slate-500 truncate">
            {isTestingSpeed ? 'Probing gateway' : speed > 20 ? '4K / Satcom' : speed > 5 ? 'Broadband' : isOnline ? 'Degraded' : 'Offline'}
          </span>
        </div>

        {/* Latency / Ping */}
        <div className="bg-white border border-slate-200 shadow-sm p-2.5 rounded-lg dark:bg-[#121927] dark:border-white/[0.05] dark:shadow-none flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase text-slate-600 dark:text-slate-400 font-bold">Latency</span>
            <span className="material-symbols-outlined text-[14px] text-emerald-600 dark:text-secondary">wifi_tethering</span>
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="font-display font-black text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight">
              {isTestingSpeed ? (
                <span className="inline-block animate-pulse text-secondary text-base">...</span>
              ) : isOnline ? (
                ping
              ) : (
                '—'
              )}
            </span>
            {isOnline && !isTestingSpeed && (
              <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400">ms</span>
            )}
          </div>
          <span className="text-[9px] font-mono font-medium text-slate-600 dark:text-slate-500 truncate">
            {isOnline ? (ping < 50 ? 'Low Latency' : ping < 150 ? 'Standard' : 'High Delay') : 'Disconnected'}
          </span>
        </div>

        {/* Jitter / Gateway Type */}
        <div className="bg-white border border-slate-200 shadow-sm p-2.5 rounded-lg dark:bg-[#121927] dark:border-white/[0.05] dark:shadow-none flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase text-slate-600 dark:text-slate-400 font-bold">Jitter / Type</span>
            <span className="material-symbols-outlined text-[14px] text-amber-600 dark:text-amber-400">tune</span>
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="font-display font-black text-lg sm:text-xl text-slate-900 dark:text-white tracking-tight">
              {isTestingSpeed ? (
                <span className="inline-block animate-pulse text-amber-600 dark:text-amber-400 text-base">...</span>
              ) : isOnline ? (
                `±${jitter}ms`
              ) : (
                '0 ms'
              )}
            </span>
          </div>
          <span className="text-[9px] font-mono font-medium text-slate-600 dark:text-slate-400 truncate" title={effectiveType}>
            {effectiveType}
          </span>
        </div>
      </div>

      {/* Bandwidth Gauge Visual Bar */}
      <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-white/[0.05] relative z-10">
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-600 dark:text-slate-400 mb-1">
          <span>Throughput Scale</span>
          <span>{isOnline ? `${speed.toFixed(1)} / 60 Mbps` : '0.0 Mbps (Offline)'}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-200 dark:bg-[#141d2c] rounded-full overflow-hidden relative">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              !isOnline
                ? 'bg-slate-700 w-0'
                : isTestingSpeed
                ? 'bg-gradient-to-r from-primary via-secondary to-primary w-full animate-pulse'
                : quality === 'excellent'
                ? 'bg-gradient-to-r from-teal-400 to-emerald-400'
                : quality === 'good'
                ? 'bg-gradient-to-r from-primary to-secondary'
                : 'bg-gradient-to-r from-amber-500 to-amber-300'
            }`}
            style={{ width: isTestingSpeed ? '100%' : `${gaugePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
