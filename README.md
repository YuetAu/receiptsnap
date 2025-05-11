# ReceiptSnap - Expense Tracker

This is a Next.js application that allows users to track expenses by manually entering them or by snapping pictures of their receipts. It uses Firebase for authentication and database storage, and Genkit for AI-powered receipt data extraction.

## Getting Started

### Prerequisites

- Node.js (v18 or later recommended)
- npm or yarn
- A Firebase project
- A Google Cloud project (can be the same as your Firebase project)

### Setup Instructions

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Set up Firebase (Client-Side):**
    *   Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project (or use an existing one).
    *   In your Firebase project, go to **Project settings** (the gear icon).
    *   Under the "General" tab, find your project's SDK setup snippet. You'll need the configuration values (apiKey, authDomain, projectId, etc.).
    *   **Enable Firebase Authentication:**
        *   In the Firebase console, go to **Authentication** (Build menu).
        *   Click on the "Sign-in method" tab.
        *   **VERY IMPORTANT:** Enable the **Email/Password** provider. If this is not enabled, you will encounter an `auth/operation-not-allowed` error when trying to register or log in.
    *   **Enable Firestore Database:**
        *   In the Firebase console, go to **Firestore Database** (Build menu).
        *   Click "Create database".
        *   Start in **production mode** (recommended for security rules).
        *   Choose a Firestore location.
        *   **Important Security Rules:** Go to the "Rules" tab in Firestore and update your rules. For development, you can start with:
            ```
            rules_version = '2';
            service cloud.firestore {
              match /databases/{database}/documents {
                // Allow read/write access for authenticated users to their own data
                match /users/{userId} {
                  allow read, write: if request.auth != null && request.auth.uid == userId;
                }
                match /expenses/{expenseId} {
                  // Allow create if the request is authenticated AND the userId in the new document matches the authenticated user's UID
                  allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
                  // Allow read, update, delete if the user is the owner
                  allow read, update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
                }
                match /companies/{companyId} {
                  allow read: if request.auth != null; // Or more specific rules
                  allow create, update, delete: if request.auth != null; // Define who can manage companies
                }
                match /invitations/{invitationId} {
                  allow read, write: if request.auth != null; // Or more specific rules
                }
              }
            }
            ```
            For production, you'll want to define more granular security rules.

4.  **Configure Environment Variables (Client & Server):**
    *   Create a new file named `.env.local` in the root of your project.
    *   Copy the contents of the `.env` file (which serves as a template) into `.env.local`.
    *   **Client-Side Firebase Config:** Fill in the Firebase configuration values you obtained in the previous step:
        ```env
        NEXT_PUBLIC_FIREBASE_API_KEY="YOUR_API_KEY"
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="YOUR_AUTH_DOMAIN"
        NEXT_PUBLIC_FIREBASE_PROJECT_ID="YOUR_PROJECT_ID"
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="YOUR_STORAGE_BUCKET"
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="YOUR_MESSAGING_SENDER_ID"
        NEXT_PUBLIC_FIREBASE_APP_ID="YOUR_APP_ID"
        ```
        *   **Important:** `NEXT_PUBLIC_` prefix is necessary for these variables to be exposed to the client-side by Next.js.
        *   **Troubleshooting `auth/invalid-api-key`**: If you see this error, double-check that `NEXT_PUBLIC_FIREBASE_API_KEY` in your `.env.local` file is correct and that you have restarted your Next.js development server (`npm run dev`) after creating or modifying the `.env.local` file. Environment variables are loaded at build time.
        *   **VERY IMPORTANT for `auth/argument-error` or `Invalid ID token` errors:** Ensure the `NEXT_PUBLIC_FIREBASE_PROJECT_ID` in your `.env.local` file **EXACTLY MATCHES** the `project_id` found in your Firebase Admin SDK service account JSON file (see next step). A mismatch here is a common cause of ID token verification failures. For example, if your service account file shows `"project_id": "my-awesome-project-123"`, then your `.env.local` must have `NEXT_PUBLIC_FIREBASE_PROJECT_ID="my-awesome-project-123"`.

