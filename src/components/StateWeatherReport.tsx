import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  INDIAN_STATES_WEATHER_DEFAULTS, 
  StateWeatherReport as StateWeatherReportType,
  fetchLiveCoordinateWeather,
  fetchLiveAllStatesWeather
} from '../services/cyclone-tracker.service';

const ZONES: Record<string, string[]> = {
  'North': ['Delhi-NCR', 'Uttar Pradesh', 'Punjab', 'Haryana', 'Rajasthan', 'Himachal Pradesh', 'Uttarakhand', 'Jammu & Kashmir', 'Ladakh', 'Chandigarh'],
  'West': ['Maharashtra', 'Gujarat', 'Goa', 'Dadra & Nagar Haveli and Daman & Diu'],
  'Central': ['Madhya Pradesh', 'Chhattisgarh'],
  'East': ['West Bengal', 'Odisha', 'Bihar', 'Jharkhand'],
  'South': ['Andhra Pradesh', 'Karnataka', 'Tamil Nadu', 'Telangana', 'Kerala', 'Puducherry', 'Lakshadweep', 'Andaman & Nicobar'],
  'North-East': ['Assam', 'Meghalaya', 'Arunachal Pradesh', 'Manipur', 'Nagaland', 'Tripura', 'Mizoram', 'Sikkim']
};

interface StateWeatherReportSectionProps {
  statesData?: StateWeatherReportType[];
  selectedStateName?: string;
  onSelectState?: (stateName: string) => void;
  onRefreshData?: () => Promise<void>;
}

