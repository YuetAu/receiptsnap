
// src/contexts/auth-context.tsx
'use client';

import type { ReactNode } from 'react';
import { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import type { AppUser } from '@/types/user';
import { toAppUser } from '@/types/user';
import { Loader2 } from 'lucide-react';

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

  // Show a full-page loader while auth state is being determined initially
  if (loading && typeof window !== 'undefined') {
    // Check for window to prevent SSR issues with initial loading state
    const path = window.location.pathname;
    if (path !== '/login' && path !== '/register') {
        return (
            <div className="flex justify-center items-center h-screen w-screen bg-background">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          );
    }
  }


  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}
