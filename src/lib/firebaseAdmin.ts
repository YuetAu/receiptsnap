
// src/lib/firebaseAdmin.ts
import admin from 'firebase-admin';

// Prefer using explicit env vars over GOOGLE_APPLICATION_CREDENTIALS if set
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

let adminApp: admin.app.App | null = null;

if (!admin.apps.length) {
  // Prioritize explicit env vars
  if (projectId && privateKey && clientEmail) {
     try {
       adminApp = admin.initializeApp({
         credential: admin.credential.cert({
           projectId: projectId,
           privateKey: privateKey,
           clientEmail: clientEmail,
         }),
       });
       console.log('[Firebase Admin] SDK initialized with explicit environment variables.');
       if (adminApp && adminApp.options.projectId) {
        console.log(`[Firebase Admin] Using Project ID: ${adminApp.options.projectId}. Ensure this matches the client-side NEXT_PUBLIC_FIREBASE_PROJECT_ID.`);
      }
     } catch (error: any) {
       console.error('[Firebase Admin] SDK initialization error with explicit env vars:', error.stack);
       console.error('[Firebase Admin] CRITICAL: Ensure FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_PRIVATE_KEY, and FIREBASE_ADMIN_CLIENT_EMAIL env vars are correctly set.');
     }
  } else if (serviceAccountPath) { // Fallback to GOOGLE_APPLICATION_CREDENTIALS
    try {
      // Admin SDK automatically uses GOOGLE_APPLICATION_CREDENTIALS if set and initializeApp() is called without options
      adminApp = admin.initializeApp();
      console.log('[Firebase Admin] SDK initialized with GOOGLE_APPLICATION_CREDENTIALS.');
       if (adminApp && adminApp.options.projectId) {
        console.log(`[Firebase Admin] Using Project ID: ${adminApp.options.projectId}. Ensure this matches the client-side NEXT_PUBLIC_FIREBASE_PROJECT_ID.`);
      } else {
        console.warn('[Firebase Admin] Could not determine Project ID from GOOGLE_APPLICATION_CREDENTIALS. Ensure service account JSON is valid.');
      }
    } catch (error: any) {
      console.error('[Firebase Admin] SDK initialization error with GOOGLE_APPLICATION_CREDENTIALS:', error.stack);
      console.error(`[Firebase Admin] CRITICAL: Ensure the service account JSON file at path '${serviceAccountPath}' is valid, for the correct Firebase project, and contains a 'project_id' field.`);
    }
  } else { // Fallback to default credentials if available (e.g. on Firebase Hosting)
    console.warn(
      'Neither explicit Firebase Admin env vars (PROJECT_ID, PRIVATE_KEY, CLIENT_EMAIL) nor GOOGLE_APPLICATION_CREDENTIALS are set. Attempting initialization with default credentials.'
    );
    try {
       adminApp = admin.initializeApp();
       console.log('[Firebase Admin] SDK initialized with default credentials.');
       if (adminApp && adminApp.options.projectId) {
        console.log(`[Firebase Admin] Using Project ID: ${adminApp.options.projectId}. Ensure this matches the client-side NEXT_PUBLIC_FIREBASE_PROJECT_ID.`);
      } else {
        console.warn('[Firebase Admin] Could not determine Project ID from default credentials.');
      }
    } catch (e: any) {
       console.error('[Firebase Admin] SDK initialization failed with default credentials:', e.message);
    }
  }
} else {
  adminApp = admin.apps[0];
  if (adminApp && adminApp.options.projectId) {
     console.log(`[Firebase Admin] Re-using existing SDK instance for Project ID: ${adminApp.options.projectId}. Ensure this matches the client-side NEXT_PUBLIC_FIREBASE_PROJECT_ID.`);
  } else {
     console.warn('[Firebase Admin] Re-using existing SDK instance, but Project ID could not be determined.');
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
    // Re-attempting to get firestore might work if the app object is valid but adminDb wasn't set.
    return adminApp.firestore(); 
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
     // Re-attempting to get auth might work if the app object is valid but adminAuth wasn't set.
    return adminApp.auth();
  }
  return adminAuth;
}
