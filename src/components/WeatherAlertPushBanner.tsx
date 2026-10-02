import React, { useState, useEffect } from 'react';
import { weatherPushService, WeatherPushAlert } from '../services/weather-push-notification.service';
import { useApp } from '../context/AppContext';

export const WeatherAlertPushBanner: React.FC = () => {
  const [activeAlert, setActiveAlert] = useState<WeatherPushAlert | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const { setCurrentTab, showToast } = useApp();

  useEffect(() => {
    // Listen to real-time weather push notifications
    const unsubscribe = weatherPushService.subscribe((alert) => {
      if (!alert) {
        setActiveAlert(null);
        return;
      }
      setActiveAlert(alert);
      setIsDismissed(false);
    });

    const handleCustomEvent = (e: any) => {
      if (e.detail) {
        setActiveAlert(e.detail);
        setIsDismissed(false);
      }
    };

    window.addEventListener('weather-push-alert', handleCustomEvent);

    return () => {
      unsubscribe();
      window.removeEventListener('weather-push-alert', handleCustomEvent);
    };
  }, []);

  if (!activeAlert || isDismissed) return null;

  const isRed = activeAlert.severity === 'Red';

  const handleNavigateToRadar = () => {
    setCurrentTab('cyclone-map');
    setIsDismissed(true);
    showToast(`Navigated to Weather & Cyclone Radar for ${activeAlert.region}`);
  };

  const handleSpeakAlert = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const text = `Critical Weather Alert for ${activeAlert.region}. ${activeAlert.title}. ${activeAlert.summary}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    showToast('🔊 Playing Alert Audio Announcement');
  };

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[10000] w-[95%] max-w-3xl animate-bounceIn drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
      <div 
        className={`rounded-2xl p-4 border backdrop-blur-xl transition-all shadow-2xl relative overflow-hidden ${
          isRed
            ? 'bg-[#180507]/95 border-red-500/80 shadow-[0_0_40px_rgba(239,68,68,0.5)] text-white'
            : 'bg-[#1c0f03]/95 border-amber-500/80 shadow-[0_0_40px_rgba(245,158,11,0.5)] text-white'
        }`}
      >
        {/* Glowing Top Alert Line */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 ${isRed ? 'bg-gradient-to-r from-red-600 via-rose-400 to-red-600 animate-pulse' : 'bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 animate-pulse'}`} />

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pt-1">
          
          {/* Icon & Details */}
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border font-bold shadow-lg ${
              isRed
                ? 'bg-red-600/30 text-red-400 border-red-500/60 animate-ping-slow'
                : 'bg-amber-600/30 text-amber-400 border-amber-500/60'
            }`}>
              <span className="material-symbols-outlined text-[26px]">
                {isRed ? 'warning' : 'thunderstorm'}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider border shadow-sm ${
                  isRed
                    ? 'bg-red-600 text-white border-red-400 animate-pulse'
                    : 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                }`}>
                  {isRed ? '🚨 RED WEATHER WARNING' : '🟧 ORANGE WEATHER ALERT'}
                </span>

                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/10 border border-white/15 text-slate-200">
                  📍 {activeAlert.region}
                </span>

                <span className="text-[10px] font-mono text-slate-400">
                  {new Date(activeAlert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <h4 className="text-sm sm:text-base font-bold font-display leading-tight text-white">
                {activeAlert.title}
              </h4>

              <p className="text-xs text-slate-300 leading-relaxed font-sans line-clamp-2">
                {activeAlert.summary}
              </p>

              {/* Telemetry pill */}
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-slate-300">
                {activeAlert.windSpeedKmph && (
                  <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded border border-white/10">
                    <span className="material-symbols-outlined text-[13px] text-cyan-400">air</span>
                    Winds: <strong className="text-cyan-300">{activeAlert.windSpeedKmph} km/h</strong>
                  </span>
                )}
                {activeAlert.rainfallMm24h && (
                  <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded border border-white/10">
                    <span className="material-symbols-outlined text-[13px] text-blue-400">rainy</span>
                    Rainfall: <strong className="text-blue-300">{activeAlert.rainfallMm24h} mm/24h</strong>
                  </span>
                )}
                <span className="text-[10px] text-slate-400">
                  Source: {activeAlert.source}
                </span>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex sm:flex-col items-center gap-2 shrink-0 justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
            <button
              onClick={handleNavigateToRadar}
              className={`w-full px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 ${
                isRed
                  ? 'bg-red-600 hover:bg-red-500 text-white border border-red-400'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-300'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">cyclone</span>
              <span>View Radar</span>
            </button>

            <div className="flex items-center gap-1.5 w-full">
              <button
                onClick={handleSpeakAlert}
                className="flex-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 border border-white/15 text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                title="Read Audio Announcement"
              >
                <span className="material-symbols-outlined text-[15px]">volume_up</span>
                <span className="hidden sm:inline">Audio</span>
              </button>

              <button
                onClick={() => setIsDismissed(true)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/25 text-slate-300 transition-colors"
                title="Dismiss Alert"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
