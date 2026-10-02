import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

export const AuthModal: React.FC = () => {
  const { 
    currentUser, 
    userProfile, 
    isAuthModalOpen, 
    closeAuthModal, 
    authModalMode, 
    setAuthModalMode,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    authError,
    clearAuthError,
    loading
  } = useAuth();

  const { theme, showToast } = useApp();

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [unit, setUnit] = useState('Personal Traveler');
  const [showPassword, setShowPassword] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
      showToast('🛡️ Authenticated with Google Firebase');
    } catch (e) {
      // handled in context
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();

    if (!email.trim() || !password.trim()) {
      return;
    }

    if (authModalMode === 'login') {
      try {
        await loginWithEmail(email, password);
        showToast('🛡️ Logged in successfully');
      } catch (e) {
        // handled in context
      }
    } else {
      if (!displayName.trim()) {
        return;
      }
      try {
        await registerWithEmail(email, password, displayName, callsign || 'TRAVELER', unit || 'India');
        showToast('🛡️ Account created & cloud sync initialized');
      } catch (e) {
        // handled in context
      }
    }
  };

  // Quick Demo credentials helper for rapid testing
  const fillDemoCredentials = () => {
    if (authModalMode === 'login') {
      setEmail('traveler.rahul@pathsuchak.in');
      setPassword('SafeTravel2026!');
    } else {
      setEmail(`traveler.${Math.floor(Math.random() * 900 + 100)}@pathsuchak.in`);
      setPassword('SafeTravel2026!');
      setDisplayName('Rahul Verma');
      setCallsign('TRAVELER-01');
      setUnit('Delhi-NCR');
    }
    clearAuthError();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      {/* Click backdrop to dismiss */}
      <div 
        className="absolute inset-0" 
        onClick={closeAuthModal} 
        aria-hidden="true" 
      />

      <div 
        id="auth-modal-dialog"
        className={`relative w-full max-w-md rounded-2xl border p-5 sm:p-6 shadow-2xl z-10 transition-all ${
          theme === 'night-vision'
            ? 'bg-[#040f07] border-emerald-500/70 text-emerald-100 shadow-[0_0_30px_rgba(34,197,94,0.25)]'
            : 'bg-[#0f172a] border-white/[0.12] text-white shadow-[0_0_35px_rgba(0,0,0,0.8)]'
        }`}
      >
        {/* Header with Title and Close Button */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
              theme === 'night-vision' 
                ? 'bg-emerald-950 border border-emerald-500 text-emerald-300' 
                : 'bg-primary/20 border border-primary text-primary'
            }`}>
              <span className="material-symbols-outlined text-[20px]">
                {authModalMode === 'login' ? 'lock' : 'badge'}
              </span>
            </div>
            <div>
              <h2 className="font-semibold text-base sm:text-lg">
                {authModalMode === 'login' ? 'User sign in' : 'Create free account'}
              </h2>
              <p className="text-xs text-slate-400">
                Firebase cloud security • Protected personal data
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeAuthModal}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            title="Close authentication modal"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Mode Selector Tabs: Login vs Register */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-white/[0.04] rounded-xl my-4 border border-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              setAuthModalMode('login');
              clearAuthError();
            }}
            className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              authModalMode === 'login'
                ? theme === 'night-vision'
                  ? 'bg-emerald-600 text-black shadow-md'
                  : 'bg-primary text-on-primary shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthModalMode('register');
              clearAuthError();
            }}
            className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              authModalMode === 'register'
                ? theme === 'night-vision'
                  ? 'bg-emerald-600 text-black shadow-md'
                  : 'bg-primary text-on-primary shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        {/* Error Banner */}
        {authError && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/50 flex items-start gap-2.5 text-xs text-red-200 animate-fadeIn">
            <span className="material-symbols-outlined text-[18px] text-red-400 shrink-0">error</span>
            <div className="flex-1 text-xs leading-relaxed">{authError}</div>
          </div>
        )}

        {/* Google Authentication Button */}
        <button
          id="google-login-button"
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-white/[0.14] bg-white text-slate-900 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition-all shadow-md active:scale-98 cursor-pointer disabled:opacity-50 mb-3"
        >
          {/* Google SVG Logo */}
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-white/[0.1]" />
          <span className="text-xs text-slate-400">or use email and password</span>
          <div className="flex-1 h-px bg-white/[0.1]" />
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {authModalMode === 'register' && (
            <>
              <div>
                <label className="block text-[13px] font-medium text-slate-300 mb-1">
                  Full name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Rahul Verma"
                  className="w-full bg-[#141d2e] border border-white/[0.1] rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-primary font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[13px] font-medium text-slate-300 mb-1">
                    Handle or nickname (optional)
                  </label>
                  <input
                    type="text"
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value)}
                    placeholder="Rahul-DL"
                    className="w-full bg-[#141d2e] border border-white/[0.1] rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-primary font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-300 mb-1">
                    City or state (optional)
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="Delhi NCR"
                    className="w-full bg-[#141d2e] border border-white/[0.1] rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-primary font-medium"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-[13px] font-medium text-slate-300 mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full bg-[#141d2e] border border-white/[0.1] rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-primary font-medium"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#141d2e] border border-white/[0.1] rounded-xl px-3 py-2 pr-10 text-xs sm:text-sm text-white focus:outline-none focus:border-primary font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            {authModalMode === 'register' && (
              <span className="text-xs text-slate-400 mt-0.5 block">
                Minimum 6 characters required
              </span>
            )}
          </div>

          {/* Submit Action */}
          <button
            id="auth-submit-button"
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow-lg active:scale-98 cursor-pointer mt-2 ${
              theme === 'night-vision'
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                : 'bg-primary hover:bg-primary/90 text-on-primary shadow-md'
            } disabled:opacity-50`}
          >
            {loading 
              ? 'Communicating with Firebase...' 
              : authModalMode === 'login' ? 'Sign in & access dashboard' : 'Create free account'}
          </button>
        </form>

        {/* Quick Demo Fill & Isolation Notice */}
        <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={fillDemoCredentials}
            className="text-primary hover:underline font-medium flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            <span>Quick-fill sample credentials</span>
          </button>

          <span className="text-slate-400 text-xs">
            Cloud isolation active
          </span>
        </div>
      </div>
    </div>
  );
};
