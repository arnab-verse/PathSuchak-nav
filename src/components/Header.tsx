import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage, SupportedLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useDeviceBattery } from '../context/useDeviceBattery';
import { AppTab } from '../types';
import { NetworkSpeedMeter } from './NetworkSpeedMeter';

interface HeaderProps {
  currentTab: AppTab;
}

export const Header: React.FC<HeaderProps> = ({ currentTab }) => {
  const battery = useDeviceBattery();
  const { 
    isOnline, 
    networkSimulationMode, 
    setNetworkSimulationMode, 
    checkNetworkStatus,
    gpsSource, 
    setGpsSource,
    activateRealGPS,
    isSimulatingMovement,
    setIsSimulatingMovement,
    activeSOS,
    syncQueue,
    showToast,
    setCurrentTab,
    theme,
    setTheme,
    toggleTheme
  } = useApp();

  const { language, setLanguage, t, languages } = useLanguage();
  const { currentUser, userProfile, openAuthModal, logout } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isProbingNetwork, setIsProbingNetwork] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [langFilterCategory, setLangFilterCategory] = useState<'all' | 'official' | 'regional'>('all');
  const langMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const filteredLanguages = useMemo(() => {
    return languages.filter(l => {
      const matchesCategory = langFilterCategory === 'all' || l.category === langFilterCategory;
      const query = langSearch.toLowerCase().trim();
      const matchesQuery = !query || 
        l.name.toLowerCase().includes(query) || 
        l.nativeName.toLowerCase().includes(query) || 
        l.code.toLowerCase().includes(query) || 
        (l.region && l.region.toLowerCase().includes(query));
      return matchesCategory && matchesQuery;
    });
  }, [languages, langFilterCategory, langSearch]);

  const handleProbeNetwork = async () => {
    setIsProbingNetwork(true);
    const online = await checkNetworkStatus();
    setIsProbingNetwork(false);
    showToast(online ? '✓ Network Online: Satellite Uplink Established' : '✗ Network Check: Offline / No Route');
  };

  const pendingCount = syncQueue.filter(i => i.status === 'pending' || i.status === 'failed').length;

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setIsLangMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isLangMenuOpen || isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLangMenuOpen, isUserMenuOpen]);

  const getTabTitle = () => {
    switch (currentTab) {
      case 'driver-home':
        return t('header.dashboard');
      case 'resilient-navigation':
        return t('header.navigate');
      case 'cyclone-map':
        return 'Weather Report';
      case 'incident-reporting':
        return t('header.report');
      case 'emergency-support':
        return 'Emergency Services Directory';
      case 'emergency-sos':
        return t('header.sos');
      case 'offline-sync-center':
        return t('header.sync');
      default:
        return 'Tactical Ops';
    }
  };

  const handleLanguageChange = (code: SupportedLanguage) => {
    setLanguage(code);
    setIsLangMenuOpen(false);
    const selectedLang = languages.find(l => l.code === code);
    showToast(`Language switched to ${selectedLang?.name || code}`);
  };

  const currentLangObj = languages.find(l => l.code === language) || languages[0];

  return (
    <>
      <header className="fixed top-0 w-full z-50 bg-white/95 border-b border-slate-300 shadow-sm text-slate-900 dark:bg-[#0c1017]/95 dark:backdrop-blur-2xl dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)] dark:border-white/[0.08] pt-safe">
        <div className="h-16 px-3 sm:px-4 flex items-center justify-between gap-2 max-w-xl mx-auto">
          
          {/* Status Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <button 
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 dark:bg-[#141b26] dark:hover:bg-[#1a2332] dark:border-white/[0.08] hover:border-primary/40 cursor-pointer transition-all shadow-sm group active:scale-95"
              title="Mesh Status & Diagnostics"
            >
              <div 
                className={`w-2 h-2 rounded-full transition-all ${
                  activeSOS 
                    ? 'bg-error shadow-[0_0_8px_rgba(239,68,68,0.9)] beacon-ping' 
                    : isOnline 
                    ? 'bg-secondary shadow-[0_0_6px_rgba(16,185,129,0.7)]' 
                    : 'bg-tertiary shadow-[0_0_6px_rgba(245,158,11,0.6)]'
                }`} 
              />
              <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-white">
                {activeSOS 
                  ? 'SOS' 
                  : isOnline 
                  ? 'Online' 
                  : 'Offline'}
              </span>
            </button>

            {pendingCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-900 border border-orange-300 dark:bg-primary/15 dark:text-primary dark:border-primary/30 rounded-md text-[10px] font-bold font-mono shadow-sm">
                <span className="material-symbols-outlined text-[12px]">sync</span>
                <span>{pendingCount}</span>
              </div>
            )}
          </div>

          {/* Screen Title */}
          <div className="flex items-center justify-center gap-1.5 truncate flex-1 px-2 text-center">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/80 hidden xs:inline-block" />
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              {getTabTitle()}
            </h1>
          </div>

          {/* Right Action Icons: Theme Toggle, Language Toggle Dropdown & Settings */}
          <div className="flex items-center gap-1.5 shrink-0">
            
            {/* Dedicated Theme Toggle: Tactical Black (Default) vs Light Day vs Night Vision */}
            <button
              id="theme-toggle-header-button"
              type="button"
              onClick={() => {
                toggleTheme();
                const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'night-vision' : 'dark';
                showToast(
                    nextTheme === 'night-vision'
                    ? '🟢 Night Vision (NVG) Engaged: Phosphor Green Field Filter Active'
                    : nextTheme === 'light'
                    ? '☀️ Daylight Expedition (light mode) enabled and saved'
                    : '🌙 Black (default) theme restored and saved'
                );
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all shadow-sm active:scale-95 cursor-pointer ${
                theme === 'night-vision'
                  ? 'bg-emerald-950/90 hover:bg-emerald-900 border-emerald-500/70 text-emerald-300 shadow-[0_0_12px_rgba(34,197,94,0.35)]'
                  : theme === 'light'
                  ? 'bg-amber-100 hover:bg-amber-200 border-amber-400 text-amber-950 shadow-[0_0_10px_rgba(245,158,11,0.25)] font-semibold'
                  : 'bg-[#141b26] hover:bg-[#1a2332] border-white/[0.08] hover:border-amber-500/40 text-slate-300 hover:text-white'
              }`}
              title={
                theme === 'night-vision'
                  ? 'Night Vision (NVG) Active: Click to switch to Black (default)'
                  : theme === 'light'
                  ? 'Daylight Expedition Active: Click to switch to Night Vision'
                  : 'Black (default) Active: Click to switch to Daylight Expedition'
              }
              aria-label="Toggle Display Theme"
            >
              {theme === 'night-vision' ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <span className="material-symbols-outlined text-[15px] text-emerald-400">visibility</span>
                  <span className="text-[11px] font-semibold text-emerald-300">NVG</span>
                </>
              ) : theme === 'light' ? (
                <>
                  <span className="material-symbols-outlined text-[15px] text-amber-700">light_mode</span>
                  <span className="text-[11px] font-semibold text-amber-950">Daylight</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[15px] text-amber-400">dark_mode</span>
                  <span className="text-[11px] font-semibold text-slate-200">Black</span>
                </>
              )}
            </button>

            {/* Language Switcher Dropdown Button */}
            <div className="relative" ref={langMenuRef}>
              <button
                id="language-selector-button"
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 dark:bg-[#141b26] dark:hover:bg-[#1a2332] dark:border-white/[0.08] dark:hover:border-white/[0.16] dark:text-white text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
                title={t('header.change_language')}
                aria-label="Change Language"
                aria-haspopup="true"
                aria-expanded={isLangMenuOpen}
              >
                <span className="text-[13px] leading-none">{currentLangObj.flag}</span>
                <span className="text-[11px] text-slate-800 dark:text-slate-300 font-semibold">{currentLangObj.code.toUpperCase()}</span>
                <span className="material-symbols-outlined text-[14px] text-slate-600 dark:text-slate-400">
                  {isLangMenuOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {/* Backdrop to prevent clicks and elements bleeding through */}
              {isLangMenuOpen && (
                <div 
                  className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[90] animate-fadeIn"
                  onClick={() => setIsLangMenuOpen(false)}
                  aria-hidden="true"
                />
              )}

              {/* Language Selection Menu */}
              {isLangMenuOpen && (
                <div 
                  id="language-dropdown-menu"
                  className="absolute right-0 mt-2 w-[min(340px,calc(100vw-24px))] bg-[#141b26]/98 border border-white/[0.15] rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.8)] p-2.5 z-[100] flex flex-col gap-2 animate-fadeIn backdrop-blur-2xl max-h-[80vh]"
                >
                  <div className="px-1.5 py-1 text-[11px] uppercase font-mono font-bold text-slate-300 tracking-wider border-b border-white/[0.08] flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">🇮🇳</span>
                      <span>{t('header.select_language')}</span>
                      <span className="text-[10px] text-primary font-mono ml-1">({languages.length})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLangMenuOpen(false)}
                      className="w-6 h-6 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
                      title="Close language menu"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Search and Category Filter */}
                  <div className="space-y-1.5 px-0.5">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-2 top-2 text-[16px] text-slate-400">search</span>
                      <input
                        type="text"
                        value={langSearch}
                        onChange={(e) => setLangSearch(e.target.value)}
                        placeholder="Search Hindi, Tamil, Bengali, Dogri..."
                        className="w-full pl-7 pr-7 py-1.5 bg-[#0e131d] border border-white/[0.1] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                        autoFocus
                      />
                      {langSearch && (
                        <button
                          type="button"
                          onClick={() => setLangSearch('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-white text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setLangFilterCategory('all')}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                          langFilterCategory === 'all'
                            ? 'bg-primary text-on-primary font-bold'
                            : 'bg-white/[0.05] text-slate-400 hover:text-white'
                        }`}
                      >
                        All ({languages.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLangFilterCategory('official')}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                          langFilterCategory === 'official'
                            ? 'bg-primary text-on-primary font-bold'
                            : 'bg-white/[0.05] text-slate-400 hover:text-white'
                        }`}
                      >
                        Official (23)
                      </button>
                      <button
                        type="button"
                        onClick={() => setLangFilterCategory('regional')}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                          langFilterCategory === 'regional'
                            ? 'bg-primary text-on-primary font-bold'
                            : 'bg-white/[0.05] text-slate-400 hover:text-white'
                        }`}
                      >
                        Regional (13)
                      </button>
                    </div>
                  </div>

                  {/* Languages List with constrained height to prevent overlapping bottom nav */}
                  <div className="max-h-[min(240px,40vh)] overflow-y-auto flex flex-col gap-1 pr-1 custom-scrollbar">
                    {filteredLanguages.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No languages found matching "{langSearch}"
                      </div>
                    ) : (
                      filteredLanguages.map((item) => {
                        const isSelected = language === item.code;
                        return (
                          <button
                            key={item.code}
                            id={`language-option-${item.code}`}
                            onClick={() => handleLanguageChange(item.code)}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer text-left ${
                              isSelected
                                ? 'bg-primary text-on-primary font-bold shadow-md'
                                : 'hover:bg-white/[0.06] text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm shrink-0">{item.flag}</span>
                              <div className="flex flex-col truncate">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold leading-tight">{item.nativeName}</span>
                                  <span className={`text-[10px] font-normal ${isSelected ? 'text-on-primary/90' : 'text-slate-400'}`}>
                                    ({item.name})
                                  </span>
                                </div>
                                <span className={`text-[9px] font-mono truncate ${isSelected ? 'text-on-primary/75' : 'text-slate-500'}`}>
                                  {item.region}
                                </span>
                              </div>
                            </div>
                            {isSelected && (
                              <span className="material-symbols-outlined text-[16px] shrink-0 ml-1">check</span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile & Auth Indicator */}
            <div className="relative" ref={userMenuRef}>
              {currentUser ? (
                <button
                  id="header-user-profile-button"
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className={`h-8 px-2 rounded-xl flex items-center gap-1.5 border transition-all text-xs font-semibold cursor-pointer shadow-sm active:scale-95 ${
                    theme === 'night-vision'
                      ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/60'
                      : theme === 'light'
                      ? 'bg-orange-100 border-orange-300 text-orange-900 hover:bg-orange-200'
                      : 'bg-primary/15 border-primary/40 text-primary hover:bg-primary/25'
                  }`}
                  title={`Operator: ${userProfile?.displayName || 'Active'} (${userProfile?.callsign || 'Online'})`}
                >
                  {currentUser.photoURL ? (
                    <img 
                      src={currentUser.photoURL} 
                      alt="User avatar" 
                      className="w-5 h-5 rounded-full object-cover border border-primary/50"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[10px]">
                      {(userProfile?.callsign || userProfile?.displayName || 'Op').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden sm:inline max-w-[80px] truncate">
                    {userProfile?.callsign || 'Operator'}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                </button>
              ) : (
                <button
                  id="header-login-button"
                  type="button"
                  onClick={() => setCurrentTab('account')}
                  className="h-8 px-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary/90 transition-all flex items-center gap-1.5 text-xs font-semibold shadow-md active:scale-95 cursor-pointer"
                  title="Open Login & Registration Page"
                >
                  <span className="material-symbols-outlined text-[16px]">lock_open</span>
                  <span className="hidden xs:inline">Sign in</span>
                </button>
              )}

              {/* User Account Popover */}
              {isUserMenuOpen && currentUser && (
                <div 
                  id="header-user-dropdown"
                  className={`absolute right-0 top-full mt-2 w-72 rounded-2xl border p-4 shadow-2xl z-50 backdrop-blur-xl animate-fadeIn ${
                    theme === 'night-vision'
                      ? 'bg-[#040f07] border-emerald-500/60 text-emerald-100 shadow-[0_0_25px_rgba(34,197,94,0.2)]'
                      : theme === 'light'
                      ? 'bg-white border-slate-300 text-slate-900 shadow-[0_16px_36px_rgba(0,0,0,0.12)]'
                      : 'bg-[#0f172a] border-white/[0.12] text-white shadow-[0_0_30px_rgba(0,0,0,0.8)]'
                  }`}
                >
                  <div className="flex items-center gap-3 pb-3 border-b border-white/[0.08]">
                    {currentUser.photoURL ? (
                      <img 
                        src={currentUser.photoURL} 
                        alt="Operator avatar" 
                        className="w-10 h-10 rounded-xl object-cover border border-primary/50 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary flex items-center justify-center text-primary font-bold font-mono text-sm shrink-0">
                        {(userProfile?.callsign || userProfile?.displayName || 'OP').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm truncate">
                        {userProfile?.displayName || currentUser.displayName || 'Navigator User'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        {currentUser.email}
                      </div>
                    </div>
                  </div>

                  <div className="py-2.5 space-y-1.5 text-[11px] font-mono border-b border-white/[0.08]">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">User Handle:</span>
                      <span className="font-bold text-primary">{userProfile?.callsign || 'TRAVELER'}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Region:</span>
                      <span className="truncate max-w-[140px]">{userProfile?.unit || 'Public User'}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Cloud Sync:</span>
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Protected & Private
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Terminal:</span>
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <span className="material-symbols-outlined text-[13px]">devices</span>
                        Recognized Device
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setCurrentTab('account');
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 text-xs font-semibold text-primary transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">account_box</span>
                      <span>My profile & cloud records</span>
                    </button>
                    <button
                      id="user-menu-theme-settings-button"
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setIsSettingsOpen(true);
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-xs font-semibold text-amber-700 dark:text-amber-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">tune</span>
                      <span>Display theme & settings</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        openAuthModal('login');
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">switch_account</span>
                      <span>Switch account</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setIsUserMenuOpen(false);
                        await logout();
                        showToast('Signed out of session');
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-xs font-semibold text-red-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">logout</span>
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Diagnostics / Settings Button */}
            <button 
              id="header-settings-button"
              onClick={() => setIsSettingsOpen(true)}
              className="w-8 h-8 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 transition-all flex items-center justify-center shadow-sm active:scale-95 text-on-surface-variant hover:text-primary cursor-pointer"
              title="App Settings & Network Controls"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
            </button>
          </div>
        </div>
      </header>

      {/* System Diagnostics & Simulation Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-surface-container border border-outline-variant/50 rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">tune</span>
                <h3 className="font-bold text-lg text-on-surface">App & Navigation Settings</h3>
              </div>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* User Profile Card */}
            <div className="bg-surface-container-high p-3 rounded-xl mb-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary flex items-center justify-center text-primary font-bold text-base font-mono shrink-0">
                {currentUser ? (userProfile?.callsign?.slice(0, 2) || 'US') : '01'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="font-bold text-on-surface text-sm truncate">
                    {currentUser 
                      ? (userProfile?.displayName || currentUser.displayName || 'Navigator User') 
                      : 'Guest Traveler'}
                  </h4>
                  {currentUser ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500 text-emerald-300">
                      AUTHENTICATED
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setIsSettingsOpen(false);
                        openAuthModal('login');
                      }}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary text-on-primary font-bold hover:bg-primary/90 cursor-pointer"
                    >
                      LOGIN
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-mono truncate mt-0.5">
                  <span>{currentUser ? `User: ${userProfile?.displayName || userProfile?.callsign || 'Member'}` : 'Offline Local Storage'}</span>
                  <span>•</span>
                  <span className="text-secondary font-semibold">
                    {currentUser ? 'Cloud Segregated' : 'Guest Mode'}
                  </span>
                </div>
              </div>
            </div>

            {/* Persistent UI Theme Toggle: 'Daylight Expedition' (light mode) vs 'Dark' (default) */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[17px] text-primary">palette</span>
                  <span>Display theme</span>
                </label>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${
                  theme === 'light'
                    ? 'bg-amber-100 text-amber-950 border-amber-300 shadow-sm'
                    : theme === 'night-vision'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                    : 'bg-primary/15 text-primary border-primary/30'
                }`}>
                  {theme === 'light' ? 'Daylight Expedition' : theme === 'night-vision' ? 'Night Vision' : 'Dark (Default)'}
                </span>
              </div>

              {/* Segmented Quick Switcher Rail */}
              <div className="p-1 rounded-xl bg-slate-200/90 dark:bg-[#0a0f18] border border-slate-300 dark:border-white/[0.08] flex items-center gap-1 mb-2.5 shadow-inner">
                <button
                  id="settings-theme-toggle-light"
                  type="button"
                  onClick={() => {
                    setTheme('light');
                    showToast('☀️ Daylight Expedition (light mode) enabled and saved');
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    theme === 'light'
                      ? 'bg-white text-orange-950 shadow-md border border-orange-300/80 font-bold scale-[1.02]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.05]'
                  }`}
                  title="Switch to Daylight Expedition (light mode)"
                  aria-pressed={theme === 'light'}
                >
                  <span className="material-symbols-outlined text-[16px] text-amber-600">light_mode</span>
                  <span>Daylight Expedition</span>
                  {theme === 'light' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  )}
                </button>

                <button
                  id="settings-theme-toggle-dark"
                  type="button"
                  onClick={() => {
                    setTheme('dark');
                    showToast('🌙 Dark (default) theme enabled and saved');
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-[#182234] text-white shadow-md border border-primary/50 font-bold scale-[1.02]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.05]'
                  }`}
                  title="Switch to Dark (default) theme"
                  aria-pressed={theme === 'dark'}
                >
                  <span className="material-symbols-outlined text-[16px] text-amber-400">dark_mode</span>
                  <span>Dark (Default)</span>
                  {theme === 'dark' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </div>

              {/* Detailed Theme Option Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  id="settings-card-daylight-expedition"
                  type="button"
                  onClick={() => {
                    setTheme('light');
                    showToast('☀️ Daylight Expedition (light mode) enabled and saved');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    theme === 'light'
                      ? 'bg-amber-50/90 border-amber-500 text-amber-950 shadow-md ring-2 ring-amber-500/30'
                      : 'bg-surface-container-high border-outline-variant/30 text-slate-700 dark:text-slate-300 hover:border-outline-variant hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                          <span className="material-symbols-outlined text-[18px]">light_mode</span>
                        </div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Daylight Expedition</span>
                      </div>
                      {theme === 'light' ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white shadow-sm">
                          Active
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-slate-400 dark:border-slate-600 flex items-center justify-center" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                      High-contrast cartography, white elevated cards, recessed telemetry bays, and sunlight readability.
                    </p>
                  </div>
                  <div className="text-[10px] font-mono text-amber-800 dark:text-amber-400 font-semibold flex items-center gap-1">
                    <span>Outdoor daylight mode</span>
                  </div>
                </button>

                <button
                  id="settings-card-dark-default"
                  type="button"
                  onClick={() => {
                    setTheme('dark');
                    showToast('🌙 Dark (default) theme enabled and saved');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    theme === 'dark'
                      ? 'bg-[#182232] border-primary text-white shadow-md ring-2 ring-primary/40'
                      : 'bg-surface-container-high border-outline-variant/30 text-slate-700 dark:text-slate-300 hover:border-outline-variant hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-7 h-7 rounded-lg bg-[#141b26] border border-white/[0.1] flex items-center justify-center text-amber-400 shrink-0">
                          <span className="material-symbols-outlined text-[18px]">dark_mode</span>
                        </div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Dark (Default)</span>
                      </div>
                      {theme === 'dark' ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary text-white shadow-sm">
                          Active
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-slate-400 dark:border-slate-600 flex items-center justify-center" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                      Tactical low-glare expedition theme, dark telemetry displays, battery efficiency, and night operations.
                    </p>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 font-semibold flex items-center gap-1">
                    <span>Default expedition theme</span>
                  </div>
                </button>
              </div>

              {/* Optional Secondary Tactical Preset (NVG) */}
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between text-xs">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Specialized NVG:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = theme === 'night-vision' ? 'dark' : 'night-vision';
                    setTheme(next);
                    showToast(next === 'night-vision' ? '🟢 Night Vision (NVG) Engaged' : '🌙 Dark (default) theme restored');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                    theme === 'night-vision'
                      ? 'bg-[#0b2413] border-emerald-500 text-emerald-300 shadow-[0_0_12px_rgba(34,197,94,0.3)]'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 dark:bg-white/[0.05] dark:border-white/[0.08] dark:text-slate-300'
                  }`}
                  title="Toggle Phosphor Green Night Vision Goggles filter"
                >
                  <span className="material-symbols-outlined text-[14px] text-emerald-500">visibility</span>
                  <span>{theme === 'night-vision' ? 'NVG Active (Click to Exit)' : 'Enable NVG Phosphor Green'}</span>
                </button>
              </div>

              <div className="mt-1.5 text-[10px] text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] text-emerald-500">check_circle</span>
                <span>Preferences persist automatically across sessions on this device</span>
              </div>
            </div>

            {/* Language Selector inside diagnostics as well */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  {t('header.change_language')}
                </label>
                <span className="text-[10px] font-mono text-primary">
                  🇮🇳 {languages.length} Indian Languages
                </span>
              </div>
              <div className="bg-[#101622] border border-white/[0.08] rounded-xl p-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
                  {languages.map((l) => {
                    const isSelected = language === l.code;
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => {
                          setLanguage(l.code);
                          showToast(`Language switched to ${l.name}`);
                        }}
                        className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-primary text-on-primary border-primary font-bold shadow-md'
                            : 'bg-[#141b26] border-white/[0.06] text-slate-300 hover:text-white hover:bg-[#1c2637]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold truncate leading-tight">{l.nativeName}</span>
                          <span className="text-[10px] opacity-70 ml-1 font-mono uppercase">{l.code}</span>
                        </div>
                        <div className="text-[10px] truncate opacity-80 mt-0.5">{l.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Network Mode Simulation */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  {t('header.mesh_link')}
                </label>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  isOnline ? 'bg-secondary/20 text-secondary border border-secondary/30' : 'bg-tertiary/20 text-tertiary border border-tertiary/30'
                }`}>
                  STATUS: {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5">
                <button
                  type="button"
                  onClick={() => setNetworkSimulationMode('auto')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    networkSimulationMode === 'auto'
                      ? 'bg-primary/20 border-primary text-primary font-bold shadow-md'
                      : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px] block mb-1">radar</span>
                  <span className="text-xs">Auto Detect</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNetworkSimulationMode('online')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    networkSimulationMode === 'online'
                      ? 'bg-secondary/20 border-secondary text-secondary font-bold shadow-md'
                      : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px] block mb-1">satellite_alt</span>
                  <span className="text-xs">{t('header.online_mode')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNetworkSimulationMode('spotty')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    networkSimulationMode === 'spotty'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold shadow-md'
                      : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px] block mb-1">cell_wifi</span>
                  <span className="text-xs">{t('header.spotty_mode')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNetworkSimulationMode('offline')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    networkSimulationMode === 'offline'
                      ? 'bg-tertiary/20 border-tertiary text-tertiary font-bold shadow-md'
                      : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px] block mb-1">cloud_off</span>
                  <span className="text-xs">{t('header.offline_mode')}</span>
                </button>
              </div>

              {/* Live Internet Speed Meter */}
              <NetworkSpeedMeter />

              {/* Probe Network Uplink Button */}
              <button
                type="button"
                onClick={handleProbeNetwork}
                disabled={isProbingNetwork}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#141b26] hover:bg-[#1a2332] border border-white/[0.1] text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[16px] ${isProbingNetwork ? 'animate-spin text-primary' : 'text-primary'}`}>
                  {isProbingNetwork ? 'progress_activity' : 'network_check'}
                </span>
                <span>{isProbingNetwork ? 'Probing uplink gateways...' : 'Check real network connectivity now'}</span>
              </button>
            </div>

            {/* GPS Tracking Source */}
            <div className="mb-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                Location Tracking Source
              </label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={() => setGpsSource('simulation')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    gpsSource === 'simulation'
                      ? 'bg-primary/20 border-primary text-primary font-bold'
                      : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="material-symbols-outlined text-[18px]">route</span>
                    <span className="text-xs font-bold">Simulated Tour</span>
                  </div>
                  <p className="text-[11px] opacity-80">Sample route movement</p>
                </button>

                <button
                  onClick={() => activateRealGPS()}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    gpsSource === 'device'
                      ? 'bg-primary/20 border-primary text-primary font-bold'
                      : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="material-symbols-outlined text-[18px]">my_location</span>
                    <span className="text-xs font-bold">Real Device GPS</span>
                  </div>
                  <p className="text-[11px] opacity-80">Browser Geolocation API</p>
                </button>
              </div>

              {gpsSource === 'simulation' && (
                <div className="flex items-center justify-between p-2.5 bg-surface-container-high rounded-xl text-xs">
                  <span className="text-on-surface">Simulate Route Movement:</span>
                  <button
                    onClick={() => setIsSimulatingMovement(!isSimulatingMovement)}
                    className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                      isSimulatingMovement ? 'bg-secondary text-on-secondary' : 'bg-surface-variant text-on-surface-variant'
                    }`}
                  >
                    {isSimulatingMovement ? 'Active' : 'Paused'}
                  </button>
                </div>
              )}
            </div>

            {/* Vehicle & Telemetry Status */}
            <div className="bg-surface-container-high p-3 rounded-xl mb-4 text-xs space-y-2">
              <div className="flex justify-between items-center text-on-surface-variant">
                <span>Device Battery:</span>
                <span className={`font-mono font-bold flex items-center gap-1 ${
                  battery.level <= 20 ? 'text-red-500' : 'text-secondary'
                }`}>
                  {battery.level}%
                  {battery.isCharging && <span className="text-amber-400 font-bold">⚡</span>}
                  <span className="text-[10px] font-sans text-slate-400">({battery.statusLabel})</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-on-surface-variant">
                <span>Estimated Range:</span>
                <span className="font-mono text-on-surface font-bold">~380 km</span>
              </div>
              <div className="flex justify-between items-center text-on-surface-variant">
                <span>Emergency Hotline Link:</span>
                <span className="font-mono text-primary font-bold">Universal 112 Ready</span>
              </div>
            </div>

            <button
              onClick={() => setIsSettingsOpen(false)}
              className="w-full bg-primary hover:bg-primary/90 text-on-primary py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};

