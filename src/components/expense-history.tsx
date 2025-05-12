
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { getExpenses, deleteExpense, updateExpenseStatus } from '@/actions/expense-actions';
import type { Expense, ExpenseStatus } from '@/types/expense';
import { CategoryIcon } from './category-icon';
import { format, parseISO, compareDesc } from 'date-fns';
import { RefreshCw, Loader2, CreditCard, HandCoins, Globe, Package, Trash2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';

type GroupedExpenses = {
  [monthYear: string]: Expense[];
};

const PaymentMethodIcon = ({ method, ...props }: { method: Expense['paymentMethod'] } & LucideProps) => {
  switch (method) {
    case 'card': return <CreditCard {...props} />;
    case 'cash': return <HandCoins {...props} />;
    case 'online': return <Globe {...props} />;
    default: return <Package {...props} />;
  }
};

const StatusBadge = ({ status }: { status: ExpenseStatus }) => {
  switch (status) {
    case 'approved':
      return <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>;
    case 'rejected':
      return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
    case 'pending':
      return <Badge variant="secondary" className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900"><AlertTriangle className="mr-1 h-3 w-3" />Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};


const safeTimestampToDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp && typeof timestamp.seconds === 'number') {
    if (typeof timestamp.toDate === 'function') {
      try { return timestamp.toDate(); }
      catch (error) { 
        const date = new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
        return isNaN(date.getTime()) ? null : date;
      }
    } else {
      const date = new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
      return isNaN(date.getTime()) ? null : date;
    }
  }
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    console.warn("Failed to convert timestamp/date to a valid Date object:", timestamp);
    return null;
  }
  return date;
};


