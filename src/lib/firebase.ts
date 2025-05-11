
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth"; // Added Auth import

// Check if essential environment variables are set
if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
  throw new Error(
    "Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is not defined. " +
    "Please ensure it is set in your .env.local file and that the Next.js development server has been restarted after changes to .env.local."
  );
}

const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!clientProjectId) {
  console.error(
    "CRITICAL ERROR: Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is not defined in .env.local. " +
    "This is required for Firebase to function correctly."
  );
  // Optionally, throw an error here if you want to halt execution
  // throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set.");
} else {
  console.log(`[Firebase Client] Initializing with Project ID: ${clientProjectId}. Ensure this matches the Admin SDK project_id.`);
}


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: clientProjectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app); // Initialize Auth
// const storage: FirebaseStorage = getStorage(app); // Uncomment if using Firebase Storage

export { app, db, auth /*, storage*/ }; // Export auth

