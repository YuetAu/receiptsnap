
// src/app/profile/page.tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCircle, Mail, Briefcase, ShieldCheck, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // This should ideally be handled by AuthGuard, but as a fallback:
    router.push('/login');
    return null;
  }

  return (
    <div className="flex justify-center items-start py-8">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center">
          <UserCircle className="mx-auto h-20 w-20 text-primary mb-4" />
          <CardTitle className="text-3xl font-bold text-primary">{user.displayName || 'User Profile'}</CardTitle>
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

            <div className="flex items-center p-3 bg-secondary rounded-md">
              <UserCircle className="mr-3 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Display Name</p>
                <p className="text-base text-foreground">{user.displayName || 'Not set'}</p>
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
                            You can <a href="/company/create" className="text-primary hover:underline">create one</a> or accept an invitation to join.
                        </p>
                    </div>
                </div>
            )}
          </div>
          
          {/* Placeholder for future actions like edit profile, change password */}
          {/* 
          <div className="pt-6 border-t">
            <Button className="w-full">Edit Profile (Coming Soon)</Button>
          </div> 
          */}
        </CardContent>
      </Card>
    </div>
  );
}
