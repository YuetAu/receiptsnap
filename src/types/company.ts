
// src/types/company.ts
import type { Timestamp } from 'firebase/firestore';

export interface Company {
  id: string; // Firestore document ID
  name: string;
  ownerId: string; // UID of the user who owns the company
  members: string[]; // Array of UIDs of users who are members
  createdAt: Timestamp;
}
