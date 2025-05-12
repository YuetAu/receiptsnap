// src/app/profile/page.tsx
'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCircle, Mail, Briefcase, ShieldCheck, Info, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Import Link
import { useToast } from '@/hooks/use-toast';
import { updateUserDisplayName } from '@/actions/user-actions';
import { auth } from '@/lib/firebase';


export default function ProfilePage() {
  const { user, loading: authLoading, refreshUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(user?.displayName || '');
  const [isSubmittingName, setIsSubmittingName] = useState(false);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  const handleOpenEditDialog = () => {
    setNewDisplayName(user?.displayName || '');
    setIsEditingDisplayName(true);
  };

  const handleSaveDisplayName = async () => {
    if (!newDisplayName.trim()) {
      toast({ title: 'Display Name Required', description: 'Display name cannot be empty.', variant: 'destructive' });
      return;
    }
    if (!auth.currentUser) {
        toast({ title: 'Authentication Error', description: 'User not authenticated.', variant: 'destructive' });
        return;
    }

    setIsSubmittingName(true);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const result = await updateUserDisplayName(idToken, newDisplayName.trim());
      if (result.success) {
        toast({ title: 'Display Name Updated', description: 'Your display name has been successfully updated.' });
        await refreshUserProfile(); // Refresh user context
        setIsEditingDisplayName(false);
      } else {
        toast({ title: 'Update Failed', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error updating display name:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred while updating display name.', variant: 'destructive' });
    } finally {
      setIsSubmittingName(false);
    }
  };

  return (
    <div className="flex justify-center items-start py-8">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center">
          <UserCircle className="mx-auto h-20 w-20 text-primary mb-4" />
          <CardTitle className="text-3xl font-bold text-primary flex items-center justify-center gap-2">
            {user.displayName || 'User Profile'}
            <Button variant="ghost" size="icon" onClick={handleOpenEditDialog} className="text-muted-foreground hover:text-primary">
              <Edit size={18} />
              <span className="sr-only">Edit display name</span>
            </Button>
          </CardTitle>
          <CardDescription>View and manage your account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="space-y-3">
            <div className="flex items-center p-3 bg-secondary rounded-md">
              <Mail className="mr-3 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="text-base text-foreground">{user.email}</p>
              </div>
            </div>
            
            {user.companyId && (
              <>
                <div className="flex items-center p-3 bg-secondary rounded-md">
                  <Briefcase className="mr-3 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Company ID</p>
                    <p className="text-base text-foreground">{user.companyId}</p>
                  </div>
                </div>
                <div className="flex items-center p-3 bg-secondary rounded-md">
                  <ShieldCheck className="mr-3 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Role</p>
                    <Badge variant={user.role === 'owner' ? 'default' : user.role === 'admin' ? 'destructive' : 'secondary'} className="capitalize text-base">
                      {user.role || 'N/A'}
                    </Badge>
                  </div>
                </div>
              </>
            )}
            {!user.companyId && (
                 <div className="flex items-center p-3 bg-secondary/50 border border-dashed border-muted-foreground/30 rounded-md">
                    <Info className="mr-3 h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Business Mode</p>
                        <p className="text-base text-foreground">
                            You are not currently part of a company. 
                            You can <Link href="/company/create" className="text-primary hover:underline">create one</Link> or accept an invitation to join.
                        </p>
                    </div>
                </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditingDisplayName} onOpenChange={setIsEditingDisplayName}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Display Name</DialogTitle>
            <DialogDescription>
              Change your display name. This will be visible to others in your company.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="displayName" className="text-right">
                Name
              </Label>
              <Input
                id="displayName"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                className="col-span-3"
                placeholder="Your new display name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditingDisplayName(false)} disabled={isSubmittingName}>
              Cancel
            </Button>
            <Button onClick={handleSaveDisplayName} disabled={isSubmittingName || !newDisplayName.trim()}>
              {isSubmittingName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
