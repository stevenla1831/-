import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, auth, signInAnonymously } from './firebase';
import { UserProfile } from './types';
import liff from '@line/liff';
import { LIFF_ID } from './constants';

interface AuthContextType {
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  isAuthReady: false,
});

const PROFILE_CACHE_KEY = 'wdys_profile_v1';

function loadCachedProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function saveProfileCache(p: UserProfile) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)); } catch {}
}

function clearProfileCache() {
  try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cached = loadCachedProfile();
  const [profile, setProfile] = useState<UserProfile | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [isAuthReady, setIsAuthReady] = useState(!!cached);
  const profileUnsub = useRef<(() => void) | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });

        if (!liff.isLoggedIn()) {
          clearProfileCache();
          liff.login();
          return;
        }

        const lineProfile = await liff.getProfile();
        const lineUserId = lineProfile.userId;

        // Sign in anonymously so Firestore rules (request.auth != null) pass
        await signInAnonymously(auth);

        const userDocRef = doc(db, 'users', lineUserId);

        profileUnsub.current = onSnapshot(
          userDocRef,
          async (snap) => {
            if (snap.exists()) {
              const p = snap.data() as UserProfile;
              setProfile(p);
              saveProfileCache(p);
            } else {
              const newProfile: UserProfile = {
                uid: lineUserId,
                displayName: lineProfile.displayName,
                photoURL: lineProfile.pictureUrl || '',
                role: 'user',
                createdAt: Date.now(),
              };
              try {
                await setDoc(userDocRef, newProfile);
                saveProfileCache(newProfile);
              } catch (error) {
                console.error('Failed to create user profile:', error);
              }
            }
            setLoading(false);
            setIsAuthReady(true);
          },
          (error) => {
            console.error('Firestore snapshot error:', error);
            setLoading(false);
            setIsAuthReady(true);
          }
        );
      } catch (err) {
        console.error('Auth init error:', err);
        setLoading(false);
        setIsAuthReady(true);
      }
    };

    initAuth();

    return () => {
      profileUnsub.current?.();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ profile, loading, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
