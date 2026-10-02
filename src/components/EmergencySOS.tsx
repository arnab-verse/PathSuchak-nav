import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';

export const EmergencySOS: React.FC = () => {
  const { currentGPS, activeSOS, triggerSOS, cancelSOS, setCurrentTab, showToast, theme } = useApp();

  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [medicalNeeded, setMedicalNeeded] = useState<boolean>(false);
  const [vehicleDisabled, setVehicleDisabled] = useState<boolean>(false);
  const [threatPresent, setThreatPresent] = useState<boolean>(false);
  const [satelliteTransmissionPulse, setSatelliteTransmissionPulse] = useState<number>(1);

  const holdIntervalRef = useRef<any>(null);
  const holdStartTimeRef = useRef<number>(0);
  const cancelCooldownRef = useRef<number>(0);

  const medicalNeededRef = useRef(medicalNeeded);
  const vehicleDisabledRef = useRef(vehicleDisabled);
  const threatPresentRef = useRef(threatPresent);

  useEffect(() => {
    medicalNeededRef.current = medicalNeeded;
  }, [medicalNeeded]);

  useEffect(() => {
    vehicleDisabledRef.current = vehicleDisabled;
  }, [vehicleDisabled]);

  useEffect(() => {
    threatPresentRef.current = threatPresent;
  }, [threatPresent]);

  // Safely stop holding and clear timers
  const stopHolding = useCallback(() => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  // Whenever activeSOS changes, cancel any active hold immediately
  useEffect(() => {
    stopHolding();
    return () => {
      stopHolding();
    };
  }, [activeSOS, stopHolding]);

  // Global window release listener so lifting anywhere stops holding
  useEffect(() => {
    if (!isHolding) return;
    const handleGlobalRelease = () => {
      stopHolding();
    };
    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('pointercancel', handleGlobalRelease);
    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('pointercancel', handleGlobalRelease);
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
    };
  }, [isHolding, stopHolding]);

  // Hold-to-activate countdown logic (2000ms duration)
  useEffect(() => {
    if (isHolding && !activeSOS) {
      holdStartTimeRef.current = Date.now();
      const HOLD_DURATION_MS = 2000;

      holdIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - holdStartTimeRef.current;
        const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);

        if (progress >= 100) {
          if (holdIntervalRef.current) {
            clearInterval(holdIntervalRef.current);
            holdIntervalRef.current = null;
          }
          setIsHolding(false);
          setHoldProgress(0);

          // Safely trigger SOS outside of any React setState updater function
          triggerSOS({
            medical: medicalNeededRef.current,
            disabled: vehicleDisabledRef.current,
            threat: threatPresentRef.current
          });
        } else {
          setHoldProgress(Math.round(progress));
        }
      }, 50);
    } else {
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current);
        holdIntervalRef.current = null;
      }
      setHoldProgress(0);
    }

    return () => {
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current);
        holdIntervalRef.current = null;
      }
    };
  }, [isHolding, activeSOS, triggerSOS]);

  const handleStartHold = (e: React.SyntheticEvent) => {
    if (activeSOS) return;
    if (Date.now() < cancelCooldownRef.current) return;
    holdStartTimeRef.current = Date.now();
    setIsHolding(true);
  };

  const handleCancelSOS = () => {
    stopHolding();
    cancelCooldownRef.current = Date.now() + 1500; // 1.5s cooldown guard
    cancelSOS();
  };

  // Satellite pulse animation increment
  useEffect(() => {
    if (!activeSOS) return;
    const interval = setInterval(() => {
      setSatelliteTransmissionPulse((p) => p + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeSOS]);

  return (
    <div className="flex flex-col w-full gap-4 max-w-xl mx-auto pb-6">
      {activeSOS ? (
        /* Active Distress Beacon View */
        <div className="tactile-card rounded-2xl p-5 border-2 border-red-500/80 shadow-[0_0_40px_rgba(239,68,68,0.25)] flex flex-col gap-4 relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
          
          {/* Top Pulsing Beacon */}
          <div className="flex flex-col items-center text-center gap-2 pt-2">
            <div className="relative flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-red-500/20 beacon-ping absolute" />
              <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center text-white shadow-[0_0_30px_rgba(239,68,68,0.8)] border border-red-300/40">
                <span className="material-symbols-outlined text-[36px] font-bold">emergency</span>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-red-400 mt-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              SOS active
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Broadcasting SOS coordinates
            </h2>
            <p className="text-xs text-slate-300 max-w-sm">
              Emergency transponder is transmitting priority coordinates to national emergency services (112) & nearest first responders.
            </p>
          </div>

          {/* Broadcast Telemetry Card */}
          <div className="bg-[#101622] p-4 rounded-xl border border-red-500/30 text-xs space-y-2">
            <div className="flex justify-between items-center text-slate-400 border-b border-white/[0.06] pb-2">
              <span className="text-xs text-slate-400">Beacon ID:</span>
              <span className="text-red-400 font-mono font-medium">{activeSOS.id}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-xs text-slate-400">Device / user:</span>
              <span className="text-white font-medium">Registered user device (Emergency beacon)</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-xs text-slate-400">Exact coordinates:</span>
              <span className="text-primary font-mono font-medium">
                {currentGPS.latitude.toFixed(5)}°N, {currentGPS.longitude.toFixed(5)}°E
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-xs text-slate-400">Elevation / altitude:</span>
              <span className="text-white font-mono font-medium">{currentGPS.altitude || 216}m ASL</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-xs text-slate-400">Sat burst transmissions:</span>
              <span className="text-secondary font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                Pulse #<span className="font-mono">{satelliteTransmissionPulse}</span> transmitted OK
              </span>
            </div>
          </div>

          {/* Emergency Radio Channels */}
          <div className="bg-[#101622] p-3.5 rounded-xl border border-white/[0.08] text-xs">
            <span className="text-xs font-semibold text-slate-300 block mb-2">
              Emergency radio guard channels
            </span>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-[#141c2b] p-2.5 rounded-lg border border-white/[0.06]">
                <span className="text-xs text-slate-400 block mb-0.5">National Police / NDRF</span>
                <span className="text-xs font-semibold text-primary font-mono">VHF CH 12 (154.500)</span>
              </div>
              <div className="bg-[#141c2b] p-2.5 rounded-lg border border-white/[0.06]">
                <span className="text-xs text-slate-400 block mb-0.5">Air Medical Evac</span>
                <span className="text-xs font-semibold text-secondary font-mono">243.000 MHz</span>
              </div>
            </div>
          </div>

          {/* Cancel SOS Action */}
          <button
            onClick={handleCancelSOS}
            className="w-full bg-[#101622] hover:bg-red-950/40 border border-red-500/40 text-red-400 hover:text-white py-3 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 mt-1 cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">cancel</span>
            Cancel distress beacon (Abort false alarm)
          </button>
        </div>
      ) : (
        /* Standby / Armed SOS View */
        <div className="flex flex-col gap-4">
          
          {/* Top Warning Card */}
          <div className="tactile-card rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-500 dark:text-red-400 shrink-0">
              <span className="material-symbols-outlined text-[24px]">warning</span>
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-900 dark:text-white">Emergency distress transponder</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-0.5">
                Use in critical situations requiring emergency extraction, severe trauma, vehicle rollover, or disaster rescue.
              </p>
            </div>
          </div>

          {/* Emergency Condition Toggles */}
          <div className="tactile-card rounded-2xl p-4 flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Select distress condition(s)
            </span>

            <button
              type="button"
              onClick={() => setMedicalNeeded(!medicalNeeded)}
              className={`p-3 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                medicalNeeded
                  ? 'bg-red-500/20 border-red-500/60 text-slate-900 dark:text-white font-bold'
                  : 'bg-slate-50 border-slate-200 dark:bg-[#101622] dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-[22px]">medical_services</span>
                <div>
                  <span className="text-xs font-semibold block text-slate-900 dark:text-white">Medical evacuation required (Medevac)</span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400">Severe injury, trauma, cardiac arrest, or blood loss</span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-red-500 dark:text-red-400">
                {medicalNeeded ? 'check_box' : 'check_box_outline_blank'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setVehicleDisabled(!vehicleDisabled)}
              className={`p-3 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                vehicleDisabled
                  ? 'bg-amber-500/20 border-amber-500/60 text-slate-900 dark:text-white font-bold'
                  : 'bg-slate-50 border-slate-200 dark:bg-[#101622] dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-amber-500 dark:text-amber-400 text-[22px]">car_crash</span>
                <div>
                  <span className="text-xs font-semibold block text-slate-900 dark:text-white">Vehicle immobile, stranded or collision</span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400">Mechanical breakdown, rolled over, ravine drop, or road collapse</span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-amber-500 dark:text-amber-400">
                {vehicleDisabled ? 'check_box' : 'check_box_outline_blank'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setThreatPresent(!threatPresent)}
              className={`p-3 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                threatPresent
                  ? 'bg-red-500/20 border-red-500/60 text-slate-900 dark:text-white font-bold'
                  : 'bg-slate-50 border-slate-200 dark:bg-[#101622] dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-[22px]">gavel</span>
                <div>
                  <span className="text-xs font-semibold block text-slate-900 dark:text-white">Hostile contact or security hazard</span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400">Armed threat, highway robbery, or perimeter breach</span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-red-500 dark:text-red-400">
                {threatPresent ? 'check_box' : 'check_box_outline_blank'}
              </span>
            </button>
          </div>

          {/* Hold to Activate Button */}
          <div className="tactile-card rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3">
            <span className="text-xs font-semibold text-red-400">
              Hold button for 2 seconds to transmit SOS
            </span>

            <div className="relative w-40 h-40 flex items-center justify-center">
              {/* Circular Progress Ring */}
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="68"
                  stroke={theme === 'light' ? '#e2e8f0' : '#1a2232'}
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="68"
                  stroke="#ef4444"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={427}
                  strokeDashoffset={427 - (427 * holdProgress) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-100"
                />
              </svg>

              {/* Center Trigger Button */}
              <button
                type="button"
                onPointerDown={handleStartHold}
                onPointerUp={stopHolding}
                onPointerLeave={stopHolding}
                onPointerCancel={stopHolding}
                onMouseDown={handleStartHold}
                onMouseUp={stopHolding}
                onMouseLeave={stopHolding}
                onTouchStart={handleStartHold}
                onTouchEnd={stopHolding}
                onTouchCancel={stopHolding}
                onContextMenu={(e) => e.preventDefault()}
                className={`absolute w-28 h-28 rounded-full flex flex-col items-center justify-center transition-transform active:scale-95 shadow-2xl select-none cursor-pointer ${
                  isHolding
                    ? 'bg-red-600 text-white scale-105 shadow-[0_0_35px_rgba(239,68,68,0.7)] border-2 border-white/60'
                    : 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border-2 border-red-500/50'
                }`}
              >
                <span className="material-symbols-outlined text-[38px] font-bold">emergency</span>
                <span className={`text-[11px] font-semibold mt-0.5 ${isHolding ? 'font-mono' : ''}`}>
                  {isHolding ? `${Math.round(holdProgress)}%` : 'Hold SOS'}
                </span>
              </button>
            </div>

            <p className="text-xs text-slate-400 max-w-xs">
              Live coordinates (<span className="font-mono">{currentGPS.latitude.toFixed(4)}°N, {currentGPS.longitude.toFixed(4)}°E</span>) will be packaged and broadcast over satellite burst.
            </p>
          </div>

          {/* Quick Access to Separate Emergency Services Directory */}
          <div className="flex items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#101622] dark:border-white/[0.08] text-xs">
            <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 min-w-0">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[22px] shrink-0">local_hospital</span>
              <div className="min-w-0">
                <span className="font-semibold text-slate-900 dark:text-white block text-xs truncate">Looking for hospital, police or rescue directory?</span>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 block truncate">View nearest facilities, speed dial 112/108 & road navigation.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCurrentTab('emergency-support')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-white border border-emerald-500/40 font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0 active:scale-95"
            >
              <span>Services</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>

        </div>
      )}

    </div>
  );
};
