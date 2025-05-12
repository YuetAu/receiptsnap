
// src/types/user.ts
import type { User as FirebaseUser } from 'firebase/auth';

export type UserRole = 'owner' | 'admin' | 'auditor' | 'user';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  companyId?: string | null; // Nullable if not part of a company
  role?: UserRole | null;   // Nullable if not part of a company or role not set
}

// Function to adapt FirebaseUser and optional profile data to AppUser
export const toAppUser = (
  firebaseUser: FirebaseUser,
  profileData?: { companyId?: string | null; role?: UserRole | null }
): AppUser => {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    companyId: profileData?.companyId ?? null,
    role: profileData?.role ?? null,
  };
};

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  createdAt: Date | FirebaseFirestore.Timestamp;
  companyId?: string | null;
  role?: UserRole | null;
}
