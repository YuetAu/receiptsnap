
// src/contexts/auth-context.tsx
'use client';

import type { ReactNode} from 'react';
import { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { AppUser, UserProfile, UserRole } from '@/types/user';
import { toAppUser } from '@/types/user';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  error: Error | null;
  refreshUserProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUserProfile = async (firebaseUser: FirebaseUser): Promise<AppUser> => {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    try {
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userProfileData = userDocSnap.data() as UserProfile;
        return toAppUser(firebaseUser, {
          companyId: userProfileData.companyId,
          role: userProfileData.role,
        });
      } else {
        // If no profile, return basic user from auth
        console.warn(`User profile not found in Firestore for UID: ${firebaseUser.uid}. This might be a new user or data inconsistency.`);
        return toAppUser(firebaseUser);
      }
    } catch (e) {
      console.error('Error fetching user profile:', e);
      setError(e as Error);
      return toAppUser(firebaseUser); // Fallback to basic user info
    }
  };
  
  const refreshUserProfile = async () => {
    const currentFirebaseUser = auth.currentUser;
    if (currentFirebaseUser) {
      setLoading(true);
      const updatedUser = await fetchUserProfile(currentFirebaseUser);
      setUser(updatedUser);
      setLoading(false);
    }
  }


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser: FirebaseUser | null) => {
        if (firebaseUser) {
          const appUser = await fetchUserProfile(firebaseUser);
          setUser(appUser);
        } else {
          setUser(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Auth state change error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);


  return (
    <AuthContext.Provider value={{ user, loading, error, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
