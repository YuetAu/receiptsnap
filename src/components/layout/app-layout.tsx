import type { ReactNode } from 'react';
import { ScanBarcode } from 'lucide-react';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-primary-foreground shadow-md">
        <div className="container mx-auto px-4 py-4 flex items-center">
          <ScanBarcode className="h-8 w-8 mr-3" />
          <h1 className="text-2xl font-bold">ReceiptSnap</h1>
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
