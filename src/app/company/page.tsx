
// src/app/company/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Mail, PlusCircle, Trash2, Edit3, LogOutIcon } from 'lucide-react';
import { getCompaniesForUser, sendInvitation, acceptInvitation, getInvitationsForUser, removeUserFromCompany, updateUserRole, leaveCompany } from '@/actions/expense-actions';
import type { Company, Invitation as InvitationType } from '@/types'; // Assuming a root types/index.ts or similar
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UserRole } from '@/types/user';
import { auth } from '@/lib/firebase';


export default function CompanyPage() {
  const { user, loading: authLoading, refreshUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [invitations, setInvitations] = useState<InvitationType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for invite dialog
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('user');
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  
  // State for edit role dialog
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMemberRole, setEditMemberRole] = useState<UserRole>('user');
  const [isEditRoleDialogOpen, setIsEditRoleDialogOpen] = useState(false);


  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!user.companyId) {
       // If user has no company, check for invitations
       fetchUserInvitations();
       // User might be on this page to accept an invitation or see they have no company
       // No redirect here, allow component to render based on invitations or lack of company
       setIsLoading(false);
       return;
    }
    fetchCompanyDetails();
    fetchUserInvitations(); // Also fetch invitations if user is in a company
  }, [user, authLoading, router]);

  const fetchCompanyDetails = async () => {
    if (!user || !user.companyId || !auth.currentUser) return;
    setIsLoading(true);
    try {
      // We need a way to get a single company's details.
      // For now, getCompaniesForUser will return an array, we find the current one.
      // Ideally, a getCompanyById action would be better.
      const companies = await getCompaniesForUser(user.uid); // This is client-side, so it's okay.
      const currentCompany = companies.find(c => c.id === user.companyId);
      setCompany(currentCompany || null);
      if (!currentCompany) {
        toast({ title: 'Error', description: 'Could not load your company details.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error fetching company details:', error);
      toast({ title: 'Error', description: 'Failed to fetch company details.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserInvitations = async () => {
    if (!user || !user.email) return;
    try {
      const userInvites = await getInvitationsForUser(user.email);
      setInvitations(userInvites.filter(inv => inv.status === 'pending'));
    } catch (error) {
      console.error('Error fetching invitations:', error);
      toast({ title: 'Error', description: 'Failed to fetch invitations.', variant: 'destructive' });
    }
  };
  
  const handleSendInvitation = async () => {
    if (!user || !company || !auth.currentUser) return;
    setIsSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const result = await sendInvitation(idToken, company.id, inviteEmail, inviteRole);
      if (result.success) {
        toast({ title: 'Invitation Sent', description: `Invitation sent to ${inviteEmail}.` });
        setInviteEmail('');
        setInviteRole('user');
        setIsInviteDialogOpen(false);
        // Potentially refresh member list or add pending invitation to UI
      } else {
        toast({ title: 'Failed to Send Invitation', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    if (!user || !auth.currentUser) return;
    setIsSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const result = await acceptInvitation(idToken, invitationId);
      if (result.success) {
        toast({ title: 'Invitation Accepted', description: 'You have joined the company.' });
        await refreshUserProfile(); // Refresh user profile to get new companyId and role
        setInvitations(prev => prev.filter(inv => inv.id !== invitationId)); // Remove from local state
         // No explicit router.push needed, useEffect will refetch company details once user.companyId is updated.
      } else {
        toast({ title: 'Failed to Accept Invitation', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (memberIdToRemove: string) => {
    if (!user || !company || !auth.currentUser || user.uid === memberIdToRemove) return; // Can't remove self this way
    if (user.role !== 'owner' && user.role !== 'admin') {
        toast({title: "Permission Denied", description: "You cannot remove members.", variant: "destructive"});
        return;
    }
    // Add more specific role checks if admin cannot remove other admins etc.
     setIsSubmitting(true);
    try {
        const idToken = await auth.currentUser.getIdToken(true);
        const result = await removeUserFromCompany(idToken, memberIdToRemove, company.id);
        if(result.success){
            toast({title: "Member Removed", description: "The member has been removed from the company."});
            fetchCompanyDetails(); // Refresh company details
        } else {
            toast({title: "Removal Failed", description: result.error, variant: "destructive"});
        }
    } catch (error) {
        console.error("Error removing member:", error);
        toast({title: "Error", description: "Failed to remove member.", variant: "destructive"});
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleOpenEditRoleDialog = (memberId: string, currentRole: UserRole) => {
    setEditMemberId(memberId);
    setEditMemberRole(currentRole);
    setIsEditRoleDialogOpen(true);
  };

  const handleUpdateRole = async () => {
    if (!user || !company || !editMemberId || !auth.currentUser) return;
    if (user.role !== 'owner' && user.role !== 'admin') {
         toast({title: "Permission Denied", description: "You cannot update roles.", variant: "destructive"});
        return;
    }
     // Add more specific logic: e.g., admin cannot change owner's role or other admin's role.
     // Owner can change any role.

    setIsSubmitting(true);
    try {
        const idToken = await auth.currentUser.getIdToken(true);
        const result = await updateUserRole(idToken, editMemberId, company.id, editMemberRole);
        if(result.success){
            toast({title: "Role Updated", description: "Member's role has been updated."});
            fetchCompanyDetails(); // Refresh company details
            setIsEditRoleDialogOpen(false);
        } else {
            toast({title: "Update Failed", description: result.error, variant: "destructive"});
        }
    } catch (error) {
        console.error("Error updating role:", error);
        toast({title: "Error", description: "Failed to update role.", variant: "destructive"});
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleLeaveCompany = async () => {
    if (!user || !user.companyId || !auth.currentUser || user.role === 'owner') {
        toast({title: "Action Not Allowed", description: "Owners must transfer ownership or delete the company to leave.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);
    try {
        const idToken = await auth.currentUser.getIdToken(true);
        const result = await leaveCompany(idToken, user.companyId);
        if(result.success){
            toast({title: "Left Company", description: "You have successfully left the company."});
            await refreshUserProfile();
            router.push('/'); // Redirect to home or another appropriate page
        } else {
            toast({title: "Failed to Leave", description: result.error, variant: "destructive"});
        }
    } catch (error) {
        console.error("Error leaving company:", error);
        toast({title: "Error", description: "Failed to leave company.", variant: "destructive"});
    } finally {
        setIsSubmitting(false);
    }
  };


  if (authLoading || isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If user has no companyId and no pending invitations
  if (!user.companyId && invitations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <Building size={64} className="text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">You are not part of any company.</h2>
        <p className="text-muted-foreground mb-6">
          Create a new company to start managing expenses with your team, or accept an invitation if you've received one.
        </p>
        <Button onClick={() => router.push('/company/create')}>
          <PlusCircle className="mr-2 h-4 w-4" /> Create a New Company
        </Button>
      </div>
    );
  }

  // If user has no companyId BUT has pending invitations
  if (!user.companyId && invitations.length > 0) {
     return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6 text-center">Your Invitations</h1>
        <div className="max-w-md mx-auto space-y-4">
          {invitations.map(invite => (
            <Card key={invite.id} className="shadow-lg">
              <CardHeader>
                <CardTitle>Invitation to join {invite.companyName}</CardTitle>
                <CardDescription>Invited by user with ID: {invite.inviterId}. Role: {invite.role}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button onClick={() => handleAcceptInvitation(invite.id)} disabled={isSubmitting} className="w-full">
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Accept Invitation'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }


  // If user is part of a company (company object should be loaded)
  return (
    <div className="container mx-auto py-8">
      {company ? (
        <Card className="w-full max-w-4xl mx-auto shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl flex items-center">
              <Briefcase className="mr-3 h-8 w-8 text-primary" />
              {company.name}
            </CardTitle>
            <CardDescription>Manage your company members, roles, and settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-3 flex items-center">
                <Users className="mr-2 h-5 w-5 text-primary" /> Members
              </h3>
              <ul className="space-y-2">
                {company.members.map(memberId => ( // This should ideally be a list of member objects with name/email
                  <li key={memberId} className="flex justify-between items-center p-3 bg-secondary rounded-md">
                    {/* TODO: Fetch member details (displayName/email) for better display */}
                    <span className="text-sm">{memberId === user?.uid ? `${memberId} (You)` : memberId} - Role: {memberId === company.ownerId ? 'Owner' : 'Member/Admin/Auditor'}</span>
                     <div>
                       { (user?.role === 'owner' || user?.role === 'admin') && memberId !== user.uid && (
                           <>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEditRoleDialog(memberId, 'user' /* TODO: Get actual current role */)} className="mr-2">
                                <Edit3 size={16} />
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleRemoveMember(memberId)} disabled={isSubmitting || memberId === company.ownerId}>
                                <Trash2 size={16} />
                            </Button>
                           </>
                       )}
                     </div>
                  </li>
                ))}
              </ul>
            </div>

            {(user?.role === 'owner' || user?.role === 'admin') && (
              <div>
                <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Mail className="mr-2 h-4 w-4" /> Invite New Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite New Member</DialogTitle>
                      <DialogDescription>Enter the email address and assign a role for the new member.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="invite-email">Email Address</Label>
                        <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="member@example.com" />
                      </div>
                      <div>
                        <Label htmlFor="invite-role">Role</Label>
                        <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as UserRole)}>
                            <SelectTrigger id="invite-role">
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="auditor">Auditor</SelectItem>
                                {user.role === 'owner' && <SelectItem value="owner">Owner</SelectItem>}
                            </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleSendInvitation} disabled={isSubmitting || !inviteEmail}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Send Invitation'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

             {/* Edit Role Dialog */}
             <Dialog open={isEditRoleDialogOpen} onOpenChange={setIsEditRoleDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                    <DialogTitle>Edit Member Role</DialogTitle>
                    <DialogDescription>Change the role for member ID: {editMemberId}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                    <div>
                        <Label htmlFor="edit-role">New Role</Label>
                        <Select value={editMemberRole} onValueChange={(value) => setEditMemberRole(value as UserRole)}>
                            <SelectTrigger id="edit-role">
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="auditor">Auditor</SelectItem>
                                 {user?.role === 'owner' && <SelectItem value="owner">Owner</SelectItem>}
                            </SelectContent>
                        </Select>
                    </div>
                    </div>
                    <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditRoleDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdateRole} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Update Role'}
                    </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            {user?.role !== 'owner' && (
                 <div className="mt-8 border-t pt-6">
                    <Button variant="destructive" onClick={handleLeaveCompany} disabled={isSubmitting}>
                        <LogOutIcon className="mr-2 h-4 w-4" /> Leave Company
                    </Button>
                 </div>
            )}


          </CardContent>
        </Card>
      ) : (
         !isLoading && <p className="text-center text-muted-foreground">Company data not found or you are not part of a company.</p>
      )}
      
      {/* Display pending invitations if user is already in a company but has other invites */}
      {user.companyId && invitations.length > 0 && (
         <div className="mt-10">
            <h2 className="text-2xl font-semibold mb-4 text-center">Other Pending Invitations</h2>
             <div className="max-w-md mx-auto space-y-4">
                {invitations.map(invite => (
                    <Card key={invite.id} className="shadow-lg">
                    <CardHeader>
                        <CardTitle>Invitation to join {invite.companyName}</CardTitle>
                        <CardDescription>Invited by: {invite.inviterId}. Role: {invite.role}</CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button 
                            onClick={() => handleAcceptInvitation(invite.id)} 
                            disabled={isSubmitting} 
                            className="w-full"
                            variant="outline"
                        >
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Accept (will leave current company)'}
                        </Button>
                    </CardFooter>
                    </Card>
                ))}
            </div>
         </div>
      )}
    </div>
  );
}
