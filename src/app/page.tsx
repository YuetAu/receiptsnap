
// src/app/page.tsx
'use client'; // page.tsx now needs to be client component for AuthGuard HOC or similar patterns

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ExpenseForm } from "@/components/expense-form";
import { ExpenseHistory } from "@/components/expense-history";
import { FilePlus2, History } from "lucide-react";

// AuthGuard will handle redirect if not logged in.
// If you prefer specific content for non-logged-in users on this page,
// you'd use useAuth() here and conditionally render.
// For simplicity, AuthGuard handles the protection.

export default function HomePage() {
  return (
    <div className="w-full">
      <Tabs defaultValue="new-expense" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-1/2 mx-auto mb-8 bg-secondary p-1 rounded-lg">
          <TabsTrigger value="new-expense" className="py-2.5 text-sm md:text-base data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-md rounded-md flex items-center justify-center gap-2">
            <FilePlus2 size={18}/> New Expense
          </TabsTrigger>
          <TabsTrigger value="history" className="py-2.5 text-sm md:text-base data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-md rounded-md flex items-center justify-center gap-2">
            <History size={18}/> Expense History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="new-expense">
          <ExpenseForm />
        </TabsContent>
        <TabsContent value="history">
          <ExpenseHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

