import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { AuthPage } from './components/AuthPage';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { OfflineSyncCenter } from './components/OfflineSyncCenter';
import { ResilientNavigation } from './components/ResilientNavigation';
import { DriverHome } from './components/DriverHome';
import { IncidentReporting } from './components/IncidentReporting';
import { EmergencySOS } from './components/EmergencySOS';
import { EmergencySupportDirectory } from './components/EmergencySupportDirectory';
import { ActiveDrivingHUD } from './components/ActiveDrivingHUD';
import { CycloneWarningSection } from './components/CycloneWarningSection';
import { WeatherAlertPushBanner } from './components/WeatherAlertPushBanner';
import { LocationPermissionModal } from './components/LocationPermissionModal';
import { NotFoundView } from './components/NotFoundView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IntroScreen } from './components/IntroScreen';
import { AppTab } from './types';

const TAB_METADATA: Record<AppTab, { title: string; desc: string }> = {
  'driver-home': {
    title: 'Travel Dashboard | PathSuchak',
    desc: 'Real-time GPS telemetry, quick action deck, emergency support, and active weather alerts.',
  },
  'resilient-navigation': {
    title: 'Turn-by-Turn Road Navigation | PathSuchak',
    desc: 'Offline highway routing with OSRM vector geometry, speed limits, and detour management.',
  },
  'cyclone-map': {
    title: 'Live Weather Report & Cyclone Radar | PathSuchak',
    desc: 'Real-time IMD weather bulletins, state cloud density heatmap, Doppler radar, and cyclone tracking near India.',
  },
  'incident-reporting': {
    title: 'Incident & Hazard Reporting | PathSuchak',
    desc: 'Offline road obstacle logger with photographic evidence and geofenced hazard alerts.',
  },
  'emergency-support': {
    title: 'Emergency Services Directory | PathSuchak',
    desc: 'Nearest trauma hospitals, police stations, NDRF rescue teams, and direct 112/108 speed dial.',
  },
  'emergency-sos': {
    title: 'Emergency Distress Transponder (SOS) | PathSuchak',
    desc: 'Guarded satellite distress transponder broadcasting live coordinates and radio guard frequencies.',
  },
  'offline-sync-center': {
    title: 'Offline Sync & Data Ledger | PathSuchak',
    desc: 'IndexedDB transaction ledger, conflict resolution engine, and automatic retry synchronization.',
  },
  'account': {
    title: 'Field Operator Profile | PathSuchak',
    desc: 'Callsign configuration, unit designation, and Firebase authentication credentials.',
  },
};

