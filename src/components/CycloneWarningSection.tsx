import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  CycloneSystem, 
  CycloneForecastPoint, 
  getCycloneThreatAssessment,
  PORT_WARNING_SIGNALS,
  getNearestShelters,
  generateWarningSpeechText,
  INDIAN_STATES_WEATHER_DEFAULTS,
  StateWeatherReport as StateWeatherReportType,
  fetchLiveAllStatesWeather,
  fetchGdacsCyclones,
  GdacsFeedResponse,
  HISTORICAL_CYCLONES_10Y
} from '../services/cyclone-tracker.service';
import { CycloneMapCanvas } from './CycloneMapCanvas';
import { WeatherMapCanvas } from './WeatherMapCanvas';
import { StateWeatherReportSection } from './StateWeatherReport';
import { weatherPushService } from '../services/weather-push-notification.service';

export const CycloneWarningSection: React.FC = () => {
  const { currentGPS, setCurrentTab, showToast, calculateRoadRouteToDestination, isFullScreenMap, setIsFullScreenMap } = useApp();

  // Reset fullscreen if user navigates away from this tab
  useEffect(() => {
    return () => {
      setIsFullScreenMap(false);
    };
  }, [setIsFullScreenMap]);

  // Active top view tab: 'weather' or 'cyclone'
  const [activeSubTab, setActiveSubTab] = useState<'weather' | 'cyclone'>('weather');

  // GDACS UN OCHA Live Feed State (India Only: Bay of Bengal & Arabian Sea)
  const [gdacsFeed, setGdacsFeed] = useState<GdacsFeedResponse | null>(null);
  const [isLoadingGdacs, setIsLoadingGdacs] = useState<boolean>(true);
  const [dateFilterMode, setDateFilterMode] = useState<'active' | 'custom'>('active');
  const [customFromDate, setCustomFromDate] = useState<string>('2026-06-01');
  const [customToDate, setCustomToDate] = useState<string>('2026-09-26');

  // Load GDACS tropical cyclones for Indian basin
  const loadGdacsCyclones = async (from?: string, to?: string, force = false) => {
    setIsLoadingGdacs(true);
    try {
      const feed = await fetchGdacsCyclones(from, to, force);
      setGdacsFeed(feed);
      // Synchronize push alerts strictly with verified, currently active severe Indian systems
      const activeCurrentSevere = (feed.indianSystems || []).filter(
        s => s.isCurrent && !s.alertLevel.includes('Green')
      );
      weatherPushService.checkCurrentWarnings(false, activeCurrentSevere);

      // Select first Indian system if available
      const systems = feed.indianSystems || [];
      if (systems.length > 0) {
        setSelectedCycloneId(systems[0].id);
      } else {
        setSelectedCycloneId('');
      }
    } catch (err) {
      console.warn('Failed loading GDACS feed:', err);
    } finally {
      setIsLoadingGdacs(false);
    }
  };

  useEffect(() => {
    loadGdacsCyclones();
  }, []);

  // Filtered systems from live GDACS feed: Indian Basin only (strictly current active storms in live mode)
  const displayedSystems = useMemo(() => {
    if (!gdacsFeed) {
      return [];
    }
    const systems = gdacsFeed.indianSystems || [];
    if (dateFilterMode === 'active') {
      return systems.filter(s => s.isCurrent);
    }
    return systems;
  }, [gdacsFeed, dateFilterMode]);

  const indianSystems = displayedSystems;

  const [selectedCycloneId, setSelectedCycloneId] = useState<string>('');

  useEffect(() => {
    if (displayedSystems.length > 0) {
      if (!displayedSystems.some(s => s.id === selectedCycloneId)) {
        setSelectedCycloneId(displayedSystems[0].id);
      }
    } else {
      setSelectedCycloneId('');
    }
  }, [displayedSystems, selectedCycloneId]);

  // Cyclone Sub-Mode: 'live' or 'historical'
  const [cycloneViewMode, setCycloneViewMode] = useState<'live' | 'historical'>('live');
  const [selectedHistoricalCycloneId, setSelectedHistoricalCycloneId] = useState<string | null>(null);
  const [histYearFilter, setHistYearFilter] = useState<string>('all');
  const [histBasinFilter, setHistBasinFilter] = useState<string>('all');
  const [histSearchQuery, setHistSearchQuery] = useState<string>('');

  const [timelineHour, setTimelineHour] = useState<number>(0);
  const [isPlayingAnimation, setIsPlayingAnimation] = useState<boolean>(false);
  const [isSpeakingAlert, setIsSpeakingAlert] = useState<boolean>(false);
  
  // Separate map expand states for Weather Map and Cyclone Map
  const [isWeatherMapExpanded, setIsWeatherMapExpanded] = useState<boolean>(false);
  const [isCycloneMapExpanded, setIsCycloneMapExpanded] = useState<boolean>(false);

  // Selected State for Weather Map
  const [selectedStateName, setSelectedStateName] = useState<string>('Odisha');
  const [liveStatesData, setLiveStatesData] = useState<StateWeatherReportType[]>(INDIAN_STATES_WEATHER_DEFAULTS);
  const [showStateWeatherList, setShowStateWeatherList] = useState<boolean>(false);

  // Filter 10-Year Historical Cyclones
  const filteredHistoricalCyclones = useMemo(() => {
    const list = HISTORICAL_CYCLONES_10Y.filter((sys) => {
      if (histYearFilter !== 'all' && String(sys.year || '') !== histYearFilter) {
        return false;
      }
      if (histBasinFilter !== 'all' && !sys.basin.toLowerCase().includes(histBasinFilter.toLowerCase())) {
        return false;
      }
      if (histSearchQuery.trim()) {
        const query = histSearchQuery.toLowerCase();
        const matchesName = sys.name.toLowerCase().includes(query);
        const matchesState = sys.affectedStates.some((st) => st.toLowerCase().includes(query));
        const matchesLandfall = sys.landfall.locationName.toLowerCase().includes(query);
        const matchesBasin = sys.basin.toLowerCase().includes(query);
        if (!matchesName && !matchesState && !matchesLandfall && !matchesBasin) {
          return false;
        }
      }
      return true;
    });

    // Explicitly sort by date descending (latest / most recent first, oldest last: 2026/2024 down to 2016)
    return [...list].sort((a, b) => {
      const dateA = a.fromDate || `${a.year || 2016}-01-01`;
      const dateB = b.fromDate || `${b.year || 2016}-01-01`;
      return dateB.localeCompare(dateA);
    });
  }, [histYearFilter, histBasinFilter, histSearchQuery]);

  // Fetch live Open-Meteo weather for all state pins on mount
  const refreshLiveStates = async () => {
    try {
      const liveData = await fetchLiveAllStatesWeather();
      if (liveData && liveData.length > 0) {
        setLiveStatesData(liveData);
      }
    } catch (e) {
      console.warn('Error refreshing live states weather:', e);
    }
  };

  useEffect(() => {
    refreshLiveStates();
  }, []);

  const historicalCyclone = useMemo(() => {
    if (!selectedHistoricalCycloneId) return null;
    return HISTORICAL_CYCLONES_10Y.find(c => c.id === selectedHistoricalCycloneId) || null;
  }, [selectedHistoricalCycloneId]);

  const liveCyclone = displayedSystems.find(c => c.id === selectedCycloneId) || displayedSystems[0] || null;

  const cyclone: CycloneSystem | null = cycloneViewMode === 'historical' ? historicalCyclone : liveCyclone;

  // Current active forecast point based on timelineHour
  const activeForecastPoint: CycloneForecastPoint | null = cyclone 
    ? (cyclone.forecastTrack.find(p => p.hoursAhead === timelineHour) || cyclone.forecastTrack[0])
    : null;

  // Threat calculation for user
  const threat = cyclone 
    ? getCycloneThreatAssessment(currentGPS.latitude, currentGPS.longitude, cyclone)
    : null;

  // Nearest shelters
  const nearestShelters = getNearestShelters(currentGPS.latitude, currentGPS.longitude, 4);

  // Play animation through forecast hours
  useEffect(() => {
    let timer: any;
    if (isPlayingAnimation && cyclone) {
      const availableHours = cyclone.forecastTrack.map(p => p.hoursAhead);
      timer = setInterval(() => {
        setTimelineHour((prev) => {
          const currentIndex = availableHours.indexOf(prev);
          if (currentIndex === -1 || currentIndex === availableHours.length - 1) {
            return availableHours[0];
          }
          return availableHours[currentIndex + 1];
        });
      }, 2000);
    }
    return () => clearInterval(timer);
  }, [isPlayingAnimation, cyclone]);

  // Audio Speech synthesis for emergency broadcast
  const handleToggleVoiceBroadcast = () => {
    if (!cyclone) {
      showToast('No active cyclone detected in this sector');
      return;
    }

    if (!('speechSynthesis' in window)) {
      showToast('Speech synthesis not supported on this browser');
      return;
    }

    if (isSpeakingAlert) {
      window.speechSynthesis.cancel();
      setIsSpeakingAlert(false);
      return;
    }

    const text = generateWarningSpeechText(cyclone, currentGPS.latitude, currentGPS.longitude);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    utterance.onend = () => setIsSpeakingAlert(false);
    utterance.onerror = () => setIsSpeakingAlert(false);

    window.speechSynthesis.speak(utterance);
    setIsSpeakingAlert(true);
    showToast('🔊 Playing Meteorological Alert Broadcast');
  };

  const handleRouteToShelter = (lat: number, lng: number, name: string) => {
    calculateRoadRouteToDestination(lat, lng, name);
    setCurrentTab('resilient-navigation');
    showToast(`Navigating to Cyclone Shelter: ${name}`);
  };

  return (
    <div className="space-y-4 pb-12 animate-fadeIn">
      {/* Main Sub-Tab Switcher */}
      <div className="bg-white border border-slate-300 p-3 sm:p-3.5 shadow-sm rounded-2xl dark:bg-[#0f172a]/95 dark:border-white/[0.1] dark:shadow-2xl dark:backdrop-blur-xl">
        {/* Header Tabs Choice: 1) Weather Analysis, 2) Cyclone */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-300 dark:bg-[#080d16] dark:border-white/[0.08]">
          <button
            id="subtab-weather-choice"
            onClick={() => setActiveSubTab('weather')}
            className={`py-2.5 px-3 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'weather'
                ? 'bg-blue-600 text-white shadow-md border border-blue-500 font-black scale-102 dark:shadow-[0_0_15px_rgba(37,99,235,0.6)] dark:border-blue-400'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.04]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">device_thermostat</span>
            <span>1) Weather Analysis</span>
          </button>

          <button
            id="subtab-cyclone-choice"
            onClick={() => setActiveSubTab('cyclone')}
            className={`py-2.5 px-3 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'cyclone'
                ? indianSystems.length > 0
                  ? 'bg-red-600 text-white shadow-md border border-red-500 font-black scale-102 dark:shadow-[0_0_15px_rgba(239,68,68,0.6)] dark:border-red-400'
                  : 'bg-emerald-600 text-white shadow-md border border-emerald-500 font-black scale-102 dark:shadow-[0_0_15px_rgba(16,185,129,0.5)] dark:border-emerald-400'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.04]'
            }`}
          >
            <span className={`material-symbols-outlined text-[18px] ${indianSystems.length > 0 ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }}>
              cyclone
            </span>
            <span>2) Cyclones & Deep Depressions ({indianSystems.length})</span>
          </button>
        </div>
      </div>

      {/* SUB-SECTION 1: WEATHER REPORT */}
      {activeSubTab === 'weather' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Weather & Cloud Density Map Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-blue-400">
                <span className="material-symbols-outlined text-[20px]">map</span>
                <h3 className="text-sm font-bold font-display uppercase tracking-wide text-white">
                  Weather Analysis Map & State Observations
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                INSAT-3DR Convective Infrared Feed
              </span>
            </div>

            {/* Weather Map Canvas Component */}
            <WeatherMapCanvas
              statesData={liveStatesData}
              selectedStateName={selectedStateName}
              onSelectState={(st) => {
                setSelectedStateName(st);
                // Also open list if closed so user sees the selected state card
                setShowStateWeatherList(true);
              }}
              heightClass={isWeatherMapExpanded ? 'h-[620px]' : 'h-[440px] sm:h-[480px]'}
              isExpanded={isWeatherMapExpanded}
              onToggleExpand={() => setIsWeatherMapExpanded(!isWeatherMapExpanded)}
            />
          </div>

          {/* Dedicated Button Under Map for Viewing Statewise Weather List */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200 shadow-md dark:bg-[#0f172a]/95 dark:border-white/[0.1] dark:shadow-xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-600/20 dark:text-cyan-300 dark:border-blue-500/30 flex items-center justify-center font-bold shrink-0">
                <span className="material-symbols-outlined text-[22px]">view_list</span>
              </div>
              <div>
                <h4 className="text-sm font-bold font-display text-slate-900 dark:text-white tracking-wide uppercase">
                  STATE-WISE WEATHER LIST & BULLETIN
                </h4>
                <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  Comprehensive telemetry for all {liveStatesData.length} Indian States & Union Territories
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowStateWeatherList(prev => !prev)}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-lg ${
                showStateWeatherList
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-[#1e293b] dark:hover:bg-[#334155] dark:text-cyan-300 dark:border-cyan-500/40'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white border border-cyan-400/40 shadow-[0_0_16px_rgba(6,182,212,0.35)]'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {showStateWeatherList ? 'expand_less' : 'visibility'}
              </span>
              <span>{showStateWeatherList ? 'Hide State-wise Weather List' : 'View State-wise Weather List'}</span>
              <span className="px-2 py-0.5 rounded-md bg-black/40 text-[10px] border border-white/10 font-bold text-white">
                {liveStatesData.length} States
              </span>
            </button>
          </div>

          {/* Real-time State Weather Reports & Local GPS Weather Telemetry */}
          {showStateWeatherList && (
            <div className="animate-fadeIn space-y-4">
              <StateWeatherReportSection 
                statesData={liveStatesData}
                selectedStateName={selectedStateName}
                onSelectState={(st) => setSelectedStateName(st)}
                onRefreshData={refreshLiveStates}
              />
            </div>
          )}
        </div>
      )}

      {/* SUB-SECTION 2: CYCLONE & DEEP DEPRESSIONS */}
      {activeSubTab === 'cyclone' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Sub-Mode Switcher: Live Real-Time Radar vs Browse Historical Cyclone Tracks (10 Years) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-300 shadow-sm dark:bg-[#0f172a]/95 dark:border-white/[0.1] dark:shadow-2xl dark:backdrop-blur-xl">
            <button
              onClick={() => {
                setCycloneViewMode('live');
                setSelectedHistoricalCycloneId(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                cycloneViewMode === 'live'
                  ? 'bg-red-600 text-white shadow-md border border-red-700 scale-102 dark:shadow-[0_0_15px_rgba(239,68,68,0.5)] dark:border-red-400'
                  : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 dark:bg-[#182234] dark:text-slate-300 dark:hover:text-white dark:hover:bg-[#222f46]'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">satellite_alt</span>
              <span>1) Live real-time radar & active storms ({displayedSystems.length})</span>
            </button>

            <button
              onClick={() => {
                setCycloneViewMode('historical');
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                cycloneViewMode === 'historical'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md border border-amber-600 scale-102 dark:shadow-[0_0_15px_rgba(245,158,11,0.5)] dark:border-amber-400'
                  : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 dark:bg-[#182234] dark:text-slate-300 dark:hover:text-white dark:hover:bg-[#222f46]'
              }`}
            >
              <span className="material-symbols-outlined text-[18px] text-slate-700 dark:text-inherit">history</span>
              <span>2) Browse historical cyclone tracks (10 years: 2016 – 2026)</span>
            </button>
          </div>

          {/* HISTORICAL CYCLONE BROWSER MODE */}
          {cycloneViewMode === 'historical' && !selectedHistoricalCycloneId && (
            <div className="bg-white rounded-2xl border border-slate-300 p-4 shadow-sm dark:bg-[#0f172a]/95 dark:border-white/[0.1] dark:shadow-xl dark:backdrop-blur-xl space-y-4 animate-fadeIn">
              <div className="border-b border-slate-200 dark:border-white/[0.1] pb-3 space-y-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-700 dark:text-amber-400 text-[22px]">auto_stories</span>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      10-year historical cyclone tracks archive (2016 – 2026)
                    </h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 text-[11px] font-semibold">
                    {filteredHistoricalCyclones.length} records found
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Select any historical cyclone below to open its full satellite track map, telemetry, landfall spot, and shelter routes.
                </p>
              </div>

              {/* Filters Bar: Search, Year, Basin */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Search Input */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-slate-400">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search cyclone name, state, or location..."
                    value={histSearchQuery}
                    onChange={(e) => setHistSearchQuery(e.target.value)}
                    className="w-full bg-[#080d16] border border-white/15 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* Filter by Year */}
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-slate-400 shrink-0">Year:</label>
                  <select
                    value={histYearFilter}
                    onChange={(e) => setHistYearFilter(e.target.value)}
                    className="w-full bg-[#080d16] border border-white/15 rounded-xl px-2.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="all">All years (2016 - 2026)</option>
                    <option value="2026">2026 / 2024 (Recent)</option>
                    <option value="2023">2023</option>
                    <option value="2022">2022</option>
                    <option value="2021">2021</option>
                    <option value="2020">2020</option>
                    <option value="2019">2019</option>
                    <option value="2018">2018</option>
                    <option value="2017">2017</option>
                    <option value="2016">2016</option>
                  </select>
                </div>

                {/* Filter by Basin */}
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-slate-400 shrink-0">Basin:</label>
                  <select
                    value={histBasinFilter}
                    onChange={(e) => setHistBasinFilter(e.target.value)}
                    className="w-full bg-[#080d16] border border-white/15 rounded-xl px-2.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="all">All basins</option>
                    <option value="Bay of Bengal">Bay of Bengal</option>
                    <option value="Arabian Sea">Arabian Sea</option>
                  </select>
                </div>
              </div>

              {/* List of Historical Cyclones from Recent to Last 10 Years */}
              <div className="space-y-3 pt-1">
                {filteredHistoricalCyclones.length === 0 ? (
                  <div className="p-8 text-center bg-[#080d16] rounded-2xl border border-white/10 space-y-2">
                    <span className="material-symbols-outlined text-[32px] text-slate-500">search_off</span>
                    <p className="text-xs text-slate-300">No historical cyclones matched your search criteria.</p>
                    <button
                      onClick={() => {
                        setHistSearchQuery('');
                        setHistYearFilter('all');
                        setHistBasinFilter('all');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold cursor-pointer"
                    >
                      Clear search filters
                    </button>
                  </div>
                ) : (
                  filteredHistoricalCyclones.map((sys) => {
                    const isRed = sys.alertLevel.includes('Red');
                    const isOrange = sys.alertLevel.includes('Orange');

                    return (
                      <div
                        key={sys.id}
                        onClick={() => {
                          setSelectedHistoricalCycloneId(sys.id);
                          setTimelineHour(0);
                          setIsPlayingAnimation(false);
                          showToast(`Loaded details for ${sys.name}`);
                        }}
                        className="p-4 rounded-2xl bg-[#080d16] hover:bg-[#121927] border border-white/[0.08] hover:border-amber-500/50 transition-all cursor-pointer space-y-3 shadow-lg group active:scale-[0.99]"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold shrink-0 group-hover:scale-110 transition-transform">
                              <span className="material-symbols-outlined text-[22px]">cyclone</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">
                                  {sys.name}
                                </h4>
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  {sys.year || 'Archive'}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5">
                                {sys.fromDate} – {sys.toDate} • {sys.basin}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                              isRed ? 'bg-red-950/80 text-red-300 border-red-800' :
                              isOrange ? 'bg-amber-950/80 text-amber-300 border-amber-800' :
                              'bg-yellow-950/80 text-yellow-300 border-yellow-800'
                            }`}>
                              {sys.category}
                            </span>

                            <button className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1 transition-all shadow group-hover:scale-105 pointer-events-none">
                              <span>View details</span>
                              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed font-sans">
                          {sys.bulletinSummary}
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono pt-1">
                          <div className="bg-black/30 p-2 rounded-xl border border-white/[0.05]">
                            <span className="text-slate-400 block text-[10px]">Peak Wind Speed</span>
                            <span className="text-red-400 font-bold">{sys.maxSustainedWindKmph} km/h</span>
                          </div>

                          <div className="bg-black/30 p-2 rounded-xl border border-white/[0.05]">
                            <span className="text-slate-400 block text-[10px]">Barometric Pressure</span>
                            <span className="text-amber-300 font-bold">{sys.centralPressureHpa} hPa</span>
                          </div>

                          <div className="bg-black/30 p-2 rounded-xl border border-white/[0.05]">
                            <span className="text-slate-400 block text-[10px]">Storm Surge</span>
                            <span className="text-cyan-300 font-bold">{sys.landfall.expectedSurgeMeters} meters</span>
                          </div>

                          <div className="bg-black/30 p-2 rounded-xl border border-white/[0.05]">
                            <span className="text-slate-400 block text-[10px]">Landfall Spot</span>
                            <span className="text-white font-bold truncate block">{sys.landfall.locationName}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          <span className="text-[10px] font-mono text-slate-400 mr-1 font-bold">Affected States:</span>
                          {sys.affectedStates.map((st, idx) => (
                            <span key={idx} className="text-[10px] font-mono bg-white/[0.05] text-slate-300 px-2 py-0.5 rounded border border-white/[0.08]">
                              {st}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* HISTORICAL SPECIFIC CYCLONE SELECTED HEADER BAR */}
          {cycloneViewMode === 'historical' && selectedHistoricalCycloneId && historicalCyclone && (
            <div className="p-3.5 bg-[#0f172a]/95 rounded-2xl border border-amber-500/40 flex flex-wrap items-center justify-between gap-3 shadow-xl backdrop-blur-xl animate-fadeIn">
              <button
                onClick={() => setSelectedHistoricalCycloneId(null)}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                <span>← Back to Historical Cyclone List (2016 – 2026)</span>
              </button>

              <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Historical Archive
                </span>
                <span>{historicalCyclone.name} ({historicalCyclone.year || 'Archive'})</span>
              </div>
            </div>
          )}

          {/* GDACS Live Controls & Filter Bar (Shown only in Live mode) */}
          {cycloneViewMode === 'live' && (
            <div className="bg-white rounded-2xl border border-slate-300 p-3.5 shadow-sm dark:bg-[#0f172a]/95 dark:border-white/[0.1] dark:shadow-xl dark:backdrop-blur-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200 dark:border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 border border-red-300 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30 flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined text-[18px]">satellite_alt</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                        GDACS tropical cyclone feed (UN OCHA)
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 flex items-center gap-1 font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-ping"></span>
                        LIVE
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Global Disaster Alert and Coordination System (GDACS / UN OCHA)
                    </p>
                  </div>
                </div>

                {/* Action Buttons: Refresh & Date Range Toggle */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => loadGdacsCyclones(dateFilterMode === 'custom' ? customFromDate : undefined, dateFilterMode === 'custom' ? customToDate : undefined, true)}
                    disabled={isLoadingGdacs}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 dark:bg-[#182234] dark:hover:bg-[#222f46] dark:text-slate-200 dark:border-white/[0.1] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Reload Live GDACS Feed"
                  >
                    <span className={`material-symbols-outlined text-[15px] text-slate-700 dark:text-inherit ${isLoadingGdacs ? 'animate-spin' : ''}`}>
                      sync
                    </span>
                    <span>{isLoadingGdacs ? 'Syncing...' : 'Sync GDACS'}</span>
                  </button>

                  <button
                    onClick={() => setDateFilterMode(dateFilterMode === 'active' ? 'custom' : 'active')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border cursor-pointer ${
                      dateFilterMode === 'custom'
                        ? 'bg-amber-600 text-white border-amber-700 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/50'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300 dark:bg-[#182234] dark:hover:bg-[#222f46] dark:text-slate-300 dark:border-white/[0.1]'
                    }`}
                    title="Toggle Historical / Date-Range Query"
                  >
                    <span className="material-symbols-outlined text-[15px] text-slate-700 dark:text-inherit">date_range</span>
                    <span>{dateFilterMode === 'custom' ? 'Date filter active' : 'Date range'}</span>
                  </button>
                </div>
              </div>

              {/* Indian Maritime Basin Scope */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-slate-700 dark:text-slate-400 font-medium">Maritime basin:</span>
                  <div className="flex items-center px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-300 gap-2 text-xs font-medium text-slate-900 dark:bg-[#080d16] dark:border-white/[0.08] dark:text-white">
                    <span>🇮🇳 India (Bay of Bengal, Arabian Sea & Indian Ocean)</span>
                    <span className="px-1.5 py-0.2 rounded text-[11px] bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-600/30 dark:text-blue-300 dark:border-blue-500/30 font-semibold font-mono">
                      {displayedSystems.length} active
                    </span>
                  </div>
                </div>

                {gdacsFeed && (
                  <div className="text-[12px] text-slate-700 dark:text-slate-400 flex items-center gap-2">
                    <span>Last update: <strong className="text-cyan-800 dark:text-cyan-300 font-mono font-medium">{gdacsFeed.lastUpdated}</strong></span>
                    <span className="text-slate-300 dark:text-white/20">|</span>
                    <span className="text-amber-800 dark:text-amber-400 font-medium">{gdacsFeed.sourceCredit}</span>
                  </div>
                )}
              </div>

              {/* Systems Selection Strip */}
              <div>
                <div className="flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-300 mb-2">
                  <span>Active cyclonic systems near India ({displayedSystems.length}):</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-normal">
                    Select storm to view track & impact cones
                  </span>
                </div>

                {displayedSystems.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 text-center font-mono text-xs text-slate-700 dark:bg-[#080d16] dark:border-white/10 dark:text-slate-400">
                    <p>No active cyclonic storms or deep depressions detected across the Bay of Bengal, Arabian Sea, or Indian coastline.</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none">
                    {displayedSystems.map((sys) => {
                      const isSelected = sys.id === selectedCycloneId;
                      const isRed = sys.alertLevel.includes('Red');
                      const isOrange = sys.alertLevel.includes('Orange');
                      const isYellow = sys.alertLevel.includes('Yellow');

                      return (
                        <button
                          key={sys.id}
                          onClick={() => {
                            setSelectedCycloneId(sys.id);
                            setTimelineHour(0);
                            setIsPlayingAnimation(false);
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                            isSelected
                              ? 'bg-primary text-black shadow-[0_0_15px_rgba(255,122,26,0.6)] border border-primary font-black scale-102'
                              : 'bg-[#182234] hover:bg-[#222f46] text-slate-300 border border-white/[0.08]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            cyclone
                          </span>
                          <div className="text-left">
                            <div className="leading-tight">{sys.name}</div>
                            <div className="text-[9px] opacity-75 font-normal">
                              {sys.eventId ? `#${sys.eventId} • ` : ''}{sys.maxSustainedWindKmph} km/h
                            </div>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                            isRed ? 'bg-red-950 text-red-300 border border-red-800' :
                            isOrange ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                            isYellow ? 'bg-yellow-950 text-yellow-300 border border-yellow-800' :
                            'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {sys.alertLevel.split(' ')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cyclone Systems Details or All-Clear Nominal State */}
          {cyclone && activeForecastPoint && threat ? (
            <div className="space-y-4 animate-fadeIn">
              {/* Official GDACS Alert Banner */}
              <div className={`p-4 rounded-2xl border shadow-xl flex items-start gap-3 backdrop-blur-md transition-colors ${
                cyclone.alertLevel.includes('Red')
                  ? 'bg-red-950/80 border-red-500/70 text-red-100'
                  : cyclone.alertLevel.includes('Orange')
                  ? 'bg-amber-950/80 border-amber-500/70 text-amber-100'
                  : cyclone.alertLevel.includes('Yellow')
                  ? 'bg-yellow-950/80 border-yellow-500/70 text-yellow-100'
                  : 'bg-emerald-950/80 border-emerald-500/70 text-emerald-100'
              }`}>
            <span className="material-symbols-outlined text-[28px] mt-0.5 shrink-0 animate-bounce text-red-400">
              warning
            </span>
            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-1 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-black/40 border border-white/[0.1]">
                    GDACS BULLETIN (UN OCHA): {cyclone.alertLevel}
                  </span>
                  {cyclone.eventId && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 border border-white/10 text-white">
                      Event ID: #{cyclone.eventId}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-300">
                  <span>{cyclone.satelliteObservationTime}</span>
                  {cyclone.reportUrl && (
                    <a
                      href={cyclone.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-300 hover:underline flex items-center gap-0.5 font-bold"
                    >
                      Official Report ↗
                    </a>
                  )}
                </div>
              </div>

              <p className="text-xs sm:text-sm font-medium leading-relaxed font-sans">
                {cyclone.bulletinSummary}
              </p>

              {/* Storm Telemetry Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
                <div className="bg-black/30 p-2 rounded-lg border border-white/10">
                  <div className="text-[10px] text-slate-400">Position / Basin:</div>
                  <div className="font-bold text-white truncate">
                    {cyclone.currentPosition.latitude.toFixed(2)}°N, {cyclone.currentPosition.longitude.toFixed(2)}°E
                  </div>
                  <div className="text-[10px] text-cyan-300 truncate">{cyclone.basin}</div>
                </div>

                <div className="bg-black/30 p-2 rounded-lg border border-white/10">
                  <div className="text-[10px] text-slate-400">Max Sustained Winds:</div>
                  <div className="font-bold text-red-400">
                    {cyclone.maxSustainedWindKmph} km/h
                  </div>
                  <div className="text-[10px] text-slate-300">Gusts: {cyclone.peakGustsKmph} km/h</div>
                </div>

                <div className="bg-black/30 p-2 rounded-lg border border-white/10">
                  <div className="text-[10px] text-slate-400">Affected Countries / Region:</div>
                  <div className="font-bold text-amber-300 truncate">
                    {cyclone.affectedCountries?.slice(0, 3).join(', ') || cyclone.affectedStates.join(', ')}
                  </div>
                  <div className="text-[10px] text-slate-300 truncate">Category: {cyclone.category}</div>
                </div>

                <div className="bg-black/30 p-2 rounded-lg border border-white/10">
                  <div className="text-[10px] text-slate-400">Active Period:</div>
                  <div className="font-bold text-emerald-300 text-[11px] truncate">
                    {cyclone.fromDate ? cyclone.fromDate.slice(0, 10) : 'Active'} to {cyclone.toDate ? cyclone.toDate.slice(0, 10) : 'Current'}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">Source: {cyclone.source || 'GDACS (UN OCHA)'}</div>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between text-[11px] font-mono text-slate-300">
                <span>Predicted Landfall / Coastal Threat: <strong className="text-white">{cyclone.landfall.locationName}</strong></span>
                <span className="text-amber-400 font-semibold">Cyclone data: GDACS (UN OCHA)</span>
              </div>
            </div>
          </div>

          {/* Dedicated Cyclone Map Canvas */}
          <div className="space-y-2">
            <CycloneMapCanvas
              cyclone={cyclone}
              selectedHour={timelineHour}
              onSelectForecastPoint={(pt) => setTimelineHour(pt.hoursAhead)}
              heightClass={isCycloneMapExpanded ? 'h-[620px]' : 'h-[440px] sm:h-[480px]'}
              isExpanded={isCycloneMapExpanded}
              onToggleExpand={() => setIsCycloneMapExpanded(!isCycloneMapExpanded)}
            />

            {/* Predictive Timeline Scrubber */}
            <div className="bg-[#0f172a]/95 rounded-2xl border border-white/[0.1] p-3 shadow-xl backdrop-blur-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlayingAnimation(!isPlayingAnimation)}
                    className="w-8 h-8 rounded-lg bg-primary text-black flex items-center justify-center font-bold active:scale-95 transition-all cursor-pointer shadow-md"
                    title={isPlayingAnimation ? "Pause Timeline Animation" : "Play Forecast Animation"}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isPlayingAnimation ? 'pause' : 'play_arrow'}
                    </span>
                  </button>
                  <span className="text-xs font-mono font-bold text-white uppercase">
                    Forecast Time Projection:
                  </span>
                </div>

                <div className="flex items-center gap-1 text-xs font-mono">
                  <span className="text-slate-400">Selected:</span>
                  <span className="px-2 py-0.5 rounded bg-red-600/30 text-red-300 border border-red-500 font-bold">
                    {timelineHour === 0 ? 'Current (0h)' : `+${timelineHour} Hours Ahead`}
                  </span>
                </div>
              </div>

              {/* Timeline Buttons */}
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {cyclone.forecastTrack.map((pt) => {
                  const isSelected = pt.hoursAhead === timelineHour;
                  return (
                    <button
                      key={pt.hoursAhead}
                      onClick={() => {
                        setTimelineHour(pt.hoursAhead);
                        setIsPlayingAnimation(false);
                      }}
                      className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-red-600 text-white border-white ring-2 ring-red-500/50 shadow-lg scale-102'
                          : 'bg-[#182234] hover:bg-[#24334c] text-slate-300 border-white/[0.08]'
                      }`}
                    >
                      <div className="text-[11px] font-mono font-bold leading-tight">
                        {pt.hoursAhead === 0 ? 'LIVE NOW' : `+${pt.hoursAhead}h`}
                      </div>
                      <div className="text-[9px] font-mono text-slate-300 truncate mt-0.5">
                        {pt.sustainedWindKmph} km/h
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Key Metrics Dual Cards (Cyclone Eye & Landfall Spot) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {/* Card 1: LIVE LOCATION OF CYCLONE EYE / CENTER */}
            <div className="bg-[#0f172a]/95 rounded-2xl border border-red-500/40 p-4 shadow-xl backdrop-blur-xl relative overflow-hidden">
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-red-600/10 rounded-full blur-xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-white/[0.1] pb-2 mb-3">
                <div className="flex items-center gap-2 text-red-400">
                  <span className="material-symbols-outlined text-[20px] animate-spin" style={{ animationDuration: '4s' }}>
                    cyclone
                  </span>
                  <h3 className="text-sm font-bold font-display uppercase tracking-wide">
                    Live Location of Cyclone Eye / Core
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-mono font-black animate-pulse">
                  CENTER EYE
                </span>
              </div>

              <div className="space-y-2.5 text-xs font-mono">
                <div className="bg-[#080d16] p-2.5 rounded-xl border border-white/[0.06] flex items-center justify-between">
                  <span className="text-slate-400">Eye Coordinates:</span>
                  <span className="text-primary font-bold text-sm">
                    {activeForecastPoint.latitude.toFixed(4)}°N, {activeForecastPoint.longitude.toFixed(4)}°E
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#080d16] p-2 rounded-xl border border-white/[0.06]">
                    <div className="text-[10px] text-slate-400">Central Pressure</div>
                    <div className="text-amber-300 font-bold text-sm mt-0.5">
                      {activeForecastPoint.centralPressureHpa} hPa
                    </div>
                    <div className="text-[9px] text-slate-500">Barometric Core</div>
                  </div>

                  <div className="bg-[#080d16] p-2 rounded-xl border border-white/[0.06]">
                    <div className="text-[10px] text-slate-400">Eye Diameter</div>
                    <div className="text-white font-bold text-sm mt-0.5">
                      {cyclone.eyeDiameterKm > 0 ? `${cyclone.eyeDiameterKm} km` : 'Dispersed'}
                    </div>
                    <div className="text-[9px] text-slate-500">Calm Vortex Radius</div>
                  </div>

                  <div className="bg-[#080d16] p-2 rounded-xl border border-white/[0.06]">
                    <div className="text-[10px] text-slate-400">Max Sustained Wind</div>
                    <div className="text-red-400 font-bold text-sm mt-0.5">
                      {activeForecastPoint.sustainedWindKmph} km/h
                    </div>
                    <div className="text-[9px] text-slate-500">Gusts: {activeForecastPoint.gustsKmph} km/h</div>
                  </div>

                  <div className="bg-[#080d16] p-2 rounded-xl border border-white/[0.06]">
                    <div className="text-[10px] text-slate-400">Forward Movement</div>
                    <div className="text-secondary font-bold text-sm mt-0.5">
                      {cyclone.movementSpeedKmph} km/h
                    </div>
                    <div className="text-[9px] text-slate-400">{cyclone.movementDirection}</div>
                  </div>
                </div>

                <div className="bg-[#080d16] p-2 rounded-xl border border-white/[0.06] flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Gale Wind Radius (64+ km/h):</span>
                  <span className="text-white font-bold">{activeForecastPoint.galeRadiusKm} km</span>
                </div>
              </div>
            </div>

            {/* Card 2: PREDICTED LANDFALL SPOT */}
            <div className="bg-[#0f172a]/95 rounded-2xl border border-amber-500/40 p-4 shadow-xl backdrop-blur-xl relative overflow-hidden">
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-white/[0.1] pb-2 mb-3">
                <div className="flex items-center gap-2 text-amber-400">
                  <span className="material-symbols-outlined text-[20px]">target</span>
                  <h3 className="text-sm font-bold font-display uppercase tracking-wide">
                    Predicted Landfall Spot
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/30 border border-amber-400 text-amber-300 text-[10px] font-mono font-bold">
                  COASTAL IMPACT
                </span>
              </div>

              <div className="space-y-2.5 text-xs font-mono">
                {cyclone.landfall.isLandfallExpected ? (
                  <>
                    <div className="bg-[#080d16] p-2.5 rounded-xl border border-white/[0.06]">
                      <div className="text-[10px] text-slate-400">Predicted Coastline Crossing:</div>
                      <div className="text-white font-bold text-sm mt-0.5">
                        {cyclone.landfall.locationName}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[#080d16] p-2 rounded-xl border border-white/[0.06]">
                        <div className="text-[10px] text-slate-400">Landfall Target Lat/Lng</div>
                        <div className="text-primary font-bold text-xs mt-0.5">
                          {cyclone.landfall.latitude.toFixed(4)}°N, {cyclone.landfall.longitude.toFixed(4)}°E
                        </div>
                      </div>

                      <div className="bg-[#080d16] p-2 rounded-xl border border-white/[0.06]">
                        <div className="text-[10px] text-slate-400">ETA Landfall</div>
                        <div className="text-amber-300 font-bold text-xs mt-0.5">
                          {cyclone.landfall.estimatedTime}
                        </div>
                        <div className="text-[9px] text-red-400 font-bold">
                          ~{cyclone.landfall.hoursRemaining} Hours Remaining
                        </div>
                      </div>

                      <div className="bg-[#080d16] p-2 rounded-xl border border-white/[0.06]">
                        <div className="text-[10px] text-slate-400">Tidal Storm Surge</div>
                        <div className="text-blue-400 font-bold text-sm mt-0.5">
                          {cyclone.landfall.expectedSurgeMeters} Meters
                        </div>
                        <div className="text-[9px] text-slate-400">Above Astronomical Tide</div>
                      </div>

                      <div className="bg-[#080d16] p-2 rounded-xl border border-white/[0.06]">
                        <div className="text-[10px] text-slate-400">Threatened Corridors</div>
                        <div className="text-white font-bold text-xs mt-0.5">
                          NH-16 / SH-9A
                        </div>
                        <div className="text-[9px] text-red-400">Crosswinds & Inundation</div>
                      </div>
                    </div>

                    <div className="bg-amber-950/60 p-2.5 rounded-xl border border-amber-600/40 text-[11px] text-amber-200">
                      ⚠️ Complete evacuation ordered within coastal belt. Travelers and road traffic advised to avoid the impact zone.
                    </div>
                  </>
                ) : (
                  <div className="p-4 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[32px] text-slate-500 mb-1">
                      sailing
                    </span>
                    <p>The system is currently tracking across open waters away from coastal landfall.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Live Distance from Help Seeker / User Location */}
          <div className="bg-[#0f172a]/95 rounded-2xl border border-white/[0.1] p-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/[0.1] pb-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">near_me</span>
                <h3 className="text-sm font-bold font-display uppercase tracking-wide text-white">
                  Your Position vs Storm Hazard Radius
                </h3>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                threat.threatLevel === 'DIRECT_IMPACT' ? 'bg-red-600 text-white' :
                threat.threatLevel === 'GALE_ZONE' ? 'bg-amber-500 text-black' :
                threat.threatLevel === 'PERIPHERAL_WARNING' ? 'bg-yellow-400 text-black' :
                'bg-emerald-600 text-white'
              }`}>
                {threat.threatLevel.replace('_', ' ')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[#080d16] p-3 rounded-xl border border-white/[0.06] text-center flex flex-col justify-center">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Distance to Eye / Center</div>
                <div className="text-2xl font-black font-mono text-primary mt-1">
                  {threat.distanceKm} km
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Direct Air Vector</div>
              </div>

              <div className="sm:col-span-2 bg-[#080d16] p-3 rounded-xl border border-white/[0.06] flex flex-col justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono mb-1">Safety & Travel Advisory:</div>
                  <p className="text-xs text-slate-200 font-medium leading-relaxed">
                    {threat.advisory}
                  </p>
                </div>
                <div className="mt-2 text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-secondary" />
                  <span>Current GPS: {currentGPS.latitude.toFixed(5)}°N, {currentGPS.longitude.toFixed(5)}°E</span>
                </div>
              </div>
            </div>
          </div>

          {/* Official Port Warning Signals */}
          <div className="bg-[#0f172a]/95 rounded-2xl border border-white/[0.1] p-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-center gap-2 text-white border-b border-white/[0.1] pb-2 mb-3">
              <span className="material-symbols-outlined text-[20px] text-amber-400">anchor</span>
              <h3 className="text-sm font-bold font-display uppercase tracking-wide">
                Maritime Port Danger Signals Hoisted (IMD / Coast Guard)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PORT_WARNING_SIGNALS.map((port) => (
                <div key={port.id} className="bg-[#080d16] p-3 rounded-xl border border-white/[0.06] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">{port.portName} ({port.state})</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      port.dangerLevel === 'CRITICAL' ? 'bg-red-950 text-red-300 border border-red-800' :
                      port.dangerLevel === 'HIGH' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                      'bg-yellow-950 text-yellow-300 border border-yellow-800'
                    }`}>
                      {port.signalTitle}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    {port.bulletinDetails}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Designated Cyclone Relief Shelters */}
          <div className="bg-[#0f172a]/95 rounded-2xl border border-white/[0.1] p-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/[0.1] pb-2 mb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <span className="material-symbols-outlined text-[20px]">night_shelter</span>
                <h3 className="text-sm font-bold font-display uppercase tracking-wide">
                  Designated Multipurpose Cyclone Shelters
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Reinforced Evacuation Camps
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {nearestShelters.map((shelter) => (
                <div key={shelter.id} className="bg-[#080d16] p-3 rounded-xl border border-emerald-500/30 space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-bold text-white text-xs">{shelter.name}</h4>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded shrink-0">
                        {shelter.distanceKm} km away
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      {shelter.sector}, {shelter.district}, {shelter.state}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {shelter.facilities.slice(0, 3).map((f, i) => (
                        <span key={i} className="text-[9px] font-mono bg-white/[0.05] text-slate-300 px-1.5 py-0.5 rounded border border-white/[0.05]">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-[11px] font-mono">
                    <a
                      href={`tel:${shelter.contactNumber}`}
                      className="text-primary hover:underline flex items-center gap-1 font-bold"
                    >
                      <span className="material-symbols-outlined text-[14px]">call</span>
                      <span>{shelter.contactNumber}</span>
                    </a>

                    <button
                      onClick={() => handleRouteToShelter(shelter.latitude, shelter.longitude, shelter.name)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow cursor-pointer active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[13px]">directions</span>
                      <span>Navigate</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Reassuring Nominal State - Zero Active Cyclones */
        <div className="p-6 sm:p-8 rounded-2xl bg-emerald-50 border border-emerald-300 shadow-md text-center space-y-4 animate-fadeIn dark:bg-[#081324]/95 dark:border-emerald-500/40 dark:shadow-2xl dark:backdrop-blur-xl">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center mx-auto shadow-sm dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/40 dark:shadow-[0_0_30px_rgba(16,185,129,0.3)]">
            <span className="material-symbols-outlined text-[36px]">
              verified_user
            </span>
          </div>

          <div className="space-y-1.5 max-w-lg mx-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
              ALL SECTORS NOMINAL
            </span>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              No active cyclones or depressions in Indian seas
            </h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              Real-time satellite monitoring reports zero active cyclonic storms or deep depressions threatening the Bay of Bengal, Arabian Sea, or Indian coastline. All operational routes, highways, and coastal regions are currently clear of tropical storm hazard warnings.
            </p>
          </div>

          {/* Attribution and Status Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-cyan-50 border border-cyan-300 text-cyan-800 font-medium dark:bg-black/40 dark:border-white/10 dark:text-cyan-300">
              🛰️ Live sync: <span className="font-mono">{gdacsFeed?.lastUpdated || 'Active'}</span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 font-medium dark:bg-black/40 dark:border-white/10 dark:text-amber-400">
              Cyclone data: UN OCHA GDACS
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 font-medium dark:bg-black/40 dark:border-white/10 dark:text-emerald-400">
              Indian basin status: Nominal
            </span>
          </div>

          {/* Helpful Quick Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">

            <button
              onClick={() => {
                setCycloneViewMode('historical');
                setSelectedHistoricalCycloneId(null);
              }}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:text-amber-300 dark:border-amber-500/40"
            >
              <span className="material-symbols-outlined text-[16px] text-slate-700 dark:text-inherit">history</span>
              <span>Browse historical cyclone tracks (10 years: 2016 – 2026)</span>
            </button>

            <button
              onClick={() => setActiveSubTab('weather')}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm dark:bg-blue-600/20 dark:hover:bg-blue-600/30 dark:text-blue-300 dark:border-blue-500/40"
            >
              <span className="material-symbols-outlined text-[16px] text-slate-700 dark:text-inherit">cloud</span>
              <span>Check state weather & satellite radar</span>
            </button>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};
