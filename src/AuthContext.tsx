import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile } from './types';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  // Hold reference to the Firestore profile listener so we can unsubscribe
  const profileUnsub = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Tear down any previous profile listener
      profileUnsub.current?.();
      profileUnsub.current = null;

      setUser(firebaseUser);

      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);

        // Subscribe to real-time profile updates so any write (e.g. phone binding,
        // role change by admin) is immediately reflected throughout the app.
        profileUnsub.current = onSnapshot(
          userDocRef,
          async (snap) => {
            if (snap.exists()) {
              setProfile(snap.data() as UserProfile);
            } else {
              // First-ever login: create the user document
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                displayName: firebaseUser.displayName || 'Anonymous',
                photoURL: firebaseUser.photoURL || '',
                role: 'user',
                createdAt: Date.now(),
              };
              try {
                await setDoc(userDocRef, newProfile);
                // onSnapshot will fire again with the new doc — no need to setProfile here
              } catch (error) {
                handleFirestoreError(error, OperationType.CREATE, `users/${firebaseUser.uid}`);
              }
            }
            setLoading(false);
            setIsAuthReady(true);
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            setLoading(false);
            setIsAuthReady(true);
          }
        );
      } else {
        setProfile(null);
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsubAuth();
      profileUnsub.current?.();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
