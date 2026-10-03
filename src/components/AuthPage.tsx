import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { detectDeviceDetails, getOrCreateDeviceId } from '../services/device-recognition.service';

interface AuthPageProps {
  isFirstScreenGate?: boolean;
}

export const AuthPage: React.FC<AuthPageProps> = ({ isFirstScreenGate = false }) => {
  const { 
    currentUser, 
    userProfile, 
    loading, 
    authError, 
    loginWithGoogle, 
    loginWithEmail, 
    registerWithEmail, 
    logout, 
    clearAuthError,
    isDeviceRecognized,
    recognizedDevice,
    forgetThisDevice
  } = useAuth();

  const { setCurrentTab, incidents, syncQueue, gpsBreadcrumbs, showToast, theme } = useApp();
  const { t } = useLanguage();

  const [mode, setMode] = useState<'login' | 'register'>(isFirstScreenGate ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [unit, setUnit] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Detect current hardware/browser details for device recognition notice
  const currentDevice = detectDeviceDetails();
  const currentDeviceId = getOrCreateDeviceId();

  const handleGoogleSignIn = async () => {
    try {
      setSubmitting(true);
      setLocalError(null);
      clearAuthError();
      await loginWithGoogle();
      setCurrentTab('driver-home');
      showToast('Device recognized & authenticated with Google');
    } catch (err: any) {
      setLocalError(err.message || 'Google sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both email and password.');
      return;
    }

    if (mode === 'register') {
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match.');
        return;
      }
      if (!displayName.trim()) {
        setLocalError('Please enter your name.');
        return;
      }
    }

    try {
      setSubmitting(true);
      if (mode === 'login') {
        await loginWithEmail(email, password);
        setCurrentTab('driver-home');
        showToast(`Device recognized! Welcome back, ${email}`);
      } else {
        await registerWithEmail(
          email, 
          password, 
          displayName, 
          callsign.trim() || displayName.split(' ')[0].toUpperCase(), 
          unit.trim() || 'General Public'
        );
        setCurrentTab('driver-home');
        showToast(`Account created & device recognized! Welcome ${displayName}`);
      }
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const userIncidents = incidents.filter(i => !currentUser || i.user_id === currentUser.uid || !i.user_id);
  const userQueueItems = syncQueue.filter(q => !currentUser || q.user_id === currentUser.uid || !q.user_id);

  // If user is already logged in, show their full authenticated dossier and recognized device status
  if (currentUser) {
    return (
      <div className="flex flex-col gap-5 max-w-xl mx-auto pb-10 animate-fadeIn">
        {/* Top Header Card */}
        <div className="tactile-card rounded-2xl p-5 relative overflow-hidden border border-emerald-500/30">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 via-primary to-amber-400" />
          
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {currentUser.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt="User Avatar" 
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500 shadow-md"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 font-mono font-bold text-xl shadow-md">
                  {(userProfile?.callsign || userProfile?.displayName || 'TR').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900 dark:text-white text-lg sm:text-xl">
                    {userProfile?.displayName || currentUser.displayName || 'Traveler'}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-500/50 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {currentUser.email}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className="text-primary font-semibold">{userProfile?.callsign || 'Traveler'}</span>
                  <span className="text-slate-400 dark:text-slate-600">•</span>
                  <span className="text-slate-700 dark:text-slate-300">{userProfile?.unit || 'General Public'}</span>
                </div>
              </div>
            </div>
            
            <button
              id="auth-logout-button"
              type="button"
              onClick={async () => {
                await logout();
                showToast('Signed out & device recognition cleared');
              }}
              className="px-3 py-1.5 rounded-xl bg-red-950/50 hover:bg-red-900/60 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Sign Out"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>

        {/* Device Recognition & Trusted Terminal Card */}
        <div className="tactile-card rounded-2xl p-4 sm:p-5 border border-emerald-500/30 bg-emerald-950/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400 text-[20px]">devices</span>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                Recognized device & direct auto-login
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-500/50 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Trusted Terminal
            </span>
          </div>

          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
            This device has been securely recognized. When you open PathSuchak after the loading sequence, 
            you will be directly logged in to this profile without needing to enter credentials again.
          </p>

          <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#090d15] border border-slate-300 dark:border-white/[0.08] text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Terminal Hardware:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {recognizedDevice?.deviceName || currentDevice.deviceName}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Device Persistent ID:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 text-[11px]">
                {recognizedDevice?.deviceId || currentDeviceId}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Direct Auto-Login:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Active on this terminal
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">First Recognized:</span>
              <span className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                {new Date(recognizedDevice?.recognizedAt || Date.now()).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              id="auth-forget-device-button"
              type="button"
              onClick={async () => {
                await forgetThisDevice();
                showToast('Device forgotten. You will need to log in again next time.');
              }}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-500 font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">phonelink_erase</span>
              <span>Forget this device & sign out</span>
            </button>
          </div>
        </div>

        {/* Security & Cloud Isolation Ledger Status */}
        <div className="tactile-card rounded-2xl p-4 sm:p-5 border border-white/[0.08]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">verified_user</span>
              <span>Isolated user cloud storage</span>
            </h3>
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
              Active session
            </span>
          </div>

          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
            Your incidents, waypoints, offline queues, and SOS emergency transponder bursts are 
            strictly segregated under your unique cloud Firestore collection. No other user can read or modify your private records.
          </p>

          {/* User Isolated Record Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#0e1420] border border-slate-200 dark:border-white/[0.06]">
              <div className="text-xl font-medium font-mono text-primary">
                {userIncidents.length}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Hazard reports
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#0e1420] border border-slate-200 dark:border-white/[0.06]">
              <div className="text-xl font-medium font-mono text-amber-600 dark:text-amber-400">
                {userQueueItems.length}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Sync queue
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#0e1420] border border-slate-200 dark:border-white/[0.06]">
              <div className="text-xl font-medium font-mono text-emerald-600 dark:text-emerald-400">
                {gpsBreadcrumbs.length}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Breadcrumbs
              </div>
            </div>
          </div>

          {/* Technical Metadata Details */}
          <div className="mt-4 p-3 rounded-xl bg-slate-100 dark:bg-[#090d15] border border-slate-200 dark:border-white/[0.05] text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
            <div className="flex justify-between items-center">
              <span>Firebase user UID:</span>
              <span className="text-slate-800 dark:text-slate-200 font-mono truncate max-w-[200px]" title={currentUser.uid}>
                {currentUser.uid}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Auth provider:</span>
              <span className="text-primary font-medium">
                {currentUser.providerData[0]?.providerId || 'password'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Firestore database ID:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono truncate max-w-[200px]">
                ai-studio-offlinesynccente...
              </span>
            </div>
          </div>
        </div>

        {/* Quick Navigations */}
        <div className="grid grid-cols-2 gap-3">
          <button
            id="auth-go-report-button"
            type="button"
            onClick={() => setCurrentTab('incident-reporting')}
            className="p-3.5 rounded-xl bg-primary text-on-primary font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-md active:scale-98 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add_alert</span>
            <span>File road incident</span>
          </button>
          
          <button
            id="auth-go-sync-button"
            type="button"
            onClick={() => setCurrentTab('offline-sync-center')}
            className="p-3.5 rounded-xl bg-slate-200 dark:bg-[#172030] hover:bg-slate-300 dark:hover:bg-[#202b40] border border-slate-300 dark:border-white/[0.1] text-slate-900 dark:text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">sync</span>
            <span>View offline ledger</span>
          </button>
        </div>
      </div>
    );
  }

  // Not logged in: Show Login / Registration View (Gate Screen)
  return (
    <div className={`flex flex-col gap-4 max-w-xl mx-auto ${isFirstScreenGate ? 'min-h-screen justify-center py-8 px-3 sm:px-4' : 'pb-10'} animate-fadeIn`}>
      {/* Top Branding (Highlighted for First Screen Gate) */}
      {isFirstScreenGate && (
          <div className="text-center mb-2 animate-fadeIn flex flex-col items-center">
            <div className="w-14 h-14 mb-2">
              <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="32" fill="rgba(255, 122, 26, 0.16)" filter="blur(8px)" />
                <path
                  d="M 50 12 L 78 30 L 78 68 L 50 86 L 22 68 L 22 30 Z"
                  fill="#050a12"
                  stroke="#ff7a1a"
                  strokeWidth="2.8"
                  style={{ filter: 'drop-shadow(0 0 12px rgba(255, 122, 26, 0.8))' }}
                />
                <path
                  d="M 32 68 C 36 56, 44 58, 48 48 C 52 38, 56 42, 64 26"
                  stroke="#ff7a1a"
                  strokeWidth="3.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="32" cy="68" r="3.2" fill="#ffffff" />
                <circle cx="48" cy="48" r="2.8" fill="#ff7a1a" />
                <polygon points="64,22 68,30 60,28" fill="#10b981" />
                <circle cx="64" cy="26" r="3.2" fill="#10b981" />
              </svg>
            </div>
            <h1 className="font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight flex items-center justify-center">
              <span>Path</span><span className="text-primary">Suchak</span>
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              Turn Uncertainty Into Awareness, Because Every Path Has a Story.
            </p>
          </div>
        )}

      {/* Top Banner */}
      <div className="tactile-card rounded-2xl p-5 relative overflow-hidden border border-primary/40 shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-amber-400 to-emerald-400" />
        
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">person</span>
            <span className="text-xs font-semibold text-primary">
              Account access
            </span>
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
          {mode === 'login' ? 'Sign in to your account' : 'Create free account'}
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
          Open to all commuters, travelers, logistics drivers, and disaster response teams. Sign in with Google or email for personalized routes and offline sync.
        </p>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-100 dark:bg-[#0b1019] rounded-xl border border-slate-300 dark:border-white/[0.08]">
          <button
            id="auth-tab-login"
            type="button"
            onClick={() => {
              setMode('login');
              setLocalError(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-primary text-on-primary shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Sign in
          </button>
          <button
            id="auth-tab-register"
            type="button"
            onClick={() => {
              setMode('register');
              setLocalError(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              mode === 'register'
                ? 'bg-primary text-on-primary shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Create account
          </button>
        </div>
      </div>

      {/* Main Form Box */}
      <div className="tactile-card rounded-2xl p-5 border border-slate-200 dark:border-white/[0.08]">
        {/* One-Tap Google Sign In */}
        <button
          id="auth-google-signin-button"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={submitting || loading}
          className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 dark:border-transparent text-slate-900 font-bold text-xs flex items-center justify-center gap-3 transition-all shadow-md active:scale-98 disabled:opacity-50 cursor-pointer mb-5"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-slate-300 dark:border-white/[0.08] w-full" />
          <span className="bg-white dark:bg-[#111722] px-3 text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 tracking-wider absolute">
            Or With Email & Password
          </span>
        </div>

        {/* Error Alert */}
        {(localError || authError) && (
          <div className="mb-4 p-3 rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-500/50 text-red-800 dark:text-red-200 text-xs flex items-start gap-2 animate-fadeIn">
            <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-[18px] shrink-0 mt-0.5">error</span>
            <div className="flex-1">
              <span className="font-bold">Error: </span>
              <span>{localError || authError}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full name *
                </label>
                <input
                  id="auth-input-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Rahul Verma"
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#090d15] border border-slate-300 dark:border-white/[0.1] text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Handle or nickname (optional)
                  </label>
                  <input
                    id="auth-input-callsign"
                    type="text"
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value)}
                    placeholder="e.g. Rahul-DL"
                    className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#090d15] border border-slate-300 dark:border-white/[0.1] text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                    City or region (optional)
                  </label>
                  <input
                    id="auth-input-unit"
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="e.g. Delhi NCR"
                    className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#090d15] border border-slate-300 dark:border-white/[0.1] text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email address *
            </label>
            <input
              id="auth-input-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#090d15] border border-slate-300 dark:border-white/[0.1] text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1">
              Password *
            </label>
            <div className="relative">
              <input
                id="auth-input-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3 py-2.5 pr-10 rounded-xl bg-white dark:bg-[#090d15] border border-slate-300 dark:border-white/[0.1] text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-primary"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirm password *
              </label>
              <input
                id="auth-input-confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#090d15] border border-slate-300 dark:border-white/[0.1] text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-primary"
                required
              />
            </div>
          )}

          <button
            id="auth-submit-button"
            type="submit"
            disabled={submitting || loading}
            className="w-full py-3 px-4 mt-2 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing & recognizing device...</span>
              </>
            ) : mode === 'login' ? (
              <>
                <span className="material-symbols-outlined text-[18px]">login</span>
                <span>Sign in & remember this device</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
                <span>Create account & register device</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
