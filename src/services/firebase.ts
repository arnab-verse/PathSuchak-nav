import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  updateProfile,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  deleteDoc,
  Unsubscribe
} from 'firebase/firestore';
import { IncidentReport, SyncQueueItem, UserProfile, SOSEvent, DownloadedRoutePackage, GPSPosition } from '../types';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Initialize Firebase App
const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use custom Firestore Database ID if specified
const databaseId = firebaseConfigJson.firestoreDatabaseId && firebaseConfigJson.firestoreDatabaseId !== '(default)'
  ? firebaseConfigJson.firestoreDatabaseId
  : undefined;

export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

/* =========================================================================
   USER-SCOPED FIRESTORE DATABASE SERVICE
   All history and records are strictly segregated under /users/{userId}
   ========================================================================= */

/**
 * Save or update user profile document at /users/{userId}
 */
export async function saveUserProfileToFirestore(profile: UserProfile): Promise<void> {
  if (!profile.uid) return;
  const userRef = doc(db, 'users', profile.uid);
  await setDoc(userRef, {
    ...profile,
    lastLoginAt: new Date().toISOString()
  }, { merge: true });
}

/**
 * Fetch user profile from /users/{userId}
 */
export async function getUserProfileFromFirestore(uid: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
  } catch (err) {
    console.warn('[Firebase] Failed to fetch user profile:', err);
  }
  return null;
}

/**
 * Save an incident to the user's isolated subcollection: /users/{userId}/incidents/{report_id}
 */
export async function saveUserIncidentToFirestore(userId: string, incident: IncidentReport): Promise<void> {
  if (!userId || !incident.report_id) return;
  const incidentRef = doc(db, 'users', userId, 'incidents', incident.report_id);
  
  // Clean payload for Firestore (no raw Blobs)
  const cleanIncident = {
    ...incident,
    user_id: userId,
    photo_attachments: incident.photo_attachments?.map(p => ({
      id: p.id,
      report_id: p.report_id,
      name: p.name,
      sizeBytes: p.sizeBytes,
      originalSizeBytes: p.originalSizeBytes,
      mimeType: p.mimeType,
      isCompressed: p.isCompressed,
      compressionRatio: p.compressionRatio,
      isUploaded: p.isUploaded,
      timestamp: p.timestamp,
      dataUrl: p.dataUrl ? p.dataUrl.slice(0, 1000) : '' // avoid exceeding document limits
    })) || []
  };

  await setDoc(incidentRef, cleanIncident, { merge: true });
}

/**
 * Delete an incident from the user's subcollection: /users/{userId}/incidents/{report_id}
 */
export async function deleteUserIncidentFromFirestore(userId: string, reportId: string): Promise<void> {
  if (!userId || !reportId) return;
  const incidentRef = doc(db, 'users', userId, 'incidents', reportId);
  await deleteDoc(incidentRef);
}

/**
 * Real-time listener for the active user's incident records
 */
export function subscribeToUserIncidents(
  userId: string, 
  onUpdate: (incidents: IncidentReport[]) => void
): Unsubscribe {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const incidentsCol = collection(db, 'users', userId, 'incidents');
  return onSnapshot(incidentsCol, (snapshot) => {
    const incidents: IncidentReport[] = [];
    snapshot.forEach((docSnap) => {
      incidents.push(docSnap.data() as IncidentReport);
    });
    // Sort by timestamp desc
    incidents.sort((a, b) => b.timestamp - a.timestamp);
    onUpdate(incidents);
  }, (err) => {
    console.warn('[Firebase] Incident subscription error:', err);
  });
}

/**
 * Save sync queue telemetry item to user's subcollection: /users/{userId}/sync_logs/{id}
 */
export async function saveUserSyncItemToFirestore(userId: string, item: SyncQueueItem): Promise<void> {
  if (!userId || !item.id) return;
  const logRef = doc(db, 'users', userId, 'sync_logs', item.id);
  await setDoc(logRef, {
    ...item,
    user_id: userId,
    lastUpdated: Date.now()
  }, { merge: true });
}

