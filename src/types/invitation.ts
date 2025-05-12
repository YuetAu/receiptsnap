
// src/types/invitation.ts
import type { Timestamp } from 'firebase/firestore';
import type { UserRole } from './user';

export interface Invitation {
  id: string; // Firestore document ID
  companyId: string;
  companyName: string;
  inviteeEmail: string; // Email of the person being invited
  inviterId: string; // UID of the user who sent the invitation
  role: UserRole; // Role to be assigned upon acceptance
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: Timestamp;
  acceptedAt?: Timestamp;
  acceptedBy?: string; // UID of the user who accepted
}
