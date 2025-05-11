# ReceiptSnap - Expense Tracker

This is a Next.js application that allows users to track expenses by manually entering them or by snapping pictures of their receipts. It uses Firebase for authentication and database storage, and Genkit for AI-powered receipt data extraction.

## Getting Started

### Prerequisites

- Node.js (v18 or later recommended)
- npm or yarn
- A Firebase project

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

3.  **Set up Firebase:**
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
                  allow read: if request.auth != null && request.auth.uid == resource.data.userId;
                  allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
                  allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
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

4.  **Configure Environment Variables:**
    *   Create a new file named `.env.local` in the root of your project.
    *   Copy the contents of the `.env` file (which serves as a template) into `.env.local`.
    *   Fill in the Firebase configuration values you obtained in the previous step:
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

5.  **Set up Genkit (for AI features):**
    *   This project uses Google's Gemini model via Genkit. You'll need a Google Cloud project with the AI Platform API enabled and appropriate credentials.
    *   Follow the Genkit documentation for setting up Google AI: [Genkit Google AI Plugin](https://firebase.google.com/docs/genkit/plugins#google-ai)
    *   Ensure your `GOOGLE_API_KEY` or Application Default Credentials are set up in your environment where you run the Genkit development server. This might involve setting an environment variable or using `gcloud auth application-default login`.
      ```bash
      # Example for GOOGLE_API_KEY, if you are using API Key authentication for Gemini
      # Add this to your .env.local or set it in your shell environment
      # GOOGLE_API_KEY="YOUR_GEMINI_API_KEY"
      ```
      *Note: The application uses `googleai/gemini-2.0-flash` by default, which is configured in `src/ai/genkit.ts`.*

### Running the Development Servers

You need to run two development servers concurrently: one for the Next.js application and one for Genkit flows.

1.  **Run the Next.js development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    ```
    This will typically start the app on `http://localhost:9002`.

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

## Features

- User registration and login
- Expense tracking (manual entry and receipt scanning)
- AI-powered data extraction from receipts (Company, Items, Category, Date, Payment Method)
- Expense history view
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
-   `src/lib/`: Utility functions and library configurations (e.g., Firebase setup).
-   `src/types/`: TypeScript type definitions.
-   `public/`: Static assets.

## Key Technologies

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- ShadCN UI
- Firebase (Authentication, Firestore)
- Genkit (with Google AI - Gemini)
- Zod (for schema validation)
- React Hook Form

## Further Development & TODOs

-   Enhance security rules for Firestore.
-   Implement more robust error handling and user feedback.
-   Add image upload to Firebase Storage for receipts.
-   Develop more comprehensive company management features (roles, permissions).
-   Add expense editing and deletion.
-   Implement data visualization/dashboard for expenses.
-   Write unit and integration tests.
-   Improve accessibility.
```