
// src/types/user.ts
import type { User as FirebaseUser } from 'firebase/auth';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  // Add other profile fields as needed, e.g., companyId for future features
}

// Function to adapt FirebaseUser to AppUser
export const toAppUser = (firebaseUser: FirebaseUser): AppUser => {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
  };
};
