
// src/components/auth/auth-guard.tsx
'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && pathname !== '/login' && pathname !== '/register') {
      router.push('/login');
    }
  }, [user, loading, router, pathname]);

  if (loading || (!user && pathname !== '/login' && pathname !== '/register')) {
    // Show loader if loading, or if not authenticated and not on auth pages
     return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // If user is logged in and tries to access login/register, redirect to home
  if (user && (pathname === '/login' || pathname === '/register')) {
    router.push('/');
    return ( // Return loader while redirecting
        <div className="flex justify-center items-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
  }


  return <>{children}</>;
}
