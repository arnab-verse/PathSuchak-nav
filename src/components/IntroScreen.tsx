import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import * as topojson from 'topojson-client';
import rawIndiaData from '../assets/india-states.json';

interface IntroScreenProps {
  onComplete: () => void;
  isAuthReady: boolean;
}

// Projection dimensions & bounding boxes for India
const SVG_W = 600;
const SVG_H = 700;
const PAD_X = 22;
const PAD_Y = 22;
const INNER_W = SVG_W - 2 * PAD_X;
const INNER_H = SVG_H - 2 * PAD_Y;

const MIN_LNG = 68.0;
const MAX_LNG = 97.6;
const MIN_LAT = 7.0;
const MAX_LAT = 37.3;

function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

const Y_MIN = mercatorY(MIN_LAT);
const Y_MAX = mercatorY(MAX_LAT);

function project(lng: number, lat: number): [number, number] {
  const normX = (lng - MIN_LNG) / (MAX_LNG - MIN_LNG);
  const normY = (Y_MAX - mercatorY(lat)) / (Y_MAX - Y_MIN);
  return [
    Math.round((PAD_X + normX * INNER_W) * 10) / 10,
    Math.round((PAD_Y + normY * INNER_H) * 10) / 10
  ];
}

// Strategic corridor waypoints (Delhi to Kanyakumari along NH44)
const ROUTE_WAYPOINTS = [
  { name: 'Delhi', lat: 28.6139, lon: 77.2090, x: 194, y: 226 },
  { name: 'Agra', lat: 27.1767, lon: 78.0081, x: 209, y: 259 },
  { name: 'Gwalior', lat: 26.2183, lon: 78.1828, x: 213, y: 280 },
  { name: 'Jhansi', lat: 25.4484, lon: 78.5685, x: 220, y: 297 },
  { name: 'Sagar', lat: 23.8388, lon: 78.7378, x: 223, y: 332 },
  { name: 'Nagpur', lat: 21.1458, lon: 79.0882, x: 230, y: 390 },
  { name: 'Adilabad', lat: 19.6641, lon: 78.5320, x: 219, y: 421 },
  { name: 'Hyderabad', lat: 17.3850, lon: 78.4867, x: 218, y: 469 },
  { name: 'Kurnool', lat: 15.8281, lon: 78.0373, x: 210, y: 501 },
  { name: 'Anantapur', lat: 14.6819, lon: 77.6006, x: 202, y: 525 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946, x: 202, y: 560 },
  { name: 'Salem', lat: 11.6643, lon: 78.1460, x: 212, y: 586 },
  { name: 'Madurai', lat: 9.9252, lon: 78.1198, x: 212, y: 621 },
  { name: 'Kanyakumari', lat: 8.0883, lon: 77.5385, x: 200, y: 658 }
];

// Offline Mesh network city coordinates
const MESH_CITIES = [
  { name: 'Delhi', x: 194, y: 226 },
  { name: 'Mumbai', x: 112, y: 433 },
  { name: 'Hyderabad', x: 218, y: 469 },
  { name: 'Bengaluru', x: 202, y: 560 },
  { name: 'Kolkata', x: 405, y: 359 }
];

