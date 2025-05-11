
// src/components/expense-history.tsx
'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getExpenses } from '@/actions/expense-actions';
import type { Expense } from '@/types/expense';
import { CategoryIcon } from './category-icon';
import { format } from 'date-fns';
import { RefreshCw, Loader2, CreditCard, HandCoins, Globe, Package } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth'; // Import useAuth
import { useToast } from '@/hooks/use-toast';

const PaymentMethodIcon = ({ method, ...props }: { method: Expense['paymentMethod'] } & LucideProps) => {
  switch (method) {
    case 'card': return <CreditCard {...props} />;
    case 'cash': return <HandCoins {...props} />;
    case 'online': return <Globe {...props} />;
    default: return <Package {...props} />;
  }
};


export function ExpenseHistory() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const { user, loading: authLoading } = useAuth(); // Get authenticated user
  const { toast } = useToast();

  const fetchExpenses = async () => {
    if (!user) {
      // This case should ideally not be hit frequently if AuthGuard is working
      // but good to have a check.
      setExpenses([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const fetchedExpenses = await getExpenses(user.uid);
      setExpenses(fetchedExpenses);
    } catch (error) {
        console.error("Failed to fetch expenses:", error);
        toast({title: "Error", description: "Could not fetch expense history.", variant: "destructive"})
        setExpenses([]);
    } finally {
        setIsLoading(false);
    }
  };
  
  useEffect(() => {
    if (!authLoading && user) {
      fetchExpenses();
    } else if (!authLoading && !user) {
      // User is not logged in, clear expenses and stop loading
      setExpenses([]);
      setIsLoading(false);
    }
    // Effect dependencies: user, authLoading
  }, [user, authLoading]);

  const handleRefresh = () => {
    if (!user) {
        toast({title: "Not Authenticated", description: "Please log in to refresh expenses.", variant: "destructive"})
        return;
    }
    startRefreshTransition(async () => {
      await fetchExpenses();
    });
  };

  if (authLoading || (isLoading && expenses.length === 0 && user)) {
    return (
      <Card className="shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-2xl font-semibold">Expense History</CardTitle>
          <Button variant="outline" size="icon" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
          </Button>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Loading expenses...</p>
        </CardContent>
      </Card>
    );
  }

  if (!user && !authLoading) {
     return (
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Expense History</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground text-lg">Please log in to view your expense history.</p>
        </CardContent>
      </Card>
     );
  }


  return (
    <Card className="shadow-xl w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-2xl font-semibold">Expense History</CardTitle>
        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing || isLoading || !user}>
          {isRefreshing || isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 && !isLoading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-lg">No expenses recorded yet.</p>
            <p className="text-sm text-muted-foreground">Add a new expense or upload a receipt to get started!</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] md:h-[600px] pr-3">
            <Accordion type="single" collapsible className="w-full">
              {expenses.map((expense) => (
                <AccordionItem value={expense.id!} key={expense.id!} className="border-b border-border last:border-b-0">
                  <AccordionTrigger className="hover:no-underline py-3 px-2 rounded-md hover:bg-secondary/50 text-sm md:text-base">
                    <div className="flex justify-between items-center w-full">
                      <div className="flex items-center gap-3">
                        <CategoryIcon category={expense.category} size={20} className="text-primary" />
                        <div className="flex flex-col items-start">
                           <span className="font-medium text-foreground truncate max-w-[150px] sm:max-w-[250px]">{expense.company}</span>
                           <span className="text-xs text-muted-foreground">
                            {expense.expenseDate ? format(new Date(expense.expenseDate), 'MMM dd, yyyy') : 'N/A'}
                           </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="capitalize flex items-center gap-1.5 w-fit text-xs h-6">
                          <PaymentMethodIcon method={expense.paymentMethod} size={12} />
                          {expense.paymentMethod}
                        </Badge>
                        <span className="font-semibold text-right w-[80px] text-base">
                          ${expense.totalAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="py-3 px-2 bg-secondary/30 rounded-b-md">
                    <div className="text-xs text-muted-foreground mb-2">
                        Recorded on: {expense.createdAt ? format(new Date(expense.createdAt), 'MMM dd, yyyy, p') : 'N/A'}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead>Item</TableHead>
                          <TableHead className="text-center">Qty</TableHead>
                          <TableHead className="text-right">Net Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expense.items.map((item, index) => (
                          <TableRow key={index} className="text-xs">
                            <TableCell className="font-medium py-1.5">{item.name}</TableCell>
                            <TableCell className="text-center py-1.5">{item.quantity}</TableCell>
                            <TableCell className="text-right font-medium py-1.5">${item.netPrice.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="text-right mt-2 font-semibold text-sm pr-4">
                        Category: <Badge variant="secondary" className="capitalize">{expense.category}</Badge>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

