
// src/app/company/create/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { createCompany } from '@/actions/expense-actions';
import { Loader2, PlusCircle } from 'lucide-react';
import { auth } from '@/lib/firebase';
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


export default function CreateCompanyPage() {
  const { user, loading: authLoading, refreshUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExpenseAssociationDialog, setShowExpenseAssociationDialog] = useState(false);
  const [newlyCreatedCompanyName, setNewlyCreatedCompanyName] = useState('');


  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null; // Or a loader
  }
  
  if (user.companyId) {
    // If user is already in a company, redirect them to the company page or dashboard
    toast({ title: "Already in a Company", description: "You are already part of a company.", variant: "default" });
    router.push('/company'); 
    return null;
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast({ title: 'Company Name Required', description: 'Please enter a name for your company.', variant: 'destructive' });
      return;
    }
    if (!auth.currentUser) {
      toast({ title: 'Authentication Error', description: 'User not authenticated.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const result = await createCompany(idToken, companyName.trim());
      if (result.success && result.companyId) {
        toast({ title: 'Company Created', description: `${companyName} has been successfully created.` });
        setNewlyCreatedCompanyName(companyName.trim());
        setShowExpenseAssociationDialog(true);
        // Refresh and redirect will happen after dialog interaction
      } else {
        toast({ title: 'Failed to Create Company', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error creating company:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExpenseAssociationDialogClose = async (associate: boolean) => {
    setShowExpenseAssociationDialog(false);
    if (associate) {
      // For now, just a toast. Actual DB operation is not implemented.
      toast({ title: "Expense Association", description: "Existing personal expenses will be reviewed for association (simulated)." });
    } else {
      toast({ title: "Expense Association", description: "Existing personal expenses will remain personal." });
    }
    await refreshUserProfile(); // Refresh user profile to get new companyId and role
    router.push('/company'); // Redirect to the company management page
  };

  return (
    <>
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-primary/10 to-background">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-primary">Start Your Business Mode</CardTitle>
            <CardDescription>Create a company to manage expenses collaboratively.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="company-name" className="text-lg">Company Name</Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  className="py-3 text-base"
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full text-lg py-3" disabled={isSubmitting || !companyName.trim()}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <PlusCircle className="mr-2 h-5 w-5" />
                )}
                Create Company
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <AlertDialog open={showExpenseAssociationDialog} onOpenChange={setShowExpenseAssociationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Associate Existing Expenses?</AlertDialogTitle>
            <AlertDialogDescription>
              You've created the company &quot;{newlyCreatedCompanyName}&quot;. 
              Do you want to associate your existing personal expenses with this company?
              This would make them visible to company members according to their roles.
              Currently, this action is for confirmation only and will not modify existing expense data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleExpenseAssociationDialogClose(false)}>No, Keep Personal</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleExpenseAssociationDialogClose(true)}>Yes, Associate (Simulated)</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
