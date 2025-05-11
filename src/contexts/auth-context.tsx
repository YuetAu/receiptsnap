
// src/contexts/auth-context.tsx
'use client';

import type { ReactNode } from 'react';
import { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import type { AppUser } from '@/types/user';
import { toAppUser } from '@/types/user';
// import { Loader2 } from 'lucide-react'; // Loader2 no longer used directly here

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  error: Error | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser: FirebaseUser | null) => {
        if (firebaseUser) {
          setUser(toAppUser(firebaseUser));
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

  // The AuthGuard component, a consumer of this context, already handles displaying a loader
  // when `loading` is true. Removing the loader from here simplifies and fixes hydration issues
  // as this loader was conditional on `typeof window !== 'undefined'`.
  // Initial loading state before AuthGuard kicks in is handled by AuthGuard's own loader.
  // If `loading` is true, `AuthGuard` will show its loader.

  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

