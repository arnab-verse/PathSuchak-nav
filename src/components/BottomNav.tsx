import React from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { AppTab } from '../types';

export const BottomNav: React.FC = () => {
  const { currentTab, setCurrentTab, syncQueue, incidents, isSyncing, activeSOS } = useApp();
  const { t } = useLanguage();

  const pendingSyncCount = syncQueue.filter(
    (i) => i.status === 'pending' || i.status === 'failed' || i.status === 'syncing'
  ).length + incidents.filter(
    (i) => i.syncStatus === 'pending' || i.syncStatus === 'syncing'
  ).length;

  const hasPendingSync = pendingSyncCount > 0 || isSyncing;

  const tabs: { id: AppTab; labelKey?: string; customLabel?: string; icon: string; isSOS?: boolean; isCyclone?: boolean; isSupport?: boolean }[] = [
    { id: 'driver-home', labelKey: 'nav.dashboard', icon: 'home' },
    { id: 'resilient-navigation', labelKey: 'nav.navigate', icon: 'explore' },
    { id: 'cyclone-map', customLabel: 'Weather Report', icon: 'thunderstorm', isCyclone: true },
    { id: 'emergency-support', customLabel: 'Services', icon: 'medical_services', isSupport: true },
    { id: 'incident-reporting', labelKey: 'nav.report', icon: 'assignment_late' },
    { id: 'emergency-sos', labelKey: 'nav.sos', icon: 'emergency', isSOS: true },
    { id: 'offline-sync-center', customLabel: 'Vault', icon: 'inventory_2' },
  ];

  return (
    <nav className="fixed bottom-0 w-full z-40 pb-safe bg-white/95 border-t border-slate-300 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:bg-[#0c1017]/95 dark:backdrop-blur-2xl dark:border-white/[0.08] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.6)]">
      <div className="flex justify-between items-center h-20 px-1 sm:px-2 max-w-xl mx-auto gap-0.5 sm:gap-1">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const label = tab.customLabel || (tab.labelKey ? t(tab.labelKey) : '');

          if (tab.isSOS) {
            return (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => setCurrentTab(tab.id)}
                className={`relative flex flex-col items-center justify-center flex-1 gap-0.5 h-14 rounded-xl transition-all cursor-pointer min-w-0 px-0.5 ${
                  isActive || activeSOS
                    ? 'text-white bg-red-600 shadow-[0_0_16px_rgba(220,38,38,0.6)] border border-red-700 scale-105'
                    : 'text-white bg-red-600 border border-red-700 hover:bg-red-700 shadow-sm dark:text-red-400 dark:bg-red-950/40 dark:border-red-900/50 dark:hover:bg-red-900/60 dark:hover:text-red-300'
                }`}
                title="Distress Call SOS Transponder"
              >
                {activeSOS && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 beacon-ping" />
                )}
                <span className="material-symbols-outlined text-[23px] font-bold text-white">
                  {tab.icon}
                </span>
                <span className="text-[11px] font-semibold uppercase leading-none truncate max-w-full text-white">
                  {label}
                </span>
              </button>
            );
          }

          if (tab.isSupport) {
            return (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => setCurrentTab(tab.id)}
                className={`relative flex flex-col items-center justify-center flex-1 gap-0.5 h-14 rounded-xl transition-all cursor-pointer min-w-0 px-0.5 ${
                  isActive
                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-800 shadow-sm dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-500/50 dark:shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                    : 'text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 dark:text-slate-400 dark:hover:text-emerald-300 dark:hover:bg-white/[0.04]'
                }`}
                title="Emergency Services Directory (Hospitals, Police, Rescue)"
              >
                {isActive && (
                  <span className="absolute -top-[1px] w-6 h-[2px] rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]" />
                )}
                <span className={`material-symbols-outlined text-[21px] ${isActive ? 'text-emerald-800 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
                  {tab.icon}
                </span>
                <span className={`text-[10px] sm:text-[11px] leading-none truncate max-w-full ${isActive ? 'font-semibold text-emerald-800 dark:text-emerald-200' : 'font-medium text-slate-600 dark:text-slate-400'}`}>
                  {label}
                </span>
              </button>
            );
          }

          if (tab.isCyclone) {
            return (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => setCurrentTab(tab.id)}
                className={`relative flex flex-col items-center justify-center flex-1 gap-0.5 h-14 rounded-xl transition-all cursor-pointer min-w-0 px-0.5 ${
                  isActive
                    ? 'bg-red-100 border border-red-300 text-red-800 shadow-sm dark:text-white dark:bg-red-600/30 dark:border-red-500 dark:shadow-[0_0_14px_rgba(239,68,68,0.5)]'
                    : 'text-slate-600 hover:text-red-800 hover:bg-red-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.04]'
                }`}
              >
                {isActive && (
                  <span className="absolute -top-[1px] w-6 h-[2px] rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]" />
                )}
                <span className={`material-symbols-outlined text-[21px] animate-spin ${isActive ? 'text-red-800 dark:text-red-400' : 'text-slate-600 dark:text-red-400'}`} style={{ animationDuration: '6s' }}>
                  cyclone
                </span>
                <span className={`text-[10px] sm:text-[11px] leading-none truncate max-w-full ${isActive ? 'font-semibold text-red-800 dark:text-red-300' : 'font-medium text-slate-600 dark:text-slate-400'}`}>
                  {label}
                </span>
              </button>
            );
          }

          const isReportTab = tab.id === 'incident-reporting';
          const activeBg = isReportTab 
            ? 'bg-orange-100 border border-orange-300 text-orange-800 shadow-sm dark:text-white dark:bg-white/[0.07] dark:border-white/[0.12] dark:shadow-inner'
            : 'bg-orange-100 border border-orange-300 text-orange-800 shadow-sm dark:text-white dark:bg-white/[0.07] dark:border-white/[0.12] dark:shadow-inner';
          const inactiveBg = 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/[0.03]';

          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              onClick={() => setCurrentTab(tab.id)}
              className={`relative flex flex-col items-center justify-center flex-1 gap-0.5 h-14 rounded-xl transition-all cursor-pointer min-w-0 px-0.5 ${
                isActive ? activeBg : inactiveBg
              }`}
            >
              {/* Active Tab Top Glow Notch */}
              {isActive && (
                <span className="absolute -top-[1px] w-6 h-[2px] rounded-full bg-primary shadow-[0_0_8px_rgba(255,122,26,0.9)]" />
              )}

              {/* Pending Cloud Sync Visual Status Indicator (Green Pulse Dot) */}
              {tab.id === 'offline-sync-center' && hasPendingSync && (
                <span 
                  className="absolute top-1.5 right-2 flex h-2.5 w-2.5 items-center justify-center pointer-events-none" 
                  title={`${pendingSyncCount} pending item${pendingSyncCount > 1 ? 's' : ''} waiting to sync`}
                >
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
                </span>
              )}
              <span className={`material-symbols-outlined text-[21px] transition-transform ${
                isActive 
                  ? 'text-orange-800 dark:text-primary scale-110' 
                  : 'text-slate-600 dark:text-slate-400'
              }`}>
                {tab.icon}
              </span>
              <span className={`text-[10px] sm:text-[11px] leading-none truncate max-w-full ${
                isActive 
                  ? 'font-semibold text-orange-800 dark:text-white' 
                  : 'font-medium text-slate-600 dark:text-slate-400'
              }`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
