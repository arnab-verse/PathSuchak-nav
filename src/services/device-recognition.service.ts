/**
 * PathSuchak Device Recognition & Persistent Session Service
 * 
 * Manages device fingerprinting, persistent device recognition tokens,
 * and seamless auto-login on trusted/recognized devices unless the user explicitly logs out.
 */

export interface RecognizedDeviceSession {
  deviceId: string;
  deviceName: string;
  platform: string;
  browser: string;
  resolution: string;
  recognizedAt: string;
  lastLoginAt: string;
  isTrusted: boolean;
  status: 'active' | 'logged_out';
  user: {
    uid: string;
    email: string;
    displayName: string;
    callsign: string;
    unit: string;
    photoURL?: string;
    providerId: string;
  };
}

const STORAGE_KEY_SESSION = 'pathsuchak_device_session_v2';
const STORAGE_KEY_DEVICE_ID = 'pathsuchak_persistent_device_id_v2';
const STORAGE_KEY_DEVICE_HISTORY = 'pathsuchak_device_history_v2';

/**
 * Generate or retrieve persistent device UUID
 */
export function getOrCreateDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!deviceId) {
      const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
      const timestampSuffix = Date.now().toString(36).toUpperCase().slice(-4);
      deviceId = `DEV-IN-${randomSuffix}-${timestampSuffix}`;
      localStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
    }
    return deviceId;
  } catch (err) {
    return 'DEV-IN-BROWSER-LOCAL';
  }
}

/**
 * Parse client browser and platform to construct a friendly device name
 */
export function detectDeviceDetails(): {
  deviceName: string;
  platform: string;
  browser: string;
  resolution: string;
} {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const width = typeof window !== 'undefined' ? window.innerWidth : 390;
  const height = typeof window !== 'undefined' ? window.innerHeight : 844;
  const resolution = `${width}x${height}`;

  let platform = 'Unknown OS';
  if (/Android/i.test(ua)) platform = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'iOS';
  else if (/Windows/i.test(ua)) platform = 'Windows PC';
  else if (/Macintosh|Mac OS X/i.test(ua)) platform = 'macOS';
  else if (/Linux/i.test(ua)) platform = 'Linux';

  let browser = 'Web Browser';
  if (/Chrome|CriOS/i.test(ua) && !/Edg|OPR|DuckDuckGo/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) browser = 'Safari';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/OPR|Opera/i.test(ua)) browser = 'Opera';

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const deviceType = isMobile ? 'Mobile' : 'Desktop';
  const deviceName = `${platform} ${browser} (${deviceType})`;

  return { deviceName, platform, browser, resolution };
}

/**
 * Get active recognized session for this device if exists and not logged out
 */
export function getRecognizedDeviceSession(): RecognizedDeviceSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) return null;
    const session: RecognizedDeviceSession = JSON.parse(raw);
    
    // Only return if status is active
    if (session && session.status === 'active' && session.user && session.user.uid) {
      return session;
    }
    return null;
  } catch (err) {
    console.warn('[DeviceRecognition] Failed to read device session:', err);
    return null;
  }
}

/**
 * Check if current device is recognized and has an active login session
 */
export function isDeviceRecognized(): boolean {
  const session = getRecognizedDeviceSession();
  return session !== null && session.status === 'active';
}

/**
 * Save or update recognized device session upon successful login/registration
 */
export function saveRecognizedDeviceSession(user: {
  uid: string;
  email: string;
  displayName?: string;
  callsign?: string;
  unit?: string;
  photoURL?: string;
  providerId?: string;
}): RecognizedDeviceSession {
  const deviceId = getOrCreateDeviceId();
  const { deviceName, platform, browser, resolution } = detectDeviceDetails();
  const now = new Date().toISOString();

  // Check if session existed before
  const existing = getRecognizedDeviceSession();

  const session: RecognizedDeviceSession = {
    deviceId,
    deviceName,
    platform,
    browser,
    resolution,
    recognizedAt: existing?.recognizedAt || now,
    lastLoginAt: now,
    isTrusted: true,
    status: 'active',
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0] || 'Traveler',
      callsign: user.callsign || (user.displayName ? user.displayName.split(' ')[0].toUpperCase() : 'TRAVELER-01'),
      unit: user.unit || 'General Public',
      photoURL: user.photoURL,
      providerId: user.providerId || 'password'
    }
  };

  try {
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));

    // Also append to audit history
    const historyRaw = localStorage.getItem(STORAGE_KEY_DEVICE_HISTORY);
    let history: any[] = [];
    if (historyRaw) {
      try { history = JSON.parse(historyRaw); } catch {}
    }
    // Keep max 5 history entries
    history = [
      {
        deviceId,
        deviceName,
        timestamp: now,
        userId: user.uid,
        action: 'LOGIN_TRUSTED'
      },
      ...history.filter(h => h.deviceId !== deviceId).slice(0, 4)
    ];
    localStorage.setItem(STORAGE_KEY_DEVICE_HISTORY, JSON.stringify(history));
  } catch (err) {
    console.warn('[DeviceRecognition] Failed to write session to localStorage:', err);
  }

  return session;
}

/**
 * Revoke device session on explicit user logout.
 * Keeps device ID intact but clears active credentials so login page comes back.
 */
export function revokeDeviceSession(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    if (raw) {
      const session: RecognizedDeviceSession = JSON.parse(raw);
      session.status = 'logged_out';
      session.lastLoginAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    }
  } catch (err) {
    try {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    } catch {}
  }
}

/**
 * Update the last active heartbeat of the recognized device
 */
export function touchDeviceActivity(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    if (raw) {
      const session: RecognizedDeviceSession = JSON.parse(raw);
      if (session.status === 'active') {
        session.lastLoginAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      }
    }
  } catch {}
}