let STATIC_COMBINED_INDIA_PATH = '';
try {
  let geojson: any = rawIndiaData;
  if (rawIndiaData && (rawIndiaData as any).type === 'Topology') {
    const objKeys = Object.keys((rawIndiaData as any).objects || {});
    if (objKeys.length > 0) {
      geojson = topojson.feature(rawIndiaData as any, (rawIndiaData as any).objects[objKeys[0]]);
    }
  }

  if (geojson && Array.isArray(geojson.features)) {
    const coordsToD = (coords: any, type: string): string => {
      if (type === 'Polygon') {
        return coords
          .map((ring: number[][]) => {
            return ring
              .map((pt, i) => `${i === 0 ? 'M' : 'L'}${project(pt[0], pt[1]).join(',')}`)
              .join(' ') + ' Z';
          })
          .join(' ');
      }
      if (type === 'MultiPolygon') {
        return coords
          .map((poly: number[][][]) => {
            return poly
              .map((ring: number[][]) => {
                return ring
                  .map((pt, i) => `${i === 0 ? 'M' : 'L'}${project(pt[0], pt[1]).join(',')}`)
                  .join(' ') + ' Z';
              })
              .join(' ');
          })
          .join(' ');
      }
      return '';
    };

    const paths: string[] = [];
    for (let i = 0; i < geojson.features.length; i++) {
      const f = geojson.features[i];
      if (f.geometry && f.geometry.coordinates) {
        paths.push(coordsToD(f.geometry.coordinates, f.geometry.type));
      }
    }
    STATIC_COMBINED_INDIA_PATH = paths.join(' ');
  }
} catch {
  STATIC_COMBINED_INDIA_PATH = '';
}