/**
 * Real-time listener for user's sync transactions
 */
export function subscribeToUserSyncLogs(
  userId: string,
  onUpdate: (items: SyncQueueItem[]) => void
): Unsubscribe {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const syncLogsCol = collection(db, 'users', userId, 'sync_logs');
  return onSnapshot(syncLogsCol, (snapshot) => {
    const items: SyncQueueItem[] = [];
    snapshot.forEach((docSnap) => {
      items.push(docSnap.data() as SyncQueueItem);
    });
    items.sort((a, b) => b.timestamp - a.timestamp);
    onUpdate(items);
  }, (err) => {
    console.warn('[Firebase] Sync logs subscription error:', err);
  });
}

/**
 * Save active SOS record to user subcollection: /users/{userId}/sos_history/{id}
 */
export async function saveUserSOSToFirestore(userId: string, sos: SOSEvent): Promise<void> {
  if (!userId || !sos.id) return;
  const sosRef = doc(db, 'users', userId, 'sos_history', sos.id);
  await setDoc(sosRef, {
    ...sos,
    user_id: userId,
    recordedAt: Date.now()
  }, { merge: true });
}

/**
 * Save a downloaded route to user's isolated subcollection: /users/{userId}/downloaded_routes/{routeId}
 */
export async function saveUserDownloadedRouteToFirestore(userId: string, routePkg: DownloadedRoutePackage): Promise<void> {
  if (!userId || !routePkg.id) return;
  const routeRef = doc(db, 'users', userId, 'downloaded_routes', routePkg.id);
  await setDoc(routeRef, {
    ...routePkg,
    user_id: userId,
    lastSyncedAt: Date.now()
  }, { merge: true });
}

/**
 * Delete a downloaded route from user's subcollection: /users/{userId}/downloaded_routes/{routeId}
 */
export async function deleteUserDownloadedRouteFromFirestore(userId: string, routeId: string): Promise<void> {
  if (!userId || !routeId) return;
  const routeRef = doc(db, 'users', userId, 'downloaded_routes', routeId);
  await deleteDoc(routeRef);
}

/**
 * Real-time listener for user's downloaded routes
 */
export function subscribeToUserDownloadedRoutes(
  userId: string,
  onUpdate: (routes: DownloadedRoutePackage[]) => void
): Unsubscribe {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const routesCol = collection(db, 'users', userId, 'downloaded_routes');
  return onSnapshot(routesCol, (snapshot) => {
    const routes: DownloadedRoutePackage[] = [];
    snapshot.forEach((docSnap) => {
      routes.push(docSnap.data() as DownloadedRoutePackage);
    });
    routes.sort((a, b) => b.downloadedAt - a.downloadedAt);
    onUpdate(routes);
  }, (err) => {
    console.warn('[Firebase] Downloaded routes subscription error:', err);
  });
}

/**
 * Save Route Log (GPS tracks/breadcrumbs) to user document: /users/{userId}/route_logs/current
 */
export async function saveUserRouteLogToFirestore(userId: string, tracks: GPSPosition[]): Promise<void> {
  if (!userId) return;
  const logRef = doc(db, 'users', userId, 'route_logs', 'current');
  await setDoc(logRef, {
    tracks: tracks.slice(-500),
    totalPoints: tracks.length,
    lastUpdated: Date.now(),
    user_id: userId
  }, { merge: true });
}

/**
 * Real-time listener for user's Route Log
 */
export function subscribeToUserRouteLogs(
  userId: string,
  onUpdate: (tracks: GPSPosition[]) => void
): Unsubscribe {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const logRef = doc(db, 'users', userId, 'route_logs', 'current');
  return onSnapshot(logRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (Array.isArray(data.tracks)) {
        onUpdate(data.tracks as GPSPosition[]);
      }
    }
  }, (err) => {
    console.warn('[Firebase] Route log subscription error:', err);
  });
}

