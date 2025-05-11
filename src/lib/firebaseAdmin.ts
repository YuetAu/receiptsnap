// src/lib/firebaseAdmin.ts
import admin from 'firebase-admin';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!admin.apps.length) {
  if (!serviceAccountPath) {
    console.warn(
      'GOOGLE_APPLICATION_CREDENTIALS environment variable is not set. Firebase Admin SDK features requiring a service account may not work.'
    );
    // Attempt to initialize without credentials for environments like Firebase Hosting with auto-init
    try {
      admin.initializeApp();
       console.log('Firebase Admin SDK initialized with default credentials (e.g., for Firebase Hosting).');
    } catch (e: any) {
       console.error('Firebase Admin SDK initialization failed without GOOGLE_APPLICATION_CREDENTIALS:', e.message);
       // Not throwing an error here to allow app to run in environments where admin SDK might not be fully used or auto-configured.
    }
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        // databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseio.com` // If using Realtime DB
      });
      console.log('Firebase Admin SDK initialized with service account.');
    } catch (error: any) {
      console.error('Firebase Admin SDK initialization error with service account:', error.stack);
      // Potentially throw an error here if service account is critical for all admin operations
      // throw new Error('Firebase Admin SDK initialization failed with service account.');
    }
  }
}

export const adminAuth = admin.apps.length ? admin.auth() : null;
export const adminDb = admin.apps.length ? admin.firestore() : null;

// Helper function to ensure adminDb is available
export const getAdminDb = () => {
  if (!adminDb) {
    if (!admin.apps.length) {
      console.error("Firebase Admin SDK not initialized. adminDb is not available.");
      throw new Error("Firebase Admin SDK not initialized. Cannot access Firestore via Admin SDK.");
    }
    // This case should ideally not be hit if initialization logic is correct.
    return admin.firestore(); 
  }
  return adminDb;
}

// Helper function to ensure adminAuth is available
export const getAdminAuth = () => {
  if (!adminAuth) {
     if (!admin.apps.length) {
      console.error("Firebase Admin SDK not initialized. adminAuth is not available.");
      throw new Error("Firebase Admin SDK not initialized. Cannot access Auth via Admin SDK.");
    }
    return admin.auth();
  }
  return adminAuth;
}