class IntroErrorBoundary extends React.Component<{ children: React.ReactNode; onSkip: () => void }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode; onSkip: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.error('[IntroScreen] Caught error in IntroScreen boundary, skipping intro:', error);
    this.props.onSkip();
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const MainContent: React.FC = () => {
  const { currentTab, setCurrentTab, toastMessage, isDrivingJourney, isFullScreenMap, setIsFullScreenMap, showToast, theme } = useApp();
  const { currentUser, initialAuthChecked } = useAuth();

  // Intro loading screen: plays on app load, then transitions to direct login or auth gate
  const [isIntroComplete, setIsIntroComplete] = React.useState<boolean>(false);

  // Log state on every render of MainContent
  React.useEffect(() => {
    console.log('[App Render] isIntroComplete:', isIntroComplete, 'initialAuthChecked:', initialAuthChecked, 'currentUser:', currentUser?.uid || 'none');
  }, [isIntroComplete, initialAuthChecked, currentUser]);

  const handleIntroComplete = React.useCallback(() => {
    console.log('[App] handleIntroComplete called, transitioning isIntroComplete to true');
    setIsIntroComplete(true);
  }, []);

  // Synchronize document.title, meta description, and canonical link with active view (Fixes Signs 4, 5, 6, 11)
  useEffect(() => {
    const meta = TAB_METADATA[currentTab];
    if (meta) {
      document.title = meta.title;

      // Update meta description
      const descTag = document.querySelector('meta[name="description"]');
      if (descTag) {
        descTag.setAttribute('content', meta.desc);
      }

      // Update OpenGraph Title
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute('content', meta.title);
      }

      // Update Canonical URL
      const canonicalTag = document.getElementById('app-canonical-tag');
      if (canonicalTag && typeof window !== 'undefined') {
        const canonicalUrl = `${window.location.origin}${window.location.pathname}#${currentTab}`;
        canonicalTag.setAttribute('href', canonicalUrl);
      }

      // Sync window hash silently
      if (typeof window !== 'undefined' && window.location.hash !== `#${currentTab}`) {
        window.history.replaceState(null, '', `#${currentTab}`);
      }
    }
  }, [currentTab]);

  // Listen to hash changes for deep linking and handle unknown 404 hashes
  const [is404, setIs404] = React.useState<boolean>(false);

  useEffect(() => {
    const checkHashRoute = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash) {
        if (hash in TAB_METADATA) {
          setCurrentTab(hash as AppTab);
          setIs404(false);
        } else if (hash === '404' || hash.length > 0) {
          setIs404(true);
        }
      }
    };

    checkHashRoute();
    window.addEventListener('hashchange', checkHashRoute);
    return () => window.removeEventListener('hashchange', checkHashRoute);
  }, [setCurrentTab]);

  // Handle ESC key to minimize full map
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreenMap) {
        setIsFullScreenMap(false);
        showToast('Exited Full Map View');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreenMap, setIsFullScreenMap, showToast]);

  // Intro screen on first app launch, remaining visible until Firebase auth has finished checking
  if (!isIntroComplete) {
    return (
      <IntroErrorBoundary onSkip={handleIntroComplete}>
        <IntroScreen
          isAuthReady={initialAuthChecked}
          onComplete={handleIntroComplete}
        />
      </IntroErrorBoundary>
    );
  }

  // FIRST SCREEN AUTH GATE: User must register or log in before accessing the application
  if (!currentUser) {
    return (
      <div 
        id="app-auth-gate-container"
        data-theme={theme}
        className={`flex flex-col min-h-screen font-sans selection:bg-primary/30 selection:text-white transition-colors duration-150 ${
          theme === 'light'
            ? 'bg-[#f1f5f9] text-slate-900 theme-light'
            : theme === 'night-vision'
            ? 'bg-[#040f07] text-emerald-100 theme-night-vision'
            : 'bg-[#0a0d14] text-on-surface dark'
        }`}
      >
        <AuthPage isFirstScreenGate={true} />
        {toastMessage && (
          <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[120] px-4 py-2.5 bg-[#171f2c]/95 backdrop-blur-xl border border-primary/50 text-white rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold max-w-[90vw] animate-fadeIn">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">info</span>
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      id="app-root-container"
      data-theme={theme}
      className={`flex flex-col min-h-screen font-sans selection:bg-primary/30 selection:text-white transition-colors duration-150 ${
        theme === 'light'
          ? 'bg-[#f1f5f9] text-slate-900 theme-light'
          : theme === 'night-vision'
          ? 'bg-[#040f07] text-emerald-100 theme-night-vision'
          : 'bg-[#0a0d14] text-on-surface dark'
      }`}
    >
      {/* Real-time Push Alert Component Banner */}
      <WeatherAlertPushBanner />

      {/* Fixed Tactical Header (Hidden during active driving or fullscreen map) */}
      {!isDrivingJourney && !isFullScreenMap && <Header currentTab={currentTab} />}

      {/* Main Content Area */}
      <main className={`flex-1 w-full ${isFullScreenMap ? 'h-screen overflow-hidden p-0' : 'pt-20 pb-28 px-3 sm:px-4 max-w-xl mx-auto overflow-y-auto'}`}>
        {is404 ? (
          <NotFoundView
            onReturnHome={() => {
              setIs404(false);
              setCurrentTab('driver-home');
            }}
          />
        ) : (
          <>
            {currentTab === 'driver-home' && <DriverHome />}
            {currentTab === 'resilient-navigation' && <ResilientNavigation />}
            {currentTab === 'cyclone-map' && <CycloneWarningSection />}
            {currentTab === 'incident-reporting' && <IncidentReporting />}
            {currentTab === 'emergency-support' && <EmergencySupportDirectory />}
            {currentTab === 'emergency-sos' && <EmergencySOS />}
            {currentTab === 'offline-sync-center' && <OfflineSyncCenter />}
            {currentTab === 'account' && <AuthPage />}
          </>
        )}
      </main>

      {/* Fixed Tactical Bottom Nav (Hidden during active driving or fullscreen map) */}
      {!isDrivingJourney && !isFullScreenMap && <BottomNav />}

      {/* Fullscreen Google Maps Navigation HUD */}
      {isDrivingJourney && <ActiveDrivingHUD />}

      {/* Google Maps Style Location Permission & Device GPS Modal */}
      <LocationPermissionModal />

      {/* Toast Notification HUD */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[120] px-4 py-2.5 bg-[#171f2c]/95 backdrop-blur-xl border border-primary/50 text-white rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold max-w-[90vw] animate-fadeIn">
          <span className="material-symbols-outlined text-primary text-[18px] shrink-0">info</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <AppProvider>
            <MainContent />
            <AuthModal />
          </AppProvider>
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

