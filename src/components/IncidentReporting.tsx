import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { IncidentCategory, IncidentSeverity, IncidentReport, PhotoAttachment, SyncStatusStage } from '../types';
import { toGeoJSONPoint, toGeoJSONFeature, evaluateGPSQuality, formatCoordinates } from '../services/gps-geojson.service';
import { validatePhotoFile, validatePhotoCount, compressPhoto, createPhotoAttachment } from '../services/photo-compression.service';
import { incidentOfflineStore } from '../services/incident-offline-store.service';
import { incidentSyncService, SyncProgressEvent } from '../services/incident-sync.service';
import { ConflictDialog } from './ConflictDialog';
import { TacticalMap } from './TacticalMap';

const DISTRICT_ROAD_PRESETS = [
  'NH-44 Northern Grand Corridor (Delhi-Chandigarh)',
  'NH-48 Western Expressway (Mumbai-Pune-Bengaluru)',
  'NH-16 Eastern Coastal Highway (Kolkata-Chennai)',
  'NH-275 Southern Deccan Expressway (Bengaluru-Mysuru)',
  'NH-1 Northern High-Pass Corridor (Leh-Ladakh)',
  'NH-11 Western Desert Corridor (Jodhpur-Jaisalmer)'
];

export const IncidentReporting: React.FC = () => {
  const { 
    currentGPS, 
    isOnline, 
    incidents, 
    deleteIncident, 
    setCurrentTab, 
    showToast 
  } = useApp();
  const { t, language } = useLanguage();
  const { currentUser, userProfile } = useAuth();

  // Form Fields
  const [category, setCategory] = useState<IncidentCategory>('landslide');
  const [severity, setSeverity] = useState<IncidentSeverity>('high');
  const [districtRoadSegment, setDistrictRoadSegment] = useState(DISTRICT_ROAD_PRESETS[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [observationTime, setObservationTime] = useState<string>(() => new Date().toISOString().slice(0, 16));

  // Web Speech API Voice Dictation State
  const [isListening, setIsListening] = useState<boolean>(false);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechAPI) {
      setSpeechSupported(false);
    }
  }, []);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  // Toggle Web Speech API voice transcription
  const handleToggleVoiceDictation = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      showToast('⚠️ Web Speech API is not supported in this browser. Please enter text manually.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      setInterimTranscript('');
      showToast('🎙️ Voice dictation finished. Hazard description updated.');
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;

      // Select matching regional locale for voice recognition
      const localeMap: Record<string, string> = {
        en: 'en-IN',
        hi: 'hi-IN',
        bn: 'bn-IN',
        ta: 'ta-IN',
        te: 'te-IN',
        mr: 'mr-IN',
        gu: 'gu-IN',
        kn: 'kn-IN',
        ml: 'ml-IN',
        pa: 'pa-IN',
        ur: 'ur-IN'
      };
      recognition.lang = localeMap[language] || `${language}-IN` || 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
        setInterimTranscript('');
        showToast('🎙️ Microphone active: Describe hazard (e.g. road blocked, washed out culvert)...');
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptPiece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            currentFinal += transcriptPiece;
          } else {
            currentInterim += transcriptPiece;
          }
        }

        if (currentFinal) {
          setDescription((prev) => {
            const trimmed = prev.trim();
            const cleanPiece = currentFinal.trim();
            if (!trimmed) {
              return cleanPiece;
            }
            return `${trimmed} ${cleanPiece}`;
          });

          // Automatically suggest title if title is empty
          setTitle((prevTitle) => {
            if (!prevTitle.trim()) {
              const words = currentFinal.trim().split(/\s+/).slice(0, 7).join(' ');
              return words.charAt(0).toUpperCase() + words.slice(1);
            }
            return prevTitle;
          });
        }

        setInterimTranscript(currentInterim);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        setInterimTranscript('');
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          showToast('⚠️ Microphone permission denied. Allow microphone access in your browser.');
        } else if (event.error === 'no-speech') {
          showToast('⚠️ No speech detected. Tap microphone to try again.');
        } else {
          showToast(`⚠️ Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
      setInterimTranscript('');
      showToast('⚠️ Could not start voice recognition.');
    }
  };

  // GPS State & Mode
  const [isManualPinMode, setIsManualPinMode] = useState<boolean>(false);
  const [manualLat, setManualLat] = useState<number>(currentGPS.latitude);
  const [manualLng, setManualLng] = useState<number>(currentGPS.longitude);
  const [manualAlt, setManualAlt] = useState<number>(currentGPS.altitude || 3048);
  const [manualAccuracy, setManualAccuracy] = useState<number>(10.0);

  // Active coordinates
  const activeLat = isManualPinMode ? manualLat : currentGPS.latitude;
  const activeLng = isManualPinMode ? manualLng : currentGPS.longitude;
  const activeAlt = isManualPinMode ? manualAlt : (currentGPS.altitude || 3048);
  const activeAccuracy = isManualPinMode ? manualAccuracy : currentGPS.accuracy;
  const gpsQuality = evaluateGPSQuality(activeAccuracy, isManualPinMode);

  // Photos State
  const [photoAttachments, setPhotoAttachments] = useState<PhotoAttachment[]>([]);
  const [isCompressingPhotos, setIsCompressingPhotos] = useState<boolean>(false);

  // Submission & Sync Pipeline State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeSyncProgress, setActiveSyncProgress] = useState<SyncProgressEvent | null>(null);
  const [viewMode, setViewMode] = useState<'form' | 'history'>('form');

  // Conflict Resolution Modal State
  const [conflictIncident, setConflictIncident] = useState<IncidentReport | null>(null);
  const [showGeoJSONPreview, setShowGeoJSONPreview] = useState<boolean>(false);

  // Subscribe to real-time sync progression events
  useEffect(() => {
    const unsubscribe = incidentSyncService.subscribe((event) => {
      setActiveSyncProgress(event);
      if (event.stage === 'CONFLICT' && event.serverRevision) {
        // Automatically open conflict dialog when conflict occurs
        incidentOfflineStore.getIncident(event.report_id).then((inc) => {
          if (inc) setConflictIncident(inc);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const categories: { id: IncidentCategory; labelKey: string; icon: string }[] = [
    { id: 'landslide', labelKey: 'incident.landslide', icon: 'landslide' },
    { id: 'roadblock', labelKey: 'incident.roadblock', icon: 'block' },
    { id: 'bridge_damage', labelKey: 'incident.bridge_damage', icon: 'warning' },
    { id: 'vehicle_breakdown', labelKey: 'incident.breakdown', icon: 'car_crash' },
    { id: 'weather_hazard', labelKey: 'incident.weather', icon: 'ac_unit' },
    { id: 'medical_emergency', labelKey: 'incident.medical', icon: 'emergency' }
  ];

  const severities: { id: IncidentSeverity; labelKey: string; color: string }[] = [
    { id: 'low', labelKey: 'incident.low', color: 'bg-outline-variant/30 text-on-surface' },
    { id: 'medium', labelKey: 'incident.medium', color: 'bg-primary/20 text-primary' },
    { id: 'high', labelKey: 'incident.high', color: 'bg-tertiary/20 text-tertiary' },
    { id: 'critical', labelKey: 'incident.critical', color: 'bg-error/20 text-error font-bold' }
  ];

  const handleToggleManualGPS = () => {
    if (!isManualPinMode) {
      setIsManualPinMode(true);
      setManualLat(currentGPS.latitude);
      setManualLng(currentGPS.longitude);
      setManualAlt(currentGPS.altitude || 3048);
      showToast('Manual Pin / Coordinate entry mode activated');
    } else {
      setIsManualPinMode(false);
      showToast(`Live GPS tracking active (±${Math.round(currentGPS.accuracy)}m)`);
    }
  };

  const handleSyncCurrentGPSFix = () => {
    setIsManualPinMode(false);
    setManualLat(currentGPS.latitude);
    setManualLng(currentGPS.longitude);
    setManualAlt(currentGPS.altitude || 3048);
    showToast(`GPS Position Locked: ${currentGPS.latitude.toFixed(5)}°N, ${currentGPS.longitude.toFixed(5)}°E`);
  };

  const handlePhotoFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate photo count
    const countValidation = validatePhotoCount(photoAttachments.length, files.length);
    if (!countValidation.isValid) {
      showToast(`⚠️ ${countValidation.error}`);
      return;
    }

    setIsCompressingPhotos(true);
    const tempReportId = `draft_${Date.now()}`;

    try {
      const newAttachments: PhotoAttachment[] = [];
      for (const file of files) {
        const validation = validatePhotoFile(file);
        if (!validation.isValid) {
          showToast(`⚠️ ${file.name}: ${validation.error}`);
          continue;
        }

        const attachment = await createPhotoAttachment(file, tempReportId);
        newAttachments.push(attachment);
      }

      setPhotoAttachments(prev => [...prev, ...newAttachments]);
      showToast(`📸 ${newAttachments.length} field photo(s) compressed and ready for offline storage`);
    } catch (err: any) {
      console.error(err);
      showToast(`Photo error: ${err.message}`);
    } finally {
      setIsCompressingPhotos(false);
      e.target.value = ''; // Reset input
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotoAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Please provide an incident title');
      return;
    }

    setIsSubmitting(true);
    const report_id = `IR-${Math.floor(100 + Math.random() * 900)}`;
    const idempotency_key = `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const tenant_id = 'tactical-unit-07';

    try {
      // 1. Convert active coordinates to GeoJSON Point
      const geo_json = toGeoJSONPoint(activeLat, activeLng, activeAlt);

      // 2. Prepare full incident record
      const newIncident: IncidentReport = {
        id: report_id,
        report_id,
        idempotency_key,
        tenant_id,
        revision: 1,
        title: title.trim(),
        category,
        severity,
        district_road_segment: districtRoadSegment.trim(),
        description: description.trim() || 'Road hazard / obstacle observed.',
        observation_time: new Date(observationTime).toISOString(),
        latitude: activeLat,
        longitude: activeLng,
        accuracy_meters: activeAccuracy,
        altitude_meters: activeAlt,
        gps_status: gpsQuality,
        geo_json,
        locationName: districtRoadSegment,
        reportedBy: userProfile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Community Reporter',
        user_id: currentUser?.uid || undefined,
        photos: photoAttachments.map(p => p.dataUrl || ''),
        photo_attachments: photoAttachments.map(p => ({ ...p, report_id })),
        timestamp: Date.now(),
        syncStatus: 'pending',
        sync_stage: 'LOCAL_ONLY',
        retry_count: 0
      };

      // 3. Store raw photo blobs in IndexedDB
      for (const photo of photoAttachments) {
        await incidentOfflineStore.savePhoto({ ...photo, report_id });
      }

      // 4. Store incident in IndexedDB
      await incidentOfflineStore.saveIncident(newIncident);

      // 5. Add to Sync Queue
      await incidentOfflineStore.saveQueueItem({
        id: `queue_${Date.now()}`,
        report_id,
        idempotency_key,
        type: 'incident',
        title: `${category.toUpperCase()}: ${newIncident.title}`,
        subtitle: isOnline ? 'Direct HQ Upload' : 'Pending Upload (Offline Queue)',
        sizeBytes: 24000 + photoAttachments.reduce((sum, p) => sum + p.sizeBytes, 0),
        timestamp: Date.now(),
        status: 'pending',
        sync_stage: 'LOCAL_ONLY',
        icon: 'assignment_late',
        color: severity === 'critical' ? '#ffb4ab' : '#fbbb45',
        retryCount: 0,
        payload: newIncident
      });

      showToast(`📝 Report ${report_id} saved to IndexedDB`);

      // 6. Initiate Sync Pipeline immediately
      if (isOnline) {
        showToast('Initiating HQ Satellite Uplink...');
        await incidentSyncService.syncIncident(newIncident);
      }

      // Reset form
      setTitle('');
      setDescription('');
      setPhotoAttachments([]);
      setViewMode('history');
    } catch (err: any) {
      console.error(err);
      showToast(`Failed to record incident: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeGeoJSON = toGeoJSONPoint(activeLat, activeLng, activeAlt);

  const getSyncBadge = (stage: SyncStatusStage) => {
    switch (stage) {
      case 'SYNCED':
        return { label: 'Synced to HQ', color: 'bg-secondary/20 text-secondary border-secondary/30', icon: 'check_circle' };
      case 'UPLOADING_PHOTOS':
        return { label: 'Uploading Photos', color: 'bg-primary/20 text-primary border-primary/30', icon: 'cloud_upload' };
      case 'SUBMITTING':
        return { label: 'Submitting Payload', color: 'bg-primary/20 text-primary border-primary/30', icon: 'sync' };
      case 'QUEUED':
        return { label: 'Queued Offline', color: 'bg-tertiary/20 text-tertiary border-tertiary/30', icon: 'cloud_queue' };
      case 'CONFLICT':
        return { label: 'HTTP 409 Conflict', color: 'bg-error/20 text-error border-error/50 font-bold', icon: 'sync_problem' };
      case 'FAILED':
        return { label: 'Sync Failed (Retrying)', color: 'bg-error/20 text-error border-error/30', icon: 'error' };
      default:
        return { label: 'Local Only', color: 'bg-outline-variant/30 text-on-surface-variant', icon: 'save' };
    }
  };

  return (
    <div className="flex flex-col w-full gap-4 max-w-xl mx-auto pb-6">
      
      {/* Top View Mode Switcher */}
      <div className="flex bg-[#121824] p-1 rounded-xl border border-white/[0.08] shadow-lg">
        <button
          type="button"
          onClick={() => setViewMode('form')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            viewMode === 'form'
              ? 'tactile-btn-primary shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">edit_note</span>
          Incident report
        </button>

        <button
          type="button"
          onClick={() => setViewMode('history')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            viewMode === 'history'
              ? 'tactile-btn-primary shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">history</span>
          Incident history ({incidents.length})
        </button>
      </div>

      {/* Operator Session Ledger Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#0b1019] dark:border-white/[0.08] text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${currentUser ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse' : 'bg-amber-500 dark:bg-amber-400'}`} />
          <span className="text-slate-600 dark:text-slate-400 truncate">
            {currentUser ? 'Reporting as:' : 'Operating in:'}
          </span>
          <span className="font-semibold text-slate-900 dark:text-white truncate">
            {currentUser ? (userProfile?.callsign || userProfile?.displayName || currentUser.email) : 'Guest mode (Unregistered)'}
          </span>
        </div>
        {currentUser ? (
          <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-300 dark:text-emerald-400 dark:bg-emerald-950/60 dark:border-emerald-500/40 px-2 py-0.5 rounded shrink-0 font-medium">
            Isolated cloud sync
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentTab('account')}
            className="text-[10px] text-primary hover:text-white bg-primary/20 hover:bg-primary/30 border border-primary/50 px-2 py-0.5 rounded font-semibold transition-all cursor-pointer shrink-0"
          >
            Sign in / Register
          </button>
        )}
      </div>

      {viewMode === 'form' ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          {/* GPS Telemetry & Accuracy Card */}
          <div className="tactile-card rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  gpsQuality === 'high_precision'
                    ? 'bg-secondary/20 border border-secondary text-secondary shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                    : isManualPinMode
                    ? 'bg-amber-500/20 border border-amber-500 text-amber-400'
                    : 'bg-primary/20 border border-primary text-primary'
                }`}>
                  <span className={`material-symbols-outlined text-[22px] ${!isManualPinMode ? 'animate-pulse' : ''}`}>
                    {isManualPinMode ? 'pin_drop' : 'my_location'}
                  </span>
                </div>
                
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                      GPS observation anchor
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border ${
                      gpsQuality === 'high_precision'
                        ? 'bg-secondary/15 text-secondary border-secondary/30'
                        : isManualPinMode
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        : 'bg-white/[0.06] text-slate-400 border-white/[0.08]'
                    }`}>
                      {isManualPinMode ? 'Manual pin' : `±${Math.round(activeAccuracy)}m ${gpsQuality.replace('_', ' ')}`}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-900 dark:text-white">
                    {formatCoordinates(activeLat, activeLng)}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block">Altitude</span>
                <span className="text-xs font-mono font-semibold text-primary">{Math.round(activeAlt)}m ASL</span>
              </div>
            </div>

            {/* Manual Coordinate Controls (if manual mode) */}
            {isManualPinMode && (
              <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#101622] dark:border-white/[0.08] shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">pin_drop</span>
                    Tactical map pin placement
                  </span>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                    Sub-meter (6 decimals)
                  </span>
                </div>

                {/* Embedded High-Precision Map with Micro-Nudge & Reticle */}
                <TacticalMap
                  heightClass="h-64"
                  interactive={true}
                  isPinDropMode={true}
                  initialPinnedCoord={{ lat: manualLat, lng: manualLng }}
                  onSelectCoordinate={(lat, lng) => {
                    setManualLat(lat);
                    setManualLng(lng);
                  }}
                  showControls={true}
                />

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[13px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Latitude (°N)
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={manualLat}
                      onChange={(e) => setManualLat(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-primary outline-none dark:bg-[#141c2b] dark:border-white/[0.1] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Longitude (°E)
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={manualLng}
                      onChange={(e) => setManualLng(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-primary outline-none dark:bg-[#141c2b] dark:border-white/[0.1] dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action Bar & GeoJSON Toggle */}
            <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={handleToggleManualGPS}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                  isManualPinMode
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-[#101622] hover:bg-[#182030] border-white/[0.08] text-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isManualPinMode ? 'cancel' : 'edit_location'}
                </span>
                {isManualPinMode ? 'Exit manual entry' : 'Manual coordinates'}
              </button>

              <button
                type="button"
                onClick={handleSyncCurrentGPSFix}
                className="py-2 px-3 rounded-lg text-xs font-semibold bg-[#101622] hover:bg-[#182030] border border-white/[0.08] text-slate-300 hover:text-primary transition-colors flex items-center justify-center gap-1 cursor-pointer"
                title="Sync with Live GPS Fix"
              >
                <span className="material-symbols-outlined text-[16px]">sync</span>
                Fix GPS
              </button>

              <button
                type="button"
                onClick={() => setShowGeoJSONPreview(!showGeoJSONPreview)}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer border ${
                  showGeoJSONPreview
                    ? 'bg-primary/20 text-primary border-primary/40'
                    : 'bg-[#101622] text-slate-400 border-white/[0.08]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">data_object</span>
                GeoJSON
              </button>
            </div>

            {/* GeoJSON Preview Collapsible */}
            {showGeoJSONPreview && (
              <div className="bg-black/80 p-2.5 rounded-lg border border-primary/30 text-[11px] font-mono text-secondary overflow-x-auto">
                <span className="text-[10px] font-semibold text-slate-400 block mb-1">
                  GeoJSON point schema
                </span>
                <pre>{JSON.stringify(activeGeoJSON, null, 2)}</pre>
              </div>
            )}
          </div>

          {/* Incident / Hazard Category Selection */}
          <div className="tactile-card rounded-2xl p-4">
            <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-2">
              Incident category *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    category === cat.id
                      ? 'tactile-btn-primary shadow-md'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:bg-[#101622] dark:border-white/[0.06] dark:text-slate-400 dark:hover:text-white dark:hover:border-white/[0.12]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{cat.icon}</span>
                  <span className="text-[11px] leading-tight font-medium">{t(cat.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Severity & Observation Time */}
          <div className="tactile-card rounded-2xl p-4 flex flex-col gap-3.5">
            <div>
              <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-2">
                Severity level *
              </label>
              <div className="grid grid-cols-4 gap-2">
                {severities.map((sev) => {
                  const isSel = severity === sev.id;
                  let customStyle = 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#101622] dark:border-white/[0.08] dark:text-slate-400 dark:hover:text-white';
                  if (isSel) {
                    if (sev.id === 'low') customStyle = 'bg-slate-700 text-white border-slate-700 shadow-md';
                    if (sev.id === 'medium') customStyle = 'bg-blue-600 text-white border-blue-600 shadow-md';
                    if (sev.id === 'high') customStyle = 'bg-amber-600 text-white border-amber-600 shadow-md';
                    if (sev.id === 'critical') customStyle = 'bg-red-600 text-white border-red-600 shadow-md';
                  }
                  return (
                    <button
                      type="button"
                      key={sev.id}
                      onClick={() => setSeverity(sev.id)}
                      className={`py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${customStyle}`}
                    >
                      {t(sev.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* District / Road Segment Preset Picker & Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
                  District / road segment *
                </label>
                <span className="text-[11px] text-orange-800 dark:text-primary font-medium">Tactical corridor</span>
              </div>
              
              {/* Preset Chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1.5 scrollbar-none">
                {DISTRICT_ROAD_PRESETS.map((preset, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => setDistrictRoadSegment(preset)}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-lg whitespace-nowrap border transition-colors cursor-pointer ${
                      districtRoadSegment === preset
                        ? 'tactile-btn-primary shadow-sm'
                        : 'bg-slate-100 text-slate-700 border-slate-300 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#101622] dark:text-slate-400 dark:border-white/[0.08] dark:hover:text-white'
                    }`}
                  >
                    {preset.split('(')[0].trim()}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={districtRoadSegment}
                onChange={(e) => setDistrictRoadSegment(e.target.value)}
                placeholder="e.g., NH-44 Northern Grand Corridor (Delhi-Ambala Km 85)"
                required
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary font-normal dark:bg-[#101622] dark:border-white/[0.08] dark:text-white"
              />
            </div>

            {/* Observation Time & Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Time observed *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={observationTime}
                    onChange={(e) => setObservationTime(e.target.value)}
                    required
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary font-mono dark:bg-[#101622] dark:border-white/[0.08] dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setObservationTime(new Date().toISOString().slice(0, 16))}
                    className="px-2.5 py-2 rounded-xl bg-slate-100 border border-slate-300 text-[11px] font-medium text-orange-800 hover:bg-slate-200 cursor-pointer dark:bg-[#101622] dark:border-white/[0.08] dark:text-primary dark:hover:bg-[#182030]"
                  >
                    Now
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Incident title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Massive rockfall blocking southbound lane"
                  required
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary dark:bg-[#101622] dark:border-white/[0.08] dark:text-white"
                />
              </div>
            </div>

            {/* Description & Verbal Hazard Voice Transcription */}
            <div>
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-[13px] font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-orange-800 dark:text-primary">notes</span>
                    <span>What happened</span>
                  </label>
                  {isListening && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/40 text-[10px] font-medium animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" />
                      <span>Transcribing speech...</span>
                    </span>
                  )}
                </div>

                {/* Microphone Web Speech Transcription Toggle Button */}
                <button
                  id="incident-mic-speech-btn"
                  type="button"
                  onClick={handleToggleVoiceDictation}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all shadow-sm active:scale-95 cursor-pointer border ${
                    isListening
                      ? 'bg-red-600 text-white border-red-700 ring-2 ring-red-500/50 shadow-md animate-pulse'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-[#141b26] dark:hover:bg-[#1c2637] dark:text-slate-300 dark:hover:text-white dark:border-white/[0.08]'
                  }`}
                  title={
                    isListening
                      ? 'Stop microphone voice transcription'
                      : 'Transcribe verbal hazard description via browser Web Speech API'
                  }
                  aria-label={
                    isListening
                      ? 'Stop voice recording'
                      : 'Transcribe verbal hazard description via microphone'
                  }
                >
                  <span className={`material-symbols-outlined text-[16px] ${isListening ? 'text-white' : 'text-orange-800 dark:text-primary'}`}>
                    {isListening ? 'mic' : 'mic_none'}
                  </span>
                  <span>{isListening ? 'Stop mic' : 'Voice dictate'}</span>
                </button>
              </div>

              <div className="relative">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Provide details on road blockage, bypass conditions, or casualties... or tap Voice dictate"
                  className={`w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary resize-none transition-all dark:bg-[#101622] dark:border-white/[0.08] dark:text-white ${
                    isListening
                      ? 'border-red-500/80 ring-2 ring-red-500/30'
                      : ''
                  }`}
                />

                {/* Inline Floating Microphone Quick-Tap Button */}
                <button
                  id="incident-mic-inline-btn"
                  type="button"
                  onClick={handleToggleVoiceDictation}
                  className={`absolute right-2.5 bottom-3.5 w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isListening
                      ? 'bg-red-600 text-white shadow-md animate-pulse ring-1 ring-red-300'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] dark:text-slate-400 dark:hover:text-primary'
                  }`}
                  title={isListening ? 'Stop voice recording' : 'Dictate verbal description'}
                  aria-label={isListening ? 'Stop voice recording' : 'Dictate verbal description'}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {isListening ? 'mic' : 'mic_none'}
                  </span>
                </button>
              </div>

              {/* Real-time Interim Speech Transcription Preview */}
              {interimTranscript && (
                <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-orange-100 border border-orange-300 text-xs text-orange-900 flex items-center gap-2 animate-fadeIn dark:bg-primary/10 dark:border-primary/30 dark:text-primary">
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping shrink-0" />
                  <span className="font-semibold shrink-0">Hearing:</span>
                  <span className="italic truncate">"{interimTranscript}"</span>
                </div>
              )}

              {/* Active Voice Waveform Indicator */}
              {isListening && (
                <div className="mt-1.5 px-3 py-2 rounded-xl bg-red-100 border border-red-300 text-xs text-red-900 flex items-center justify-between gap-2 animate-fadeIn dark:bg-red-950/40 dark:border-red-500/30 dark:text-red-200">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-red-700 dark:text-red-400">graphic_eq</span>
                    <span className="text-[11px]">Transcribing speech into report...</span>
                  </div>
                  <div className="flex items-center gap-1 h-3.5">
                    <span className="w-1 h-3.5 bg-red-600 dark:bg-red-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-2 bg-red-600 dark:bg-red-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-3 bg-red-600 dark:bg-red-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                    <span className="w-1 h-1.5 bg-red-600 dark:bg-red-400 rounded-full animate-pulse" style={{ animationDelay: '75ms' }} />
                  </div>
                </div>
              )}

              {/* Offline Synchronization Notice */}
              <div className="flex items-center justify-between mt-1 px-1">
                <span className="text-[10px] text-slate-600 dark:text-slate-400 flex items-center gap-1 font-medium">
                  <span className="material-symbols-outlined text-[12px]">cloud_sync</span>
                  <span>Auto-saved to local IndexedDB & queued for offline sync</span>
                </span>
                {description && (
                  <button
                    type="button"
                    onClick={() => setDescription('')}
                    className="text-[10px] text-slate-400 hover:text-red-400 transition-colors"
                  >
                    Clear notes
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Photo Attachments & Compression */}
          <div className="tactile-card rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
                  Photos ({photoAttachments.length} of 5)
                </span>
                {isCompressingPhotos && (
                  <span className="text-[10px] text-primary animate-pulse font-medium">
                    Compressing...
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400">
                Auto-compressed to IndexedDB
              </span>
            </div>

            {/* Photo Cards Grid */}
            {photoAttachments.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {photoAttachments.map((photo, idx) => (
                  <div key={photo.id} className="relative h-24 rounded-xl overflow-hidden border border-white/[0.1] group">
                    <img
                      src={photo.dataUrl}
                      alt={photo.name || `Field incident evidence upload ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/80 p-1 text-[9px] font-mono text-white flex justify-between">
                      <span>{(photo.sizeBytes / 1024).toFixed(0)} KB</span>
                      <span className="text-secondary">-{photo.compressionRatio}%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/80 text-red-400 flex items-center justify-center shadow cursor-pointer hover:bg-red-600 hover:text-white transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Photo Picker Buttons */}
            <div className="flex items-center gap-2">
              <label className="flex-1 bg-[#101622] hover:bg-[#182030] border border-white/[0.08] rounded-xl py-2.5 px-3 flex items-center justify-center gap-2 cursor-pointer transition-colors text-xs font-semibold text-slate-200">
                <span className="material-symbols-outlined text-[18px] text-primary">photo_camera</span>
                Capture / select field evidence photos
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handlePhotoFilesSelected}
                  className="hidden"
                  disabled={photoAttachments.length >= 5 || isCompressingPhotos}
                />
              </label>
            </div>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={isSubmitting || isCompressingPhotos}
            className="w-full tactile-btn-primary py-3.5 rounded-xl font-semibold text-sm shadow-xl flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">
              {isOnline ? 'send' : 'save'}
            </span>
            {isSubmitting
              ? 'Submitting to offline queue...'
              : isOnline
              ? 'Submit incident report'
              : 'Submit incident report (Save offline)'}
          </button>
        </form>
      ) : (
        /* Incident History & Sync Status View */
        <div className="flex flex-col gap-3">
          {incidents.length === 0 ? (
            <div className="tactile-card rounded-2xl p-8 text-center text-slate-600 dark:text-slate-400">
              <span className="material-symbols-outlined text-[36px] text-slate-400 dark:text-slate-600 mb-2 block">assignment</span>
              <p className="font-display font-bold text-slate-900 dark:text-white text-sm">No incidents recorded</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">All tactical sectors reported clear.</p>
            </div>
          ) : (
            incidents.map((inc) => {
              const badge = getSyncBadge(inc.sync_stage || (inc.syncStatus === 'synced' ? 'SYNCED' : 'QUEUED'));
              const isConflict = inc.sync_stage === 'CONFLICT' || !!inc.server_version;

              return (
                <div
                  key={inc.report_id || inc.id}
                  className="tactile-card rounded-2xl p-4 flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
                        {inc.id}
                      </span>
                      <span className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded ${
                        inc.severity === 'critical' || inc.severity === 'high'
                          ? 'bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                      }`}>
                        {inc.severity}
                      </span>
                    </div>

                    {/* Sync Lifecycle Stage Badge */}
                    <span className={`text-[11px] font-mono font-bold flex items-center gap-1 px-2 py-0.5 rounded border ${badge.color}`}>
                      <span className="material-symbols-outlined text-[14px]">
                        {badge.icon}
                      </span>
                      {badge.label}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white">{inc.title}</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{inc.description}</p>
                  </div>

                  {/* Conflict Notice & Resolution Trigger */}
                  {isConflict && inc.server_version && (
                    <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-red-400 text-[20px]">warning</span>
                        <span className="text-xs font-bold text-red-400">
                          HQ Revision Collision (v{inc.server_version.revision})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConflictIncident(inc)}
                        className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-lg shadow cursor-pointer hover:bg-red-500"
                      >
                        Resolve Conflict
                      </button>
                    </div>
                  )}

                  {/* Photos Preview */}
                  {inc.photos && inc.photos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto py-1">
                      {inc.photos.map((p, idx) => (
                        <img
                          key={idx}
                          src={p}
                          alt={`Field evidence photograph ${idx + 1} for incident: ${inc.title}`}
                          className="h-16 w-24 object-cover rounded-lg border border-white/[0.1] shrink-0"
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono border-t border-white/[0.06] pt-2">
                    <span>{inc.district_road_segment || inc.locationName}</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setCurrentTab('resilient-navigation')}
                        className="text-primary hover:underline font-bold cursor-pointer"
                      >
                        View on Map
                      </button>
                      <button
                        onClick={() => deleteIncident(inc.id)}
                        className="text-red-400 hover:text-red-300 hover:underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Conflict Resolution Dialog Modal */}
      {conflictIncident && conflictIncident.server_version && (
        <ConflictDialog
          isOpen={!!conflictIncident}
          incident={conflictIncident}
          serverVersion={conflictIncident.server_version}
          onClose={() => setConflictIncident(null)}
          onResolve={async (choice, mergedText) => {
            await incidentSyncService.resolveConflict(conflictIncident.report_id, choice, mergedText);
            showToast(`Conflict resolved using strategy: ${choice.replace('_', ' ')}`);
          }}
        />
      )}

    </div>
  );
};
