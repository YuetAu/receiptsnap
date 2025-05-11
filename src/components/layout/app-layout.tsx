
// src/components/layout/app-layout.tsx
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ScanBarcode, LogOut, UserCircle, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"


interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Optionally, show a toast message for logout failure
    }
  };
  
  // Don't render full layout on login/register pages for a cleaner UI
  if (pathname === '/login' || pathname === '/register') {
    return (
      <div className="min-h-screen flex flex-col bg-secondary">
        <main className="flex-grow container mx-auto px-4 py-8 flex justify-center items-center">
          {children}
        </main>
      </div>
    );
  }


  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-primary-foreground shadow-md">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <ScanBarcode className="h-8 w-8 mr-3" />
            <h1 className="text-2xl font-bold">ReceiptSnap</h1>
          </Link>
          <div>
            {!loading && user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground">
                    <UserCircle size={20} />
                    <span>{user.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {/* Add more items here like 'Profile', 'Settings' if needed */}
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!loading && !user && (
              <div className="space-x-2">
                <Button variant="ghost" asChild className="text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground">
                  <Link href="/login">Login</Link>
                </Button>
                <Button variant="secondary" asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link href="/register" className="flex items-center gap-1"> <UserPlus size={16}/> Register</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-grow container mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="py-4 text-center text-muted-foreground text-sm">
        © {new Date().getFullYear()} ReceiptSnap. All rights reserved.
      </footer>
    </div>
  );
}
