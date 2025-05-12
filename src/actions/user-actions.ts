
// src/actions/user-actions.ts
'use server';

import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { revalidatePath } from 'next/cache';

export async function updateUserDisplayName(idToken: string, newDisplayName: string): Promise<{ success: boolean; error?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  if (!adminAuth || !adminDb) {
    return { success: false, error: "Firebase Admin SDK not initialized correctly on the server." };
  }

  if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
    return { success: false, error: "ID token was not provided or was invalid." };
  }

  if (!newDisplayName || newDisplayName.trim().length < 2 || newDisplayName.trim().length > 50) {
    return { success: false, error: "Display name must be between 2 and 50 characters." };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Update Firebase Authentication display name
    await adminAuth.updateUser(uid, {
      displayName: newDisplayName.trim(),
    });

    // Update display name in Firestore user profile
    const userDocRef = adminDb.collection('users').doc(uid);
    await userDocRef.update({
      displayName: newDisplayName.trim(),
    });

    revalidatePath('/profile'); // Revalidate the profile page
    revalidatePath('/'); // Revalidate home page as display name might appear in header
    // Potentially revalidate other paths if display name is shown elsewhere

    return { success: true };

  } catch (error: any) {
    console.error("Error updating display name:", error);
    let errorMessage = "Failed to update display name.";
    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error.code === 'auth/argument-error' || error.message?.toLowerCase().includes('verifyidtoken')) {
      errorMessage = 'Invalid ID token. Please try logging in again.';
    } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'User not found.';
    }
    return { success: false, error: errorMessage };
  }
}
