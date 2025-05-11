
// src/lib/firebaseAdmin.ts
import admin from 'firebase-admin';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
let adminApp: admin.app.App | null = null;

if (!admin.apps.length) {
  if (!serviceAccountPath) {
    console.warn(
      'GOOGLE_APPLICATION_CREDENTIALS environment variable is not set. Firebase Admin SDK features requiring a service account may not work.'
    );
    try {
      adminApp = admin.initializeApp();
       console.log('[Firebase Admin] SDK initialized with default credentials (e.g., for Firebase Hosting).');
       if (adminApp && adminApp.options.projectId) {
        console.log(`[Firebase Admin] Using Project ID: ${adminApp.options.projectId}. Ensure this matches the client-side NEXT_PUBLIC_FIREBASE_PROJECT_ID.`);
      } else {
        console.warn('[Firebase Admin] Could not determine Project ID from default credentials.');
      }
    } catch (e: any) {
       console.error('[Firebase Admin] SDK initialization failed without GOOGLE_APPLICATION_CREDENTIALS:', e.message);
    }
  } else {
    try {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
      });
      console.log('[Firebase Admin] SDK initialized with service account.');
      if (adminApp && adminApp.options.projectId) {
        console.log(`[Firebase Admin] Using Project ID: ${adminApp.options.projectId}. Ensure this matches the client-side NEXT_PUBLIC_FIREBASE_PROJECT_ID.`);
      } else {
         // This case should be rare if initialization with cert was successful
        console.warn('[Firebase Admin] Could not determine Project ID from service account after initialization.');
      }
    } catch (error: any) {
      console.error('[Firebase Admin] SDK initialization error with service account:', error.stack);
      // If project ID cannot be determined from service account, it's a critical setup error.
      console.error(`[Firebase Admin] CRITICAL: Ensure the service account JSON file at path '${serviceAccountPath}' is valid, for the correct Firebase project, and contains a 'project_id' field.`);
    }
  }
} else {
  adminApp = admin.apps[0];
  if (adminApp && adminApp.options.projectId) {
     console.log(`[Firebase Admin] Re-using existing SDK instance for Project ID: ${adminApp.options.projectId}. Ensure this matches the client-side NEXT_PUBLIC_FIREBASE_PROJECT_ID.`);
  }
}

export const adminAuth = adminApp ? adminApp.auth() : null;
export const adminDb = adminApp ? adminApp.firestore() : null;

// Helper function to ensure adminDb is available
export const getAdminDb = () => {
  if (!adminDb) {
    if (!adminApp) { // Check adminApp instead of admin.apps.length for consistency
      console.error("[Firebase Admin] SDK not initialized. adminDb is not available.");
      throw new Error("[Firebase Admin] SDK not initialized. Cannot access Firestore via Admin SDK.");
    }
    // This case indicates an issue post-initialization or if adminApp became null
    return admin.firestore(); 
  }
  return adminDb;
}

// Helper function to ensure adminAuth is available
export const getAdminAuth = () => {
  if (!adminAuth) {
     if (!adminApp) {
      console.error("[Firebase Admin] SDK not initialized. adminAuth is not available.");
      throw new Error("[Firebase Admin] SDK not initialized. Cannot access Auth via Admin SDK.");
    }
    return admin.auth();
  }
  return adminAuth;
}
