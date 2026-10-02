import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';

interface IntroScreenProps {
  onComplete: () => void;
  isAuthReady: boolean;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({ onComplete }) => {
  const [shouldReduceMotion, setShouldReduceMotion] = useState(false);

  useEffect(() => {
    try {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setShouldReduceMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setShouldReduceMotion(e.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    } catch {
      setShouldReduceMotion(false);
    }
  }, []);

  // Fast session skip
  const isSessionQuick = useMemo(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem('pathsuchak_intro_seen') === 'true';
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('pathsuchak_intro_seen', 'true');
    } catch {}
  }, []);

  // Satisfying cinematic duration
  const totalDuration = isSessionQuick ? 250 : 1800;

  const [elapsed, setElapsed] = useState(0);
  const [isAnimationFinished, setIsAnimationFinished] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isSkipped, setIsSkipped] = useState(false);

  // Frame ticker loop using requestAnimationFrame for optimal buttery smooth 60fps performance
  useEffect(() => {
    let isMounted = true;
    const startTime = performance.now();

    const tick = (now: number) => {
      if (!isMounted) return;
      const progress = now - startTime;
      setElapsed(progress);

      if (progress < totalDuration) {
        requestAnimationFrame(tick);
      } else {
        setIsAnimationFinished(true);
      }
    };

    requestAnimationFrame(tick);
    return () => {
      isMounted = false;
    };
  }, [totalDuration]);

  const overallProgress = useMemo(() => {
    if (isSkipped || isAnimationFinished) return 100;
    return Math.min(100, Math.round((elapsed / totalDuration) * 100));
  }, [elapsed, totalDuration, isSkipped, isAnimationFinished]);

  // Smooth cinematic exits
  useEffect(() => {
    if ((isAnimationFinished || isSkipped) && !isExiting) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        onComplete();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isAnimationFinished, isSkipped, isExiting, onComplete]);

  // Hard failsafe unmount
  useEffect(() => {
    const hardFailsafe = setTimeout(() => {
      onComplete();
    }, 2400);
    return () => clearTimeout(hardFailsafe);
  }, [onComplete]);

  const handleSkip = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsSkipped(true);
    setIsAnimationFinished(true);
    setIsExiting(true);
    onComplete();
  }, [onComplete]);

  return (
    <motion.div
      data-intro-screen="true"
      initial={{ opacity: 1 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      onClick={handleSkip}
      className="fixed inset-0 z-[9999] overflow-hidden select-none flex flex-col justify-between items-center p-4 sm:p-6 bg-[#040810] text-white cursor-pointer font-sans"
    >
      {/* Background Topographic Matrix Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.22] mix-blend-screen">
        <svg className="w-full h-full animate-pulse" style={{ animationDuration: '6s' }} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="tactical-intro-grid-dense" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(56, 189, 248, 0.15)" strokeWidth="0.8" />
              <circle cx="0" cy="0" r="0.8" fill="rgba(255, 122, 26, 0.3)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#tactical-intro-grid-dense)" />
        </svg>
      </div>

      {/* Cybernetic HUD Frame Accents */}
      <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary/40 pointer-events-none" />
      <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary/40 pointer-events-none" />
      <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary/40 pointer-events-none" />
      <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary/40 pointer-events-none" />

      {/* Main Holographic Screen Area */}
      <div className="relative z-10 w-full flex-1 max-h-[42vh] flex items-center justify-center overflow-hidden my-auto">
        <div className="relative w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full overflow-visible"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Concentric rotating neon circles around Logo */}
            <motion.circle
              cx="50"
              cy="50"
              r="46"
              stroke="rgba(16, 185, 129, 0.3)"
              strokeWidth="1.2"
              strokeDasharray="6 8"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
            />
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              stroke="rgba(255, 122, 26, 0.2)"
              strokeWidth="1"
              strokeDasharray="4 6"
              animate={{ rotate: -360 }}
              transition={{ repeat: Infinity, duration: 16, ease: 'linear' }}
            />

            {/* Ambient holographic gradient glow */}
            <circle cx="50" cy="50" r="32" fill="rgba(255, 122, 26, 0.16)" filter="blur(8px)" />

            {/* Main Signpost Shield Hexagon */}
            <path
              d="M 50 12 L 78 30 L 78 68 L 50 86 L 22 68 L 22 30 Z"
              fill="#050a12"
              stroke="#ff7a1a"
              strokeWidth="2.8"
              style={{ filter: 'drop-shadow(0 0 16px rgba(255, 122, 26, 0.8))' }}
            />

            {/* Secondary Inner Guideline contours */}
            <path
              d="M 50 16 L 74 32 L 74 66 L 50 82 L 26 66 L 26 32 Z"
              stroke="rgba(56, 189, 248, 0.3)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />

            {/* Winding Routing Path Inside the Shield */}
            <path
              d="M 32 68 C 36 56, 44 58, 48 48 C 52 38, 56 42, 64 26"
              stroke="#ff7a1a"
              strokeWidth="3.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 8px rgba(255, 122, 26, 0.9))' }}
            />

            {/* Precise Point Beacons */}
            <circle cx="32" cy="68" r="3.2" fill="#ffffff" />
            <circle cx="48" cy="48" r="2.8" fill="#ff7a1a" />
            <polygon points="64,22 68,30 60,28" fill="#10b981" />
            <circle cx="64" cy="26" r="3.2" fill="#10b981" style={{ filter: 'drop-shadow(0 0 6px #10b981)' }} />
          </svg>
        </div>
      </div>

      {/* ZONE 2: Text Blocks & Cinematic Branding */}
      <div className="relative z-20 w-full flex flex-col items-center justify-center text-center px-4 py-2 my-auto min-h-[140px] max-w-xl">
        
        {/* Sliding Wordmark with beautiful spacing */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="flex items-center justify-center tracking-tight mb-2 select-none"
          style={{
            fontSize: 'clamp(38px, 10vw, 60px)',
            fontWeight: 800,
            textShadow: '0 4px 18px rgba(0,0,0,0.95)'
          }}
        >
          <span className="text-white">Path</span>
          <span className="text-primary" style={{ textShadow: '0 0 15px rgba(255,122,26,0.5)' }}>Suchak</span>
        </motion.div>

        {/* Subtitle / Tagline Block */}
        <div className="flex flex-col items-center justify-center gap-1.5 max-w-[340px] sm:max-w-md mx-auto">
          {/* Animated Line 1 */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: shouldReduceMotion ? 0 : 0.3 }}
            className="text-slate-200 font-sans tracking-wide text-sm sm:text-base font-medium"
            style={{ textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}
          >
            Turn Uncertainty Into Awareness,
          </motion.div>

          {/* Animated Line 2 */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: shouldReduceMotion ? 0 : 0.5 }}
            className="text-slate-300 font-sans tracking-wide text-sm sm:text-base font-medium"
            style={{ textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}
          >
            Because Every Path Has a Story.
          </motion.div>
        </div>
      </div>

      {/* ZONE 3: Progress Strips */}
      <footer className="relative z-20 w-full flex flex-col items-center gap-3 pb-4 max-w-md">
        {/* Futuristic glowing progress bar */}
        <div className="w-52 sm:w-64 h-[3px] rounded-full bg-white/[0.05] overflow-hidden shadow-[0_0_8px_rgba(0,0,0,0.5)]">
          <div
            style={{
              width: `${overallProgress}%`,
              background: 'linear-gradient(to right, #ff7a1a, #f97316, #10b981)'
            }}
            className="h-full rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(255,122,26,0.8)]"
          />
        </div>
      </footer>
    </motion.div>
  );
};