export function ExpenseHistory() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [groupedExpenses, setGroupedExpenses] = useState<GroupedExpenses>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [expenseToModifyId, setExpenseToModifyId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // For delete and status updates


  const fetchAndGroupExpenses = async () => {
    if (!user || !auth.currentUser) {
      setExpenses([]);
      setGroupedExpenses({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const fetchedExpenses = await getExpenses(idToken);
      setExpenses(fetchedExpenses);

      const sortedExpenses = fetchedExpenses.sort((a, b) => {
        const dateA = safeTimestampToDate(a.expenseDate);
        const dateB = safeTimestampToDate(b.expenseDate);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return compareDesc(dateA, dateB);
      });

      const grouped = sortedExpenses.reduce((acc: GroupedExpenses, expense) => {
        const expenseDate = safeTimestampToDate(expense.expenseDate);
        if (expenseDate) {
          const monthYear = format(expenseDate, 'yyyy-MM');
          if (!acc[monthYear]) acc[monthYear] = [];
          acc[monthYear].push(expense);
        }
        return acc;
      }, {});
      setGroupedExpenses(grouped);
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
      toast({ title: "Error", description: "Could not fetch expense history.", variant: "destructive" });
      setExpenses([]);
      setGroupedExpenses({});
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchAndGroupExpenses();
    } else if (!authLoading && !user) {
      setExpenses([]);
      setGroupedExpenses({});
      setIsLoading(false);
    }
  }, [user, authLoading]);

  const handleRefresh = () => {
    startRefreshTransition(async () => {
      await fetchAndGroupExpenses();
    });
  };

  const handleDeleteClick = (expenseId: string) => {
    setExpenseToModifyId(expenseId);
    setShowDeleteConfirmDialog(true);
  };

  const confirmDelete = async () => {
    if (!expenseToModifyId || !user || !auth.currentUser) return;
    setIsProcessing(true);
    setShowDeleteConfirmDialog(false);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const result = await deleteExpense(idToken, expenseToModifyId);
      if (result.success) {
        toast({ title: 'Expense Deleted', description: 'The expense has been successfully removed.' });
        fetchAndGroupExpenses(); // Refetch to update list
      } else {
        toast({ title: 'Deletion Failed', description: result.error || 'An error occurred.', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Deletion Failed', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setExpenseToModifyId(null);
    }
  };

  const handleUpdateStatus = async (expenseId: string, newStatus: ExpenseStatus) => {
    if (!user || !auth.currentUser) return;
    setIsProcessing(true);
    setExpenseToModifyId(expenseId); // For loading state on specific item
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const result = await updateExpenseStatus(idToken, expenseId, newStatus);
      if (result.success) {
        toast({ title: 'Status Updated', description: `Expense status changed to ${newStatus}.` });
        fetchAndGroupExpenses(); // Refetch
      } else {
        toast({ title: 'Status Update Failed', description: result.error || 'An error occurred.', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Status Update Failed', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setExpenseToModifyId(null);
    }
  };
  
  const canManageExpense = (expense: Expense): boolean => {
    if (!user) return false;
    if (user.role === 'owner' || user.role === 'admin') {
      return user.companyId === expense.companyId;
    }
    return false; // Auditors and users cannot manage status
  };

  const canDeleteExpense = (expense: Expense): boolean => {
    if (!user) return false;
    if (user.role === 'owner' || user.role === 'admin') {
      return user.companyId === expense.companyId; // Can delete any company expense
    }
    if (user.role === 'user') {
      return expense.userId === user.uid; // Can delete their own expenses
    }
    return false; // Auditors cannot delete
  };


  if (authLoading || isLoading || isRefreshing) {
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
        <CardHeader><CardTitle className="text-2xl font-semibold">Expense History</CardTitle></CardHeader>
        <CardContent className="text-center py-8"><p className="text-muted-foreground text-lg">Please log in.</p></CardContent>
      </Card>
     );
  }

  const months = Object.keys(groupedExpenses).sort((a, b) => compareDesc(parseISO(a), parseISO(b)));

  return (
    <Card className="shadow-xl w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-2xl font-semibold">Expense History</CardTitle>
        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing || isLoading || !user || isProcessing}>
          {isRefreshing || isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {months.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-lg">No expenses recorded yet.</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] md:h-[600px] pr-3">
            <Accordion type="multiple" className="w-full">
              {months.map(monthYear => (
                <AccordionItem value={monthYear} key={monthYear} className="border-b border-border last:border-b-0">
                  <AccordionTrigger className="hover:no-underline py-4 px-2 rounded-md bg-muted/50 hover:bg-muted text-base md:text-lg font-semibold">
                    {format(parseISO(monthYear), 'MMMM yyyy')}
                  </AccordionTrigger>
                  <AccordionContent className="py-3 px-2 bg-secondary/30 rounded-b-md">
                    <Accordion type="single" collapsible className="w-full">
                      {groupedExpenses[monthYear].map((expense) => {
                        const createdAtDate = safeTimestampToDate(expense.createdAt);
                        const expenseDateDate = safeTimestampToDate(expense.expenseDate);
                        const itemIsProcessing = isProcessing && expenseToModifyId === expense.id;
                        return (
                          <AccordionItem value={expense.id!} key={expense.id!} className="border-b border-border last:border-b-0">
                            <AccordionTrigger className="hover:no-underline py-3 px-2 rounded-md hover:bg-secondary/50 text-sm md:text-base">
                              <div className="flex justify-between items-center w-full">
                                <div className="flex items-center gap-3">
                                  <CategoryIcon category={expense.category} size={20} className="text-primary" />
                                  <div className="flex flex-col items-start">
                                     <span className="font-medium text-foreground truncate max-w-[150px] sm:max-w-[250px]">{expense.company}</span>
                                     <span className="text-xs text-muted-foreground">
                                      {expenseDateDate ? format(expenseDateDate, 'MMM dd, yyyy') : 'N/A'}
                                     </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-3">
                                  {expense.companyId && <StatusBadge status={expense.status} />}
                                  <Badge variant="outline" className="capitalize flex items-center gap-1.5 w-fit text-xs h-6">
                                    <PaymentMethodIcon method={expense.paymentMethod} size={12} />
                                    {expense.paymentMethod}
                                  </Badge>
                                  <span className="font-semibold text-right w-[70px] sm:w-[80px] text-base">
                                    ${expense.totalAmount.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="py-3 px-2 bg-secondary/30 rounded-b-md">
                              <div className="text-xs text-muted-foreground mb-2">
                                  Recorded on: {createdAtDate ? format(createdAtDate, 'MMM dd, yyyy, p') : 'N/A'}
                                  {expense.companyId && ` (Company ID: ${expense.companyId})`}
                              </div>
                              <Table>
                                <TableHeader><TableRow className="text-xs">
                                    <TableHead>Item</TableHead>
                                    <TableHead className="text-center">Qty</TableHead>
                                    <TableHead className="text-right">Net Price</TableHead>
                                </TableRow></TableHeader>
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
                              <div className="flex flex-wrap justify-between items-center mt-4 gap-2">
                                 <div className="text-right font-semibold text-sm">
                                     Category: <Badge variant="secondary" className="capitalize">{expense.category}</Badge>
                                 </div>
                                 <div className="flex gap-2">
                                   {canManageExpense(expense) && expense.status === 'pending' && (
                                     <>
                                       <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(expense.id!, 'approved')} disabled={itemIsProcessing} className="bg-green-500 hover:bg-green-600 text-white border-green-600">
                                         {itemIsProcessing && expense.status === 'pending' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle2 size={16} className="mr-1"/>} Approve
                                       </Button>
                                       <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(expense.id!, 'rejected')} disabled={itemIsProcessing} className="bg-red-500 hover:bg-red-600 text-white border-red-600">
                                         {itemIsProcessing && expense.status === 'pending' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <XCircle size={16} className="mr-1"/>} Reject
                                       </Button>
                                     </>
                                   )}
                                   {canDeleteExpense(expense) && (
                                     <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(expense.id!)} disabled={itemIsProcessing}>
                                       {itemIsProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 size={16} className="mr-1"/>} Delete
                                     </Button>
                                   )}
                                 </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        )}
      </CardContent>

      <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete this expense record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {setShowDeleteConfirmDialog(false); setExpenseToModifyId(null);}} disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
