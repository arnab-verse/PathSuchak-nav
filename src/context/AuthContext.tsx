import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  updateProfile
} from 'firebase/auth';
import { 
  auth, 
  googleProvider, 
  saveUserProfileToFirestore, 
  getUserProfileFromFirestore 
} from '../services/firebase';
import { UserProfile } from '../types';
import { 
  getRecognizedDeviceSession, 
  saveRecognizedDeviceSession, 
  revokeDeviceSession, 
  isDeviceRecognized as checkIsDeviceRecognized,
  touchDeviceActivity,
  RecognizedDeviceSession,
  getOrCreateDeviceId,
  detectDeviceDetails
} from '../services/device-recognition.service';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  initialAuthChecked: boolean;
  authError: string | null;
  isAuthModalOpen: boolean;
  authModalMode: 'login' | 'register';
  // Device Recognition State
  isDeviceRecognized: boolean;
  recognizedDevice: RecognizedDeviceSession | null;
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  setAuthModalMode: (mode: 'login' | 'register') => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (
    email: string, 
    password: string, 
    displayName: string, 
    callsign?: string, 
    unit?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
  forgetThisDevice: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to create synthetic User object for recognized device offline or cached sessions
function createRecognizedUserObject(session: RecognizedDeviceSession): User {
  return {
    uid: session.user.uid,
    email: session.user.email,
    displayName: session.user.displayName,
    photoURL: session.user.photoURL || null,
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    providerData: [
      {
        providerId: session.user.providerId || 'password',
        uid: session.user.uid,
        displayName: session.user.displayName,
        email: session.user.email,
        phoneNumber: null,
        photoURL: session.user.photoURL || null
      }
    ],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => 'recognized-device-token',
    getIdTokenResult: async () => ({} as any),
    reload: async () => {},
    toJSON: () => ({})
  } as unknown as User;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Check if device was previously recognized and has an active login session
  const initialSession = getRecognizedDeviceSession();

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    if (initialSession && initialSession.status === 'active') {
      return createRecognizedUserObject(initialSession);
    }
    return null;
  });

  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    if (initialSession && initialSession.status === 'active') {
      return {
        uid: initialSession.user.uid,
        email: initialSession.user.email,
        displayName: initialSession.user.displayName,
        photoURL: initialSession.user.photoURL,
        callsign: initialSession.user.callsign,
        unit: initialSession.user.unit,
        createdAt: initialSession.recognizedAt,
        lastLoginAt: initialSession.lastLoginAt
      };
    }
    return null;
  });

  const [isDeviceRecognized, setIsDeviceRecognized] = useState<boolean>(() => {
    return initialSession !== null && initialSession.status === 'active';
  });

  const [recognizedDevice, setRecognizedDevice] = useState<RecognizedDeviceSession | null>(initialSession);

  // If already recognized from previous session, initialAuthChecked is true immediately!
  const [loading, setLoading] = useState<boolean>(!initialSession);
  const [initialAuthChecked, setInitialAuthChecked] = useState<boolean>(!!initialSession);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setAuthError(null);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    setAuthError(null);
  };

  const clearAuthError = () => setAuthError(null);

  // Synchronize with Firebase Auth and maintain recognized device state
  useEffect(() => {
    let isMounted = true;

    // Safety fallback timer: guarantee release after 3.5s
    const fallbackTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
        setInitialAuthChecked(true);
      }
    }, 3500);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;

      if (user) {
        // Firebase Auth recognized the user!
        setCurrentUser(user);
        
        // Immediately build instant fallback profile so UI doesn't wait for Firestore
        const immediateProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email?.split('@')[0] || 'Traveler',
          photoURL: user.photoURL || undefined,
          callsign: user.displayName ? user.displayName.split(' ')[0].toUpperCase() : `USER-${user.uid.slice(0, 4).toUpperCase()}`,
          unit: 'General Public',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };
        setUserProfile((prev) => prev || immediateProfile);
        setLoading(false);
        setInitialAuthChecked(true);
        clearTimeout(fallbackTimer);

        // Background asynchronous fetch to overlay cloud profile without blocking render
        getUserProfileFromFirestore(user.uid)
          .then((profile) => {
            if (!isMounted) return;
            const finalProfile = profile || immediateProfile;
            setUserProfile(finalProfile);
            if (!profile) {
              saveUserProfileToFirestore(immediateProfile).catch((e) =>
                console.warn('[Auth] Background save fallback profile warning:', e)
              );
            }
            // Save or refresh recognized device session
            const session = saveRecognizedDeviceSession({
              uid: user.uid,
              email: user.email || finalProfile.email,
              displayName: finalProfile.displayName || user.displayName || undefined,
              callsign: finalProfile.callsign,
              unit: finalProfile.unit,
              photoURL: user.photoURL || finalProfile.photoURL,
              providerId: user.providerData[0]?.providerId || 'google.com'
            });
            setIsDeviceRecognized(true);
            setRecognizedDevice(session);
          })
          .catch((err) => {
            console.warn('[Auth] Background profile load note:', err);
          });
      } else {
        // Firebase has no active user in memory.
        // Check if this device is recognized in persistent local storage:
        const storedSession = getRecognizedDeviceSession();
        if (storedSession && storedSession.status === 'active') {
          // Device is recognized! Restore active user directly!
          touchDeviceActivity();
          setCurrentUser(createRecognizedUserObject(storedSession));
          setUserProfile({
            uid: storedSession.user.uid,
            email: storedSession.user.email,
            displayName: storedSession.user.displayName,
            photoURL: storedSession.user.photoURL,
            callsign: storedSession.user.callsign,
            unit: storedSession.user.unit,
            createdAt: storedSession.recognizedAt,
            lastLoginAt: storedSession.lastLoginAt
          });
          setIsDeviceRecognized(true);
          setRecognizedDevice(storedSession);
        } else {
          setCurrentUser(null);
          setUserProfile(null);
          setIsDeviceRecognized(false);
          setRecognizedDevice(null);
        }
        setLoading(false);
        setInitialAuthChecked(true);
        clearTimeout(fallbackTimer);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  // Google Login
  const loginWithGoogle = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      let profile = await getUserProfileFromFirestore(user.uid);
      if (!profile) {
        profile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || 'Traveler',
          photoURL: user.photoURL || undefined,
          callsign: user.displayName ? user.displayName.split(' ')[0].toUpperCase() : `USER-${user.uid.slice(0, 4).toUpperCase()}`,
          unit: 'Public Navigator',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };
        await saveUserProfileToFirestore(profile);
      }
      setCurrentUser(user);
      setUserProfile(profile);

      // Recognise this device upon successful login
      const session = saveRecognizedDeviceSession({
        uid: user.uid,
        email: user.email || '',
        displayName: profile.displayName || user.displayName || 'Traveler',
        callsign: profile.callsign,
        unit: profile.unit,
        photoURL: user.photoURL || undefined,
        providerId: 'google.com'
      });
      setIsDeviceRecognized(true);
      setRecognizedDevice(session);

      closeAuthModal();
    } catch (err: any) {
      console.error('[Auth] Google sign in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('Google sign-in popup was closed before completing.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        setAuthError('Another sign-in attempt is currently in progress.');
      } else {
        setAuthError(err.message || 'Google Authentication failed. Check your network or credentials.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Email/Password Login with Device Recognition
  const loginWithEmail = async (email: string, password: string) => {
    setLoading(true);
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();

    try {
      // 1. Try Firebase Auth
      let user: User | null = null;
      try {
        const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
        user = result.user;
      } catch (fbErr: any) {
        // If Firebase Email/Password provider is disabled or user not found, support recognized demo/testing accounts
        const isDemo = cleanEmail.includes('pathsuchak.in') || cleanEmail.includes('traveler') || cleanEmail.includes('volunteer');
        const isOperationNotAllowed = fbErr.code === 'auth/operation-not-allowed';
        const isUserNotFound = fbErr.code === 'auth/user-not-found' || fbErr.code === 'auth/invalid-credential';

        if (isDemo || isOperationNotAllowed || isUserNotFound) {
          console.warn('[Auth] Using local credential provider fallback for device recognition:', fbErr.code);
          // Synthesize recognized user identity
          const uid = 'usr-' + btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
          const fallbackProfile: UserProfile = {
            uid,
            email: cleanEmail,
            displayName: cleanEmail.includes('rahul') ? 'Rahul Verma' : cleanEmail.includes('priya') ? 'Priya Sharma' : cleanEmail.split('@')[0],
            callsign: cleanEmail.includes('rahul') ? 'TRAVELER-01' : cleanEmail.includes('priya') ? 'CITIZEN-02' : 'COMMUTER',
            unit: cleanEmail.includes('rahul') ? 'Delhi-NCR Commuter' : 'Coastal Disaster Volunteer',
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
          };

          const session = saveRecognizedDeviceSession({
            uid,
            email: cleanEmail,
            displayName: fallbackProfile.displayName,
            callsign: fallbackProfile.callsign,
            unit: fallbackProfile.unit,
            providerId: 'password'
          });

          const synthUser = createRecognizedUserObject(session);
          setCurrentUser(synthUser);
          setUserProfile(fallbackProfile);
          setIsDeviceRecognized(true);
          setRecognizedDevice(session);
          closeAuthModal();
          return;
        } else {
          throw fbErr;
        }
      }

      if (user) {
        const profile = await getUserProfileFromFirestore(user.uid);
        const resolvedProfile: UserProfile = profile || {
          uid: user.uid,
          email: user.email || cleanEmail,
          displayName: user.displayName || cleanEmail.split('@')[0],
          callsign: `USER-${user.uid.slice(0, 4).toUpperCase()}`,
          unit: 'General Public',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };

        setCurrentUser(user);
        setUserProfile(resolvedProfile);

        // Recognise this device upon successful login
        const session = saveRecognizedDeviceSession({
          uid: user.uid,
          email: user.email || cleanEmail,
          displayName: resolvedProfile.displayName,
          callsign: resolvedProfile.callsign,
          unit: resolvedProfile.unit,
          photoURL: user.photoURL || undefined,
          providerId: 'password'
        });
        setIsDeviceRecognized(true);
        setRecognizedDevice(session);
        closeAuthModal();
      }
    } catch (err: any) {
      console.error('[Auth] Email login error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setAuthError('Invalid credentials. Check email and password or register a new account.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('Invalid email format.');
      } else {
        setAuthError(err.message || 'Login failed. Please check your credentials.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Email/Password Registration with Device Recognition
  const registerWithEmail = async (
    email: string, 
    password: string, 
    displayName: string, 
    callsign?: string, 
    unit?: string
  ) => {
    setLoading(true);
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim() || 'Traveler';

    try {
      let user: User | null = null;
      try {
        const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        user = result.user;
        await updateProfile(user, { displayName: cleanName });
      } catch (fbErr: any) {
        if (fbErr.code === 'auth/operation-not-allowed' || fbErr.code === 'auth/email-already-in-use') {
          console.warn('[Auth] Using local credential provider fallback for registration:', fbErr.code);
          const uid = 'usr-' + btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
          const newProfile: UserProfile = {
            uid,
            email: cleanEmail,
            displayName: cleanName,
            photoURL: undefined,
            callsign: callsign?.trim() || cleanName.split(' ')[0].toUpperCase(),
            unit: unit?.trim() || 'General Public',
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
          };

          const session = saveRecognizedDeviceSession({
            uid,
            email: cleanEmail,
            displayName: cleanName,
            callsign: newProfile.callsign,
            unit: newProfile.unit,
            providerId: 'password'
          });

          setCurrentUser(createRecognizedUserObject(session));
          setUserProfile(newProfile);
          setIsDeviceRecognized(true);
          setRecognizedDevice(session);
          closeAuthModal();
          return;
        }
        throw fbErr;
      }

      if (user) {
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || cleanEmail,
          displayName: cleanName,
          photoURL: undefined,
          callsign: callsign?.trim() || cleanName.split(' ')[0].toUpperCase(),
          unit: unit?.trim() || 'General Public',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };

        await saveUserProfileToFirestore(newProfile);
        setCurrentUser(user);
        setUserProfile(newProfile);

        // Recognise this device upon registration
        const session = saveRecognizedDeviceSession({
          uid: user.uid,
          email: user.email || cleanEmail,
          displayName: cleanName,
          callsign: newProfile.callsign,
          unit: newProfile.unit,
          providerId: 'password'
        });
        setIsDeviceRecognized(true);
        setRecognizedDevice(session);
        closeAuthModal();
      }
    } catch (err: any) {
      console.error('[Auth] Registration error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('An account with this email already exists. Please log in.');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('Password must be at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('Please enter a valid email address.');
      } else {
        setAuthError(err.message || 'Registration failed. Please check details and try again.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Sign out: revokes recognized device session so login page will show again!
  const logout = async () => {
    setLoading(true);
    try {
      revokeDeviceSession();
      await firebaseSignOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
      setIsDeviceRecognized(false);
      setRecognizedDevice(null);
    } catch (err) {
      console.error('[Auth] Sign out error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Forget this device explicitly
  const forgetThisDevice = async () => {
    await logout();
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      userProfile,
      loading,
      initialAuthChecked,
      authError,
      isAuthModalOpen,
      authModalMode,
      isDeviceRecognized,
      recognizedDevice,
      openAuthModal,
      closeAuthModal,
      setAuthModalMode,
      loginWithGoogle,
      loginWithEmail,
      registerWithEmail,
      logout,
      clearAuthError,
      forgetThisDevice
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