export const StateWeatherReportSection: React.FC<StateWeatherReportSectionProps> = ({
  statesData: externalStatesData,
  selectedStateName: externalSelectedStateName,
  onSelectState: externalOnSelectState,
  onRefreshData: externalOnRefreshData
}) => {
  const { currentGPS, showToast } = useApp();
  
  // Internal state fallback if props not provided
  const [internalReports, setInternalReports] = useState<StateWeatherReportType[]>(INDIAN_STATES_WEATHER_DEFAULTS);
  const [internalSelectedName, setInternalSelectedName] = useState<string>('Delhi-NCR');
  
  const reports = externalStatesData && externalStatesData.length > 0 ? externalStatesData : internalReports;
  const selectedStateName = externalSelectedStateName || internalSelectedName;
  
  const handleSelectState = (name: string) => {
    setInternalSelectedName(name);
    if (externalOnSelectState) {
      externalOnSelectState(name);
    }
  };

  const [isFetchingLocal, setIsFetchingLocal] = useState<boolean>(false);
  const [localReport, setLocalReport] = useState<Partial<StateWeatherReportType> | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeZone, setActiveZone] = useState<string>('All');
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  
  // View mode: 'grid' (All 36 states visible together), 'table' (sortable matrix), 'focus' (deep inspection)
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'focus'>('grid');
  const [sortField, setSortField] = useState<'temp' | 'cloud' | 'rain' | 'wind' | 'name'>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const selectedState = useMemo(() => {
    return reports.find(r => r.stateName.toLowerCase() === selectedStateName.toLowerCase()) || reports[0];
  }, [reports, selectedStateName]);

  // Load and refresh live Open-Meteo weather for ALL 36 states
  const refreshAllStatesWeather = async () => {
    setIsSyncingAll(true);
    try {
      if (externalOnRefreshData) {
        await externalOnRefreshData();
      } else {
        const liveReports = await fetchLiveAllStatesWeather();
        if (liveReports && liveReports.length > 0) {
          setInternalReports(liveReports);
        }
      }
      showToast('✅ Real-time telemetry synchronized across all 36 Indian states & UTs!');
    } catch (err) {
      console.warn('Failed to refresh state weather:', err);
    } finally {
      setIsSyncingAll(false);
    }
  };

  useEffect(() => {
    if (!externalStatesData) {
      refreshAllStatesWeather();
    }
  }, []);

  // Fetch real-time weather for user's GPS coordinates
  const handleFetchLocalGPSWeather = async () => {
    setIsFetchingLocal(true);
    showToast('📡 Connecting to Live Weather Telemetry...');
    try {
      const data = await fetchLiveCoordinateWeather(currentGPS.latitude, currentGPS.longitude);
      if (data) {
        setLocalReport(data);
        showToast('✅ Live weather report synchronized for current GPS fix!');
      } else {
        showToast('Unable to fetch live weather telemetry for this coordinate');
      }
    } catch {
      showToast('Error connecting to weather service');
    } finally {
      setIsFetchingLocal(false);
    }
  };

  useEffect(() => {
    handleFetchLocalGPSWeather();
  }, [currentGPS.latitude, currentGPS.longitude]);

  // National Summary Statistics across all 36 states
  const nationalStats = useMemo(() => {
    if (reports.length === 0) return null;
    const avgTemp = (reports.reduce((sum, r) => sum + r.tempC, 0) / reports.length).toFixed(1);
    const avgCloud = Math.round(reports.reduce((sum, r) => sum + r.cloudCoverPercent, 0) / reports.length);
    
    const sortedByTemp = [...reports].sort((a, b) => b.tempC - a.tempC);
    const hottest = sortedByTemp[0];
    const coolest = sortedByTemp[sortedByTemp.length - 1];

    const sortedByCloud = [...reports].sort((a, b) => b.cloudCoverPercent - a.cloudCoverPercent);
    const cloudiest = sortedByCloud[0];

    const sortedByRain = [...reports].sort((a, b) => b.rainfallMmHr - a.rainfallMmHr);
    const rainiest = sortedByRain[0];

    const alertsCount = reports.filter(r => r.alertLevel !== 'Green').length;

    return { avgTemp, avgCloud, hottest, coolest, cloudiest, rainiest, alertsCount };
  }, [reports]);

  // Filtered & Sorted state list
  const processedReports = useMemo(() => {
    const filtered = reports.filter((st) => {
      const matchesSearch = 
        st.stateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        st.capital.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;
      if (activeZone === 'All') return true;

      const zoneStates = ZONES[activeZone] || [];
      return zoneStates.includes(st.stateName);
    });

    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') comparison = a.stateName.localeCompare(b.stateName);
      else if (sortField === 'temp') comparison = a.tempC - b.tempC;
      else if (sortField === 'cloud') comparison = a.cloudCoverPercent - b.cloudCoverPercent;
      else if (sortField === 'rain') comparison = a.rainfallMmHr - b.rainfallMmHr;
      else if (sortField === 'wind') comparison = a.windSpeedKmph - b.windSpeedKmph;
      return sortAsc ? comparison : -comparison;
    });
  }, [reports, searchTerm, activeZone, sortField, sortAsc]);

  // Cloud cover badge styling helper
  const getCloudDetails = (cloudPct: number) => {
    if (cloudPct >= 80) return { icon: 'cloud', text: 'Heavy Overcast', color: 'text-slate-200', bg: 'bg-slate-600', ring: 'ring-slate-400' };
    if (cloudPct >= 50) return { icon: 'partly_cloudy_day', text: 'Broken Clouds', color: 'text-cyan-300', bg: 'bg-cyan-600', ring: 'ring-cyan-400' };
    if (cloudPct >= 25) return { icon: 'wb_cloudy', text: 'Scattered Clouds', color: 'text-blue-300', bg: 'bg-blue-500', ring: 'ring-blue-400' };
    return { icon: 'wb_sunny', text: 'Clear & Fair Sky', color: 'text-amber-300', bg: 'bg-amber-500', ring: 'ring-amber-400' };
  };

  const cloudDetails = getCloudDetails(selectedState.cloudCoverPercent);

  // Find zone for any state name
  const getStateZone = (name: string): string => {
    for (const [zone, states] of Object.entries(ZONES)) {
      if (states.includes(name)) return zone;
    }
    return 'General';
  };

  return (
    <div className="bg-[#0f172a]/95 rounded-2xl border border-white/[0.1] p-4 shadow-xl backdrop-blur-xl space-y-4">
      {/* Header with National Live Telemetry Beacon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-white/[0.1] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/40 flex items-center justify-center font-bold shrink-0">
            <span className="material-symbols-outlined text-[22px]">thermostat</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-semibold text-white">
                All-India real-time state weather bulletin
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live • {reports.length} states & UTs
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live temperature, real-time cloud cover, rainfall & surface wind telemetry across all states
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
          <button
            onClick={refreshAllStatesWeather}
            disabled={isSyncingAll}
            className="px-3 py-1.5 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-cyan-300 text-xs font-semibold flex items-center gap-1.5 border border-cyan-500/30 cursor-pointer disabled:opacity-50 transition-all active:scale-95"
            title="Reload live weather telemetry for all states"
          >
            <span className={`material-symbols-outlined text-[15px] ${isSyncingAll ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>{isSyncingAll ? 'Syncing all 36...' : 'Sync all states'}</span>
          </button>

          <button
            onClick={handleFetchLocalGPSWeather}
            disabled={isFetchingLocal}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow cursor-pointer disabled:opacity-50"
            title="Fetch live weather telemetry for your current GPS fix"
          >
            <span className={`material-symbols-outlined text-[15px] ${isFetchingLocal ? 'animate-spin' : ''}`}>
              my_location
            </span>
            <span>{isFetchingLocal ? 'Locating...' : 'My fix weather'}</span>
          </button>
        </div>
      </div>

      {/* National Weather Snapshot Summary Ribbon */}
      {nationalStats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div className="bg-[#080d16] p-2.5 rounded-xl border border-white/[0.08]">
            <span className="text-xs text-slate-400 block font-medium">National avg temp</span>
            <span className="text-amber-300 font-mono font-medium text-base mt-0.5 block">{nationalStats.avgTemp}°C</span>
            <span className="text-[11px] text-slate-400">All 36 states & UTs</span>
          </div>

          <div className="bg-[#080d16] p-2.5 rounded-xl border border-white/[0.08]">
            <span className="text-xs text-slate-400 block font-medium">Hottest state</span>
            <span className="text-red-400 font-medium text-sm mt-0.5 block truncate">
              {nationalStats.hottest?.stateName} (<span className="font-mono">{nationalStats.hottest?.tempC}°C</span>)
            </span>
            <span className="text-[11px] text-slate-400">{nationalStats.hottest?.conditionText}</span>
          </div>

          <div className="bg-[#080d16] p-2.5 rounded-xl border border-white/[0.08]">
            <span className="text-xs text-slate-400 block font-medium">Coolest state</span>
            <span className="text-cyan-300 font-medium text-sm mt-0.5 block truncate">
              {nationalStats.coolest?.stateName} (<span className="font-mono">{nationalStats.coolest?.tempC}°C</span>)
            </span>
            <span className="text-[11px] text-slate-400">{nationalStats.coolest?.conditionText}</span>
          </div>

          <div className="bg-[#080d16] p-2.5 rounded-xl border border-white/[0.08]">
            <span className="text-xs text-slate-400 block font-medium">Cloudiest region</span>
            <span className="text-blue-300 font-medium text-sm mt-0.5 block truncate">
              {nationalStats.cloudiest?.stateName} (<span className="font-mono">{nationalStats.cloudiest?.cloudCoverPercent}%</span>)
            </span>
            <span className="text-[11px] text-slate-400">Avg cover: <span className="font-mono">{nationalStats.avgCloud}%</span></span>
          </div>

          <div className="bg-[#080d16] p-2.5 rounded-xl border border-white/[0.08] col-span-2 sm:col-span-1">
            <span className="text-xs text-slate-400 block font-medium">Precipitation active</span>
            <span className="text-emerald-400 font-medium text-sm mt-0.5 block truncate">
              {nationalStats.rainiest?.rainfallMmHr > 0 
                ? `${nationalStats.rainiest?.stateName} (${nationalStats.rainiest?.rainfallMmHr} mm)`
                : 'National fair skies'}
            </span>
            <span className="text-[11px] text-slate-400">{nationalStats.alertsCount} alert(s) active</span>
          </div>
        </div>
      )}

      {/* Driver's Current Fix Weather Telemetry Widget */}
      {localReport && (
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-950/60 via-[#111c2e] to-[#0c121e] border border-blue-500/40 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-semibold text-blue-300">
                Your live location weather fix
              </span>
            </div>
            <span className="text-xs text-slate-400">
              GPS: <span className="font-mono">{currentGPS.latitude.toFixed(4)}°N, {currentGPS.longitude.toFixed(4)}°E</span>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-[#080d16]/80 p-2 rounded-lg border border-white/[0.06]">
              <div className="text-xs text-slate-400">1. Temperature</div>
              <div className="text-amber-300 font-mono font-medium text-base mt-0.5">{localReport.tempC}°C</div>
              <div className="text-[11px] text-slate-400">{localReport.conditionText}</div>
            </div>

            <div className="bg-[#080d16]/80 p-2 rounded-lg border border-white/[0.06]">
              <div className="text-xs text-slate-400">2. Cloud Cover</div>
              <div className="text-cyan-300 font-mono font-medium text-base mt-0.5">{localReport.cloudCoverPercent}%</div>
              <div className="text-[11px] text-slate-400">{localReport.cloudCoverPercent! > 50 ? 'Cloudy Deck' : 'Fair / Clear'}</div>
            </div>

            <div className="bg-[#080d16]/80 p-2 rounded-lg border border-white/[0.06]">
              <div className="text-xs text-slate-400">3. Rainfall Rate</div>
              <div className="text-blue-400 font-mono font-medium text-base mt-0.5">{localReport.rainfallMmHr} mm/h</div>
              <div className="text-[11px] text-slate-400">{localReport.rainfallMmHr! > 10 ? 'Heavy Precipitation' : 'Nominal / Light'}</div>
            </div>

            <div className="bg-[#080d16]/80 p-2 rounded-lg border border-white/[0.06]">
              <div className="text-xs text-slate-400">4. Wind & Baro</div>
              <div className="text-white font-mono font-medium text-base mt-0.5">{localReport.windSpeedKmph} km/h</div>
              <div className="text-[11px] text-slate-400">{localReport.windDirection} • <span className="font-mono">{localReport.pressureHpa} hPa</span></div>
            </div>
          </div>
        </div>
      )}

      {/* View Mode Chooser & Filter Controls Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* View Mode Switcher: Grid, Table, Single Focus */}
          <div className="flex items-center gap-1 bg-[#080d16] p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">grid_view</span>
              <span>All 36 states grid</span>
            </button>

            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">table_rows</span>
              <span>Data matrix table</span>
            </button>

            <button
              onClick={() => setViewMode('focus')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'focus'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">search</span>
              <span>Single state focus ({selectedState.stateName})</span>
            </button>
          </div>

          {/* Search Box & Sort selector */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-56">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-slate-400">
                search
              </span>
              <input
                type="text"
                placeholder="Search state or capital..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#080d16] border border-white/15 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 font-medium focus:outline-none focus:border-blue-400"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Sort Dropdown */}
            <select
              value={`${sortField}-${sortAsc ? 'asc' : 'desc'}`}
              onChange={(e) => {
                const [f, ord] = e.target.value.split('-');
                setSortField(f as any);
                setSortAsc(ord === 'asc');
              }}
              className="bg-[#080d16] border border-white/15 text-slate-300 text-xs font-medium py-1.5 px-2.5 rounded-xl cursor-pointer focus:outline-none"
            >
              <option value="name-asc">Sort: Name (A-Z)</option>
              <option value="temp-desc">Sort: Highest temp</option>
              <option value="temp-asc">Sort: Lowest temp</option>
              <option value="cloud-desc">Sort: Cloudiest</option>
              <option value="rain-desc">Sort: Rainiest first</option>
              <option value="wind-desc">Sort: Windiest first</option>
            </select>
          </div>
        </div>

        {/* Geographic Zone Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-xs font-medium">
          {['All', 'North', 'West', 'Central', 'East', 'South', 'North-East'].map((zone) => {
            const count = zone === 'All' ? reports.length : (ZONES[zone]?.length || 0);
            return (
              <button
                key={zone}
                onClick={() => setActiveZone(zone)}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  activeZone === zone
                    ? 'bg-blue-600 text-white font-semibold shadow'
                    : 'bg-[#182234] hover:bg-[#24334c] text-slate-300 border border-white/[0.06]'
                }`}
              >
                <span>{zone}</span>
                <span className="text-[11px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* VIEW MODE 1: ALL 36 STATES GRID (Every State Shown Side-by-Side) */}
      {viewMode === 'grid' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {processedReports.map((st) => {
              const isSelected = st.stateName.toLowerCase() === selectedState.stateName.toLowerCase();
              const cDetails = getCloudDetails(st.cloudCoverPercent);
              const zone = getStateZone(st.stateName);

              return (
                <div
                  key={st.stateName}
                  onClick={() => handleSelectState(st.stateName)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                    isSelected
                      ? 'bg-gradient-to-br from-[#132238] via-[#0d1624] to-[#080d16] border-blue-400 ring-2 ring-blue-500/50 shadow-lg scale-101'
                      : 'bg-[#080d16]/90 hover:bg-[#111c2e]/90 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  <div>
                    {/* Top Row: State Name, Capital, Zone, and Temp */}
                    <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] pb-2 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-white text-sm font-display truncate">
                            {st.stateName}
                          </h4>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/[0.08] text-slate-300">
                            {zone}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono truncate">{st.capital}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold font-mono text-amber-300">
                          {st.tempC}°C
                        </div>
                        <div className="text-[10px] font-mono text-slate-300 flex items-center gap-1 justify-end">
                          <span className={`material-symbols-outlined text-[13px] ${cDetails.color}`}>
                            {cDetails.icon}
                          </span>
                          <span className="truncate max-w-[90px]">{st.conditionText}</span>
                        </div>
                      </div>
                    </div>

                    {/* Real-time Cloud Cover Progress Bar & Density Illustration */}
                    <div className="bg-[#0c121e] p-2 rounded-lg border border-white/[0.04] mb-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-400 flex items-center gap-1">
                          <span className={`material-symbols-outlined text-[14px] ${cDetails.color}`}>cloud</span>
                          <span>Cloud Cover:</span>
                        </span>
                        <span className={`font-bold ${cDetails.color}`}>
                          {st.cloudCoverPercent}% ({cDetails.text})
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-white/10">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${cDetails.bg}`}
                          style={{ width: `${st.cloudCoverPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Meteorological Telemetry Metrics */}
                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono text-slate-300">
                      <div className="bg-[#111722] p-1.5 rounded border border-white/[0.04]">
                        <span className="text-slate-400 block text-[9px]">Rain (24h / Rate)</span>
                        <span className={`font-bold ${((st.rainfall24hMm || 0) > 0 || st.rainfallMmHr > 0) ? 'text-blue-300' : 'text-slate-200'}`}>
                          {st.rainfall24hMm !== undefined ? `${st.rainfall24hMm}mm` : `${st.rainfallMmHr}mm/h`}
                        </span>
                      </div>

                      <div className="bg-[#111722] p-1.5 rounded border border-white/[0.04]">
                        <span className="text-slate-400 block text-[9px]">Wind</span>
                        <span className="font-bold text-amber-300 truncate block">
                          {st.windSpeedKmph} km/h {st.windDirection}
                        </span>
                      </div>

                      <div className="bg-[#111722] p-1.5 rounded border border-white/[0.04]">
                        <span className="text-slate-400 block text-[9px]">Humidity</span>
                        <span className="font-bold text-cyan-300">{st.humidityPercent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Alert Status & Last Update */}
                  <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[9px] font-mono">
                    <span className={`px-1.5 py-0.2 rounded font-bold ${
                      st.alertLevel === 'Red' ? 'bg-red-600 text-white' :
                      st.alertLevel === 'Orange' ? 'bg-amber-500 text-black' :
                      st.alertLevel === 'Yellow' ? 'bg-yellow-400 text-black' :
                      'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {st.alertLevel} Alert
                    </span>
                    <span className="text-slate-400 truncate max-w-[150px]">{st.lastUpdated}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: SORTABLE DATA MATRIX TABLE (All 36 States Tabular) */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#080d16]">
          <table className="w-full text-left text-xs font-mono text-slate-300">
            <thead className="bg-[#111722] text-slate-400 text-[10px] uppercase border-b border-white/10">
              <tr>
                <th className="py-2.5 px-3">State / UT</th>
                <th className="py-2.5 px-2">Zone</th>
                <th className="py-2.5 px-2 cursor-pointer hover:text-white" onClick={() => { setSortField('temp'); setSortAsc(!sortAsc); }}>
                  Temp (°C) ↕
                </th>
                <th className="py-2.5 px-2 cursor-pointer hover:text-white" onClick={() => { setSortField('cloud'); setSortAsc(!sortAsc); }}>
                  Cloud Cover (%) ↕
                </th>
                <th className="py-2.5 px-2 cursor-pointer hover:text-white" onClick={() => { setSortField('rain'); setSortAsc(!sortAsc); }}>
                  Precip (mm/h) ↕
                </th>
                <th className="py-2.5 px-2 cursor-pointer hover:text-white" onClick={() => { setSortField('wind'); setSortAsc(!sortAsc); }}>
                  Wind (km/h) ↕
                </th>
                <th className="py-2.5 px-2">Humidity</th>
                <th className="py-2.5 px-2">Barometer</th>
                <th className="py-2.5 px-2">Alert Level</th>
                <th className="py-2.5 px-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {processedReports.map((st) => {
                const isSelected = st.stateName.toLowerCase() === selectedState.stateName.toLowerCase();
                const cDetails = getCloudDetails(st.cloudCoverPercent);
                const zone = getStateZone(st.stateName);

                return (
                  <tr 
                    key={st.stateName}
                    onClick={() => handleSelectState(st.stateName)}
                    className={`hover:bg-white/[0.04] transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-950/40 text-white font-bold' : ''
                    }`}
                  >
                    <td className="py-2 px-3 flex items-center gap-2">
                      <span className="font-bold text-white">{st.stateName}</span>
                      <span className="text-[10px] text-slate-500">({st.capital})</span>
                    </td>
                    <td className="py-2 px-2 text-[10px] text-slate-400">{zone}</td>
                    <td className="py-2 px-2 text-amber-300 font-bold">{st.tempC}°C</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`material-symbols-outlined text-[14px] ${cDetails.color}`}>cloud</span>
                        <span className={`font-bold ${cDetails.color}`}>{st.cloudCoverPercent}%</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-blue-300">{st.rainfallMmHr} mm/h</td>
                    <td className="py-2 px-2">{st.windSpeedKmph} km/h {st.windDirection}</td>
                    <td className="py-2 px-2">{st.humidityPercent}%</td>
                    <td className="py-2 px-2 text-slate-400">{st.pressureHpa} hPa</td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        st.alertLevel === 'Red' ? 'bg-red-600 text-white' :
                        st.alertLevel === 'Orange' ? 'bg-amber-500 text-black' :
                        st.alertLevel === 'Yellow' ? 'bg-yellow-400 text-black' :
                        'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {st.alertLevel}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectState(st.stateName);
                          setViewMode('focus');
                        }}
                        className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* SELECTED STATE DETAILED METEOROLOGICAL BULLETIN & REAL-TIME SKY CLOUD SIMULATOR */}
      <div className="bg-[#080d16] p-4 rounded-xl border border-white/[0.1] space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-white/[0.08] pb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-base sm:text-lg font-bold text-white font-display">
                {selectedState.stateName}
              </h4>
              <span className="text-xs font-mono text-cyan-300">({selectedState.capital})</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.08] text-slate-300">
                {getStateZone(selectedState.stateName)} Zone
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                selectedState.alertLevel === 'Red' ? 'bg-red-600 text-white' :
                selectedState.alertLevel === 'Orange' ? 'bg-amber-500 text-black' :
                selectedState.alertLevel === 'Yellow' ? 'bg-yellow-400 text-black' :
                'bg-emerald-600 text-white'
              }`}>
                {selectedState.alertLevel} ALERT
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
              <span>Coordinates: {selectedState.latitude.toFixed(2)}°N, {selectedState.longitude.toFixed(2)}°E</span>
              <span className="text-white/20">•</span>
              <span className="text-emerald-400 font-medium">{selectedState.lastUpdated}</span>
            </div>
          </div>

          <div className="text-right self-start sm:self-auto">
            <div className="text-2xl font-bold font-mono text-amber-300">
              {selectedState.tempC}°C
            </div>
            <div className="text-xs font-mono text-slate-300 flex items-center gap-1 justify-end">
              <span className={`material-symbols-outlined text-[15px] ${cloudDetails.color}`}>{cloudDetails.icon}</span>
              <span>{selectedState.conditionText}</span>
            </div>
          </div>
        </div>

        {/* Real-time Sky & Cloud Cover Simulation Box */}
        <div className="bg-gradient-to-b from-[#0b1322] to-[#060a12] p-4 rounded-xl border border-white/[0.1] relative overflow-hidden">
          {/* Ambient Sky Cloud Visual Backdrop */}
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <div className="flex items-center gap-1.5 font-bold text-white">
              <span className={`material-symbols-outlined text-[18px] ${cloudDetails.color}`}>
                cloud
              </span>
              <span>Real-Time Atmospheric Cloud Simulation over {selectedState.stateName}:</span>
            </div>
            <span className={`font-bold text-sm ${cloudDetails.color}`}>
              {selectedState.cloudCoverPercent}% Cloud Density ({cloudDetails.text})
            </span>
          </div>

          {/* Animated Sky Canvas Simulation Window */}
          <div className="relative w-full h-24 rounded-lg overflow-hidden border border-white/10 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-3">
            {/* Sun or Moon depending on clear sky */}
            {selectedState.cloudCoverPercent < 50 && (
              <div className="absolute top-2 right-6 w-10 h-10 rounded-full bg-amber-400/80 shadow-[0_0_25px_rgba(251,191,36,0.9)] animate-pulse" />
            )}

            {/* Cloud Deck Overlays proportional to cloudCoverPercent */}
            <div 
              className="absolute inset-0 bg-slate-400/20 backdrop-blur-[1px] transition-all duration-700" 
              style={{ opacity: selectedState.cloudCoverPercent / 100 }}
            />

            {/* Organic Cloud Silhouettes */}
            <div className="relative z-10 flex items-center justify-around w-full">
              <div 
                className="flex items-center gap-2 bg-[#0c121e]/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15 shadow-xl text-white font-mono text-xs"
              >
                <span className={`material-symbols-outlined text-[20px] ${cloudDetails.color}`}>
                  {cloudDetails.icon}
                </span>
                <div>
                  <div className="font-bold text-[11px]">{cloudDetails.text}</div>
                  <div className="text-[9px] text-slate-400">
                    Est. Cloud Base: {selectedState.cloudCoverPercent > 70 ? '~800m (Low Stratus)' : '~2200m (Altocumulus)'}
                  </div>
                </div>
              </div>

              <div className="bg-[#0c121e]/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15 shadow-xl text-xs font-mono text-right">
                <div className="text-[10px] text-slate-400">Wind Drift Vector</div>
                <div className="text-amber-300 font-bold flex items-center gap-1 justify-end">
                  <span className="material-symbols-outlined text-[14px]">air</span>
                  <span>{selectedState.windSpeedKmph} km/h {selectedState.windDirection}</span>
                </div>
              </div>
            </div>

            {/* Rain Streaks Animation if precipitation > 0 */}
            {selectedState.rainfallMmHr > 0 && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-around opacity-40">
                <span className="text-blue-300 font-mono text-[9px] animate-bounce">💧 💧 💧</span>
                <span className="text-blue-300 font-mono text-[9px] animate-bounce" style={{ animationDelay: '0.2s' }}>💧 💧</span>
                <span className="text-blue-300 font-mono text-[9px] animate-bounce" style={{ animationDelay: '0.4s' }}>💧 💧 💧</span>
              </div>
            )}
          </div>

          {/* Visual Cloud Percentage Bar */}
          <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-white/10 mt-3 relative">
            <div 
              className={`h-full rounded-full transition-all duration-700 ${cloudDetails.bg}`}
              style={{ width: `${selectedState.cloudCoverPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1.5">
            <span>0% Clear Sky</span>
            <span>25% Scattered Cirrus</span>
            <span>50% Broken Cumulus</span>
            <span>75% Dense Deck</span>
            <span>100% Total Overcast</span>
          </div>
        </div>

        {/* Meteorological Parameters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="bg-[#111722] p-2.5 rounded-lg border border-white/[0.06]">
            <span className="text-[10px] text-slate-400 block">1. Temperature & Hum</span>
            <span className="text-amber-300 font-bold text-sm mt-0.5 block">{selectedState.tempC}°C</span>
            <span className="text-[9px] text-slate-400">Humidity: {selectedState.humidityPercent}%</span>
          </div>

          <div className="bg-[#111722] p-2.5 rounded-lg border border-white/[0.06]">
            <span className="text-[10px] text-slate-400 block">2. Cloud Cover & Base</span>
            <span className="text-cyan-300 font-bold text-sm mt-0.5 block">{selectedState.cloudCoverPercent}%</span>
            <span className="text-[9px] text-slate-400">{cloudDetails.text}</span>
          </div>

          <div className="bg-[#111722] p-2.5 rounded-lg border border-white/[0.06]">
            <span className="text-[10px] text-slate-400 block">3. 24h Rainfall & Rate</span>
            <span className="text-blue-400 font-bold text-sm mt-0.5 block">
              {selectedState.rainfall24hMm !== undefined ? `${selectedState.rainfall24hMm} mm (24h)` : `${selectedState.rainfallMmHr} mm/h`}
            </span>
            <span className="text-[9px] text-slate-400">
              Rate: {selectedState.rainfallMmHr} mm/h {selectedState.rainfallMmHr > 0 ? '• Active Rain' : '• Clear'}
            </span>
          </div>

          <div className="bg-[#111722] p-2.5 rounded-lg border border-white/[0.06]">
            <span className="text-[10px] text-slate-400 block">4. Surface Wind & Baro</span>
            <span className="text-white font-bold text-sm mt-0.5 block">{selectedState.windSpeedKmph} km/h</span>
            <span className="text-[9px] text-slate-400">{selectedState.windDirection} • {selectedState.pressureHpa} hPa</span>
          </div>
        </div>

        {/* Warning Bulletin Message */}
        <div className={`p-2.5 rounded-lg border text-xs leading-relaxed font-mono ${
          selectedState.alertLevel === 'Red' ? 'bg-red-950/70 border-red-500 text-red-200' :
          selectedState.alertLevel === 'Orange' ? 'bg-amber-950/70 border-amber-500 text-amber-200' :
          selectedState.alertLevel === 'Yellow' ? 'bg-yellow-950/70 border-yellow-500 text-yellow-200' :
          'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
        }`}>
          {selectedState.warningMessage}
        </div>
      </div>
    </div>
  );
};
