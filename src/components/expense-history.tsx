'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getExpenses } from '@/actions/expense-actions';
import type { Expense } from '@/types/expense';
import { CategoryIcon } from './category-icon';
import { format } from 'date-fns';
import { RefreshCw, Loader2 } from 'lucide-react';

export function ExpenseHistory() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, startRefreshTransition] = useTransition();

  const fetchExpenses = async () => {
    setIsLoading(true);
    const fetchedExpenses = await getExpenses();
    // Ensure createdAt is a Date object for formatting
    const processedExpenses = fetchedExpenses.map(exp => ({
      ...exp,
      createdAt: exp.createdAt && typeof exp.createdAt.toDate === 'function' 
        ? exp.createdAt.toDate() 
        : new Date(), // Fallback if conversion fails
    }));
    setExpenses(processedExpenses);
    setIsLoading(false);
  };
  
  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleRefresh = () => {
    startRefreshTransition(async () => {
      await fetchExpenses();
    });
  };

  if (isLoading && expenses.length === 0) {
    return (
      <Card className="shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between">
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


  return (
    <Card className="shadow-xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-2xl font-semibold">Expense History</CardTitle>
        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing || isLoading}>
          {isRefreshing || (isLoading && expenses.length > 0) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 && !isLoading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-lg">No expenses recorded yet.</p>
            <p className="text-sm text-muted-foreground">Upload a receipt to get started!</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] md:h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">
                      {expense.createdAt ? format(new Date(expense.createdAt), 'MMM dd, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell>{expense.company}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize flex items-center gap-1.5 w-fit">
                        <CategoryIcon category={expense.category} size={14} />
                        {expense.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${expense.totalAmount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
