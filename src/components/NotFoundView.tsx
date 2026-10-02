import React from 'react';
import { useApp } from '../context/AppContext';

interface NotFoundViewProps {
  onReturnHome?: () => void;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({ onReturnHome }) => {
  const { setCurrentTab, currentGPS } = useApp();

  const handleReturn = () => {
    if (onReturnHome) {
      onReturnHome();
    } else {
      setCurrentTab('driver-home');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 max-w-md mx-auto py-8">
      {/* Tactical Radar Warning Indicator */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-red-950/40 border-2 border-red-500/40 flex items-center justify-center relative shadow-[0_0_30px_rgba(239,68,68,0.25)]">
          <span className="material-symbols-outlined text-red-400 text-5xl animate-pulse">
            explore_off
          </span>
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 animate-ping" />
        </div>
        <div className="absolute inset-0 border border-white/10 rounded-full scale-125 pointer-events-none" />
      </div>

      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono font-bold uppercase tracking-wider mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        <span>Error 404: Unmapped Sector</span>
      </div>

      <h2 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight mb-2">
        Sector Coordinates Not Found
      </h2>

      <p className="text-sm text-slate-400 leading-relaxed mb-6">
        The requested tactical pathway or sector does not exist in local vector cache or offline navigation registers.
      </p>

      {/* Telemetry Status Box */}
      <div className="w-full bg-[#101622] border border-white/[0.08] rounded-xl p-3 mb-6 text-left font-mono text-xs text-slate-300">
        <div className="flex items-center justify-between text-slate-400 border-b border-white/[0.06] pb-1.5 mb-1.5">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-primary">my_location</span>
            Current Fix
          </span>
          <span className="text-emerald-400">GNSS LOCKED</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Latitude / Longitude</span>
          <span className="text-white font-bold">{currentGPS.latitude.toFixed(5)}°N, {currentGPS.longitude.toFixed(5)}°E</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-slate-400">Heading / Altitude</span>
          <span className="text-white">{currentGPS.heading}° / {currentGPS.altitude}m</span>
        </div>
      </div>

      {/* Recovery Actions */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <button
          onClick={handleReturn}
          className="flex-1 py-3 px-4 rounded-xl bg-primary text-black font-display font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-transform active:scale-95 shadow-lg shadow-primary/20 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">home</span>
          <span>Return to Dashboard</span>
        </button>

        <button
          onClick={() => setCurrentTab('emergency-support')}
          className="py-3 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.12] font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] text-emerald-400">medical_services</span>
          <span>Emergency Services</span>
        </button>
      </div>
    </div>
  );
};