5.  **Set up Firebase Admin SDK (Server-Side):**
    *   The application uses the Firebase Admin SDK for server-side actions like securely writing to Firestore on behalf of an authenticated user.
    *   You need a service account JSON file:
        1.  Go to your Firebase project settings -> Service accounts tab.
        2.  Click "Generate new private key" and download the JSON file.
        3.  **Important:** Do NOT commit this `*.json` file to your Git repository. Add it to your `.gitignore` file.
        4.  Store this file securely in your project directory (e.g., in the root or a dedicated config folder that's gitignored).
        5.  In your `.env.local` file, set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of this service account file.
            ```env
            # .env.local
            # ... other variables
            GOOGLE_APPLICATION_CREDENTIALS="./path/to/your-service-account-file.json"
            ```
            *Replace `./path/to/your-service-account-file.json` with the actual path to your downloaded file.*
            *The Firebase Admin SDK will automatically use this environment variable to initialize.*
        6.  **Verify Project ID Match:** Double-check that the `project_id` field inside your downloaded service account JSON file matches the `NEXT_PUBLIC_FIREBASE_PROJECT_ID` you set for the client-side configuration. They must be for the same Firebase project.

6.  **Set up Genkit (for AI features):**
    *   This project uses Google's Gemini model via Genkit for AI-powered receipt data extraction.
    *   You'll need a Google Cloud project (this can be the same project as your Firebase project) with the "Vertex AI API" or "AI Platform API" enabled.
    *   Set up authentication for Genkit:
        *   **Using an API Key (Simpler for development):**
            1.  In the Google Cloud Console, go to "APIs & Services" -> "Credentials".
            2.  Click "Create credentials" -> "API key".
            3.  Copy the API key.
            4.  **Restrict the API key** to only be usable with the "Vertex AI API" (or the specific Gemini API if available for restriction) for security.
            5.  In your `.env.local` file, add:
                ```env
                # .env.local
                # ... other variables
                GOOGLE_API_KEY="YOUR_GEMINI_API_KEY"
                ```
        *   **Using Application Default Credentials (ADC) (More secure, recommended for production):**
            1.  Install the Google Cloud CLI (`gcloud`).
            2.  Run `gcloud auth application-default login`. This will open a browser window to authenticate.
            3.  Genkit will automatically pick up these credentials if `GOOGLE_API_KEY` is not set.
    *   Ensure your `GOOGLE_API_KEY` or ADC are set up in your environment where you run the Genkit development server and your Next.js application (as Genkit flows can be called from server components/actions).
    *   *Note: The application uses `googleai/gemini-2.0-flash` by default, which is configured in `src/ai/genkit.ts`.*

### Running the Development Servers

You need to run two development servers concurrently: one for the Next.js application and one for Genkit flows.

1.  **Run the Next.js development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    ```
    This will typically start the app on `http://localhost:9002`. Check the browser console and server terminal for logs related to Firebase Project IDs if you encounter authentication issues.

2.  **Run the Genkit development server (in a separate terminal):**
    ```bash
    npm run genkit:dev
    # or
    yarn genkit:dev
    ```
    This will start the Genkit development UI, usually on `http://localhost:4000`, where you can inspect and test your flows.

    For auto-reloading of Genkit flows on changes:
    ```bash
    npm run genkit:watch
    # or
    yarn genkit:watch
    ```


### Building for Production

```bash
npm run build
npm run start
# or
yarn build
yarn start
```
Ensure all necessary environment variables (including `GOOGLE_APPLICATION_CREDENTIALS` and `GOOGLE_API_KEY` if used) are set in your production environment.

## Features

- User registration and login
- Expense tracking (manual entry and receipt scanning)
- AI-powered data extraction from receipts (Company, Items, Category, Date, Payment Method)
- Expense history view
- Secure server-side expense saving using Firebase Admin SDK
- Company creation and user invitation system (basic implementation)

## Project Structure

-   `src/app/`: Next.js App Router pages and layouts.
-   `src/components/`: Reusable React components.
    -   `src/components/auth/`: Authentication related components.
    -   `src/components/layout/`: Layout components.
    -   `src/components/ui/`: ShadCN UI components.
-   `src/actions/`: Server Actions for form submissions and data mutations.
-   `src/ai/`: Genkit related code.
    -   `src/ai/flows/`: Genkit flow definitions.
-   `src/contexts/`: React context providers (e.g., AuthContext).
-   `src/hooks/`: Custom React hooks.
-   `src/lib/`: Utility functions and library configurations (e.g., Firebase client setup `firebase.ts`, Firebase admin setup `firebaseAdmin.ts`).
-   `src/types/`: TypeScript type definitions.
-   `public/`: Static assets.

## Key Technologies

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- ShadCN UI
- Firebase (Authentication, Firestore)
- Firebase Admin SDK (for secure server-side operations)
- Genkit (with Google AI - Gemini)
- Zod (for schema validation)
- React Hook Form

## Further Development & TODOs

-   Enhance security rules for Firestore (review periodically).
-   Implement more robust error handling and user feedback across the app.
-   Add image upload to Firebase Storage for receipts, linking them to expenses.
-   Develop more comprehensive company management features (roles, permissions).
-   Add expense editing and deletion capabilities.
-   Implement data visualization/dashboard for expenses.
-   Write unit and integration tests.
-   Improve accessibility (ARIA attributes, keyboard navigation).