const STATIC_ROUTE_SVG_PATH = ROUTE_WAYPOINTS.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`).join(' ');

export const IntroScreen: React.FC<IntroScreenProps> = ({ onComplete, isAuthReady }) => {
  const shouldReduceMotion = useReducedMotion();

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

  // Premium, satisfying duration: 1800ms for fresh loads, 250ms for repeat visits
  const totalDuration = isSessionQuick ? 250 : 1800;

  const [elapsed, setElapsed] = useState(0);
  const [isAnimationFinished, setIsAnimationFinished] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isSkipped, setIsSkipped] = useState(false);
  const [systemTime, setSystemTime] = useState<string>('00:00:00');

  // Real-time digital clock ticker for HUD aesthetic
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setSystemTime(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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

  // Cinematic Narrative Acts
  // Act 1 (Tactical Grid Scanning): 0% - 30% (0 - 540ms)
  // Act 2 (Offline Mesh Connection): 30% - 65% (540 - 1170ms)
  // Act 3 (Corridor Mapping & Core Logo Resolve): 65% - 100% (1170 - 1800ms)
  const currentAct = useMemo<'act1' | 'act2' | 'act3'>(() => {
    if (isSkipped || isSessionQuick || shouldReduceMotion) return 'act3';
    if (elapsed < 540) return 'act1';
    if (elapsed < 1170) return 'act2';
    return 'act3';
  }, [elapsed, isSkipped, isSessionQuick, shouldReduceMotion]);

  // Radar sweep angle
  const radarSweepAngle = useMemo(() => {
    const progress = Math.min(1, elapsed / totalDuration);
    return progress * 720; // 2 full rotations
  }, [elapsed, totalDuration]);

  // Neon NH44 corridor draw progress
  const routeProgress = useMemo(() => {
    if (isSkipped || isSessionQuick || shouldReduceMotion) return 1;
    if (elapsed < 1100) return 0;
    return Math.min(1, (elapsed - 1100) / 600);
  }, [elapsed, isSkipped, isSessionQuick, shouldReduceMotion]);

  // Simulated system log stream matched with progress bar
  const systemLog = useMemo(() => {
    const progress = (elapsed / totalDuration) * 100;
    if (progress < 15) return '>> BOOTING SECURE ENCRYPTED TRANSPONDER...';
    if (progress < 30) return '>> CHECKING LOCAL INDEXEDDB SECURE STORAGE...';
    if (progress < 45) return '>> LOADED 114 OFFLINE MAP TILES [OK]';
    if (progress < 60) return '>> ESTABLISHING PEER MESH HANDSHAKE INTERFACE...';
    if (progress < 75) return '>> ACQUIRING GPS SATELLITE FIX ON AP/TS CORRIDORS...';
    if (progress < 90) return '>> SYNCING EMERGENCY BROADCAST DECK...';
    return '>> SECURITY HANDSHAKE OK. LAUNCHING PATHSUCHAK...';
  }, [elapsed, totalDuration]);

  const liveCoordinates = useMemo(() => {
    if (routeProgress <= 0) {
      return { lat: ROUTE_WAYPOINTS[0].lat, lon: ROUTE_WAYPOINTS[0].lon };
    }
    if (routeProgress >= 1) {
      const last = ROUTE_WAYPOINTS[ROUTE_WAYPOINTS.length - 1];
      return { lat: last.lat, lon: last.lon };
    }
    const totalSegments = ROUTE_WAYPOINTS.length - 1;
    const scaled = routeProgress * totalSegments;
    const idx = Math.floor(scaled);
    const fraction = scaled - idx;
    const pA = ROUTE_WAYPOINTS[idx];
    const pB = ROUTE_WAYPOINTS[Math.min(idx + 1, totalSegments)];
    return {
      lat: pA.lat + (pB.lat - pA.lat) * fraction,
      lon: pA.lon + (pB.lon - pA.lon) * fraction
    };
  }, [routeProgress]);

  const routeHeadPosition = useMemo(() => {
    if (routeProgress <= 0) return { x: ROUTE_WAYPOINTS[0].x, y: ROUTE_WAYPOINTS[0].y };
    const totalSegments = ROUTE_WAYPOINTS.length - 1;
    const scaled = routeProgress * totalSegments;
    const idx = Math.floor(scaled);
    const fraction = scaled - idx;
    const pA = ROUTE_WAYPOINTS[idx];
    const pB = ROUTE_WAYPOINTS[Math.min(idx + 1, totalSegments)];
    return {
      x: pA.x + (pB.x - pA.x) * fraction,
      y: pA.y + (pB.y - pA.y) * fraction
    };
  }, [routeProgress]);

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
      <div className="relative z-10 w-full flex-1 max-h-[50vh] sm:max-h-[55vh] flex items-center justify-center overflow-hidden my-auto">
        <div className="relative w-full h-full max-w-[460px] sm:max-w-[520px] flex items-center justify-center">
          
          {/* Main Map SVG Grid */}
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full h-full overflow-visible transition-all duration-700 ease-out"
            style={{
              opacity: currentAct === 'act3' ? 0.28 : 0.95,
              transform: currentAct === 'act3' ? 'scale(0.96)' : 'scale(1.0)'
            }}
          >
            <defs>
              <radialGradient id="hologram-pulse" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(56, 189, 248, 0.4)" />
                <stop offset="60%" stopColor="rgba(56, 189, 248, 0.08)" />
                <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
              </radialGradient>
              <filter id="vector-glow" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Radar Circular Scope Rings */}
            <circle cx="280" cy="360" r="300" fill="none" stroke="rgba(56, 189, 248, 0.07)" strokeWidth="1" />
            <circle cx="280" cy="360" r="220" fill="none" stroke="rgba(56, 189, 248, 0.05)" strokeWidth="0.8" />
            <circle cx="280" cy="360" r="140" fill="none" stroke="rgba(56, 189, 248, 0.05)" strokeWidth="0.5" strokeDasharray="3 4" />

            {/* Rotating Diagnostic Scanning Line (Act 1 & 2) */}
            {(currentAct === 'act1' || currentAct === 'act2') && (
              <g transform={`rotate(${radarSweepAngle} 280 360)`}>
                <line
                  x1="280"
                  y1="360"
                  x2="580"
                  y2="360"
                  stroke="#38bdf8"
                  strokeWidth="1.8"
                  opacity="0.85"
                  style={{ filter: 'url(#vector-glow)' }}
                />
                <polygon
                  points="280,360 580,360 570,410"
                  fill="url(#hologram-pulse)"
                  opacity="0.45"
                />
              </g>
            )}

            {/* India Topological Vector Outline */}
            {STATIC_COMBINED_INDIA_PATH && (
              <path
                d={STATIC_COMBINED_INDIA_PATH}
                fill="none"
                stroke={currentAct === 'act1' ? 'rgba(56, 189, 248, 0.3)' : '#1e293b'}
                strokeWidth="1.6"
                strokeDasharray={currentAct === 'act1' ? '4 4' : 'none'}
                className="transition-all duration-500 ease-out"
                style={{
                  filter: currentAct === 'act1' ? 'url(#vector-glow)' : 'none'
                }}
              />
            )}

            {/* Mesh Network Connections drawing themselves (Act 2 & 3) */}
            {currentAct !== 'act1' && (
              <g opacity={currentAct === 'act3' ? 0.35 : 0.9} className="transition-opacity duration-500">
                <line x1={MESH_CITIES[0].x} y1={MESH_CITIES[0].y} x2={MESH_CITIES[1].x} y2={MESH_CITIES[1].y} stroke="#10b981" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.7" />
                <line x1={MESH_CITIES[1].x} y1={MESH_CITIES[1].y} x2={MESH_CITIES[2].x} y2={MESH_CITIES[2].y} stroke="#10b981" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.7" />
                <line x1={MESH_CITIES[2].x} y1={MESH_CITIES[2].y} x2={MESH_CITIES[3].x} y2={MESH_CITIES[3].y} stroke="#10b981" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.7" />
                <line x1={MESH_CITIES[0].x} y1={MESH_CITIES[0].y} x2={MESH_CITIES[4].x} y2={MESH_CITIES[4].y} stroke="#10b981" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.7" />
                
                {MESH_CITIES.map((c, i) => (
                  <g key={`mesh-node-${i}`} transform={`translate(${c.x}, ${c.y})`}>
                    <circle r="4" fill="#10b981" />
                    <circle r="8" fill="none" stroke="#10b981" strokeWidth="1.2" opacity="0.4" className="animate-ping" style={{ animationDuration: '1.6s' }} />
                  </g>
                ))}
              </g>
            )}

            {/* NH44 Road Corridor Drawing Animation (Act 3) */}
            {currentAct === 'act3' && (
              <g>
                {/* Underglow base */}
                <path
                  d={STATIC_ROUTE_SVG_PATH}
                  fill="none"
                  stroke="rgba(255, 122, 26, 0.15)"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Active Core Route drawing */}
                <motion.path
                  d={STATIC_ROUTE_SVG_PATH}
                  fill="none"
                  stroke="#ff7a1a"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: routeProgress }}
                  transition={{ ease: 'easeOut', duration: 0.15 }}
                  style={{ filter: 'url(#vector-glow)' }}
                />
                {/* Animated active tracer bead */}
                <g transform={`translate(${routeHeadPosition.x}, ${routeHeadPosition.y})`}>
                  <circle r="12" fill="none" stroke="#ff7a1a" strokeWidth="1.5" className="animate-ping" />
                  <circle r="6" fill="#ff7a1a" />
                  <circle r="2.5" fill="#ffffff" />
                </g>
              </g>
            )}
          </svg>

          {/* Core Resolve: Glowing signpost Hex Logo resolving exactly in top zone */}
          {currentAct === 'act3' && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.82, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center">
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
            </motion.div>
          )}
        </div>
      </div>

      {/* ZONE 2: Text Blocks & Cinematic Branding */}
      <div className="relative z-20 w-full flex flex-col items-center justify-center text-center px-4 py-2 my-auto min-h-[140px] max-w-xl">
        
        {/* Sliding Wordmark with beautiful spacing */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: currentAct === 'act3' ? 1 : 0, y: currentAct === 'act3' ? 0 : 12 }}
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

          {/* Animated Line 2 (Resolves on act 3) */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{
              opacity: currentAct === 'act3' ? 1 : 0,
              y: currentAct === 'act3' ? 0 : 6
            }}
            transition={{ duration: 0.5 }}
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
