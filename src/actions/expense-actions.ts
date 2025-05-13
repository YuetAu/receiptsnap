
// src/actions/expense-actions.ts
'use server';

import admin from 'firebase-admin';
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { db } from '@/lib/firebase'; // Client SDK for some reads if needed, admin for writes/sensitive reads
import type { Expense, ExpenseFormData, ExpenseItem, ExpenseCategory, PaymentMethod, ExpenseStatus } from '@/types/expense';
import { extractReceiptData, type ExtractReceiptDataInput } from '@/ai/flows/extract-receipt-data';
import type { ExtractReceiptDataOutput as AIExtractReceiptDataOutput } from '@/ai/flows/extract-receipt-data';
import { collection, getDocs, query, orderBy, Timestamp, serverTimestamp, where, addDoc as clientAddDoc, doc, getDoc, deleteDoc as clientDeleteDoc, updateDoc as clientUpdateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import { expenseCategories, paymentMethods } from '@/types/expense';
import type { Company } from '@/types/company';
import type { Invitation } from '@/types/invitation';
import type { UserProfile, UserRole } from '@/types/user';


const validateCategory = (aiCategory: string): ExpenseCategory => {
  if (expenseCategories.includes(aiCategory as ExpenseCategory)) {
    return aiCategory as ExpenseCategory;
  }
  return 'other';
};

const validatePaymentMethod = (aiPaymentMethod: string): PaymentMethod => {
  if (paymentMethods.includes(aiPaymentMethod as PaymentMethod)) {
    return aiPaymentMethod as PaymentMethod;
  }
  return 'other';
}

interface AdminProjectDetails {
  projectId: string;
  errorHint: string;
}

function getAdminProjectDetails(): AdminProjectDetails {
  let projectId = "N/A (Admin SDK project ID not available)";
  let errorHint = "";
  try {
    const currentAdminApp = admin.apps.length > 0 ? admin.apps[0] : null;
    if (currentAdminApp && currentAdminApp.options && currentAdminApp.options.projectId) {
      projectId = currentAdminApp.options.projectId as string;
    } else {
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && (!process.env.FIREBASE_ADMIN_PROJECT_ID || !process.env.FIREBASE_ADMIN_PRIVATE_KEY || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL)) {
        errorHint = "GOOGLE_APPLICATION_CREDENTIALS or explicit admin env vars not set. ";
      } else if (admin.apps.length === 0) {
        errorHint = "Firebase Admin SDK potentially not initialized (admin.apps is empty). Check server logs for credentials path/permission issues. ";
      } else {
        errorHint = "Admin SDK initialized but no projectId found. Check service account JSON or explicit env var validity. ";
      }
      if (process.env.FIREBASE_CONFIG) {
        try {
          const fbConfig = JSON.parse(process.env.FIREBASE_CONFIG);
          if (fbConfig.projectId) {
            projectId = fbConfig.projectId;
            errorHint = projectId === "N/A (Admin SDK project ID not available)" ? errorHint : "";
          }
        } catch (e) {/*ignore*/ }
      }
    }
  } catch (e) {
    console.error("Failed to retrieve admin project ID for error reporting:", e);
    errorHint = "Error retrieving admin project ID. ";
  }
  return { projectId, errorHint };
}


export async function processReceiptImage(photoDataUri: string): Promise<AIExtractReceiptDataOutput & { items: ExpenseItem[] } | { error: string }> {
  try {
    const input: ExtractReceiptDataInput = { photoDataUri };
    const result = await extractReceiptData(input);

    const processedItems: ExpenseItem[] = result.items.map(item => {
      const quantity = Number(item.quantity) || 1;
      const netPrice = Number(item.netPrice) || 0;
      return {
        name: item.name,
        quantity,
        netPrice,
      };
    });

    return {
      ...result,
      items: processedItems,
      category: validateCategory(result.category),
      paymentMethod: validatePaymentMethod(result.paymentMethod),
      expenseDate: result.expenseDate || new Date().toISOString().split('T')[0],
    };
  } catch (error) {
    console.error("Error processing receipt image:", error);
    return { error: "Failed to process receipt image. Please try again." };
  }
}

export async function saveExpense(idToken: string, data: ExpenseFormData): Promise<{ success: boolean; error?: string; docId?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  if (!adminAuth || !adminDb) {
    let errorMsg = "Firebase Admin SDK not initialized correctly on the server.";
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && (!process.env.FIREBASE_ADMIN_PROJECT_ID || !process.env.FIREBASE_ADMIN_PRIVATE_KEY || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL)) {
      errorMsg += " GOOGLE_APPLICATION_CREDENTIALS or explicit admin env vars are not set.";
    } else {
      errorMsg += " Check server logs for Firebase Admin initialization errors related to your service account file or env vars.";
    }
    console.error("saveExpense:", errorMsg);
    return { success: false, error: errorMsg };
  }

  if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
    return { success: false, error: "ID token was not provided or was invalid. Please try logging in again." };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDocSnap = await adminDb.collection('users').doc(uid).get();
    const userProfile = userDocSnap.data() as UserProfile | undefined;

    const items: ExpenseItem[] = data.items.map(item => ({
      name: item.name,
      quantity: Math.max(1, Number(item.quantity) || 1),
      netPrice: Number(item.netPrice) || 0,
    }));
    const totalAmount = items.reduce((sum, item) => sum + item.netPrice, 0);

    const expenseData: Omit<Expense, 'id'> = {
      userId: uid,
      company: data.company, // This should be company name if manually entered, or fetched if user in company
      companyId: userProfile?.companyId || null, // Set companyId if user is in a company
      items,
      category: data.category,
      totalAmount,
      expenseDate: admin.firestore.Timestamp.fromDate(new Date(data.expenseDate)),
      paymentMethod: data.paymentMethod,
      status: userProfile?.companyId ? 'pending' : 'approved', // 'pending' if company expense, else 'approved'
      createdAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
    };

    const docRef = await adminDb.collection('expenses').add(expenseData);
    revalidatePath('/');
    return { success: true, docId: docRef.id };

  } catch (error: any) {
    console.error("Error in server action (saveExpense):", error);
    const adminDetails = getAdminProjectDetails();
    const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'MISSING_CLIENT_ENV_VAR';
    let errorMessage = `Failed to save expense. Admin SDK Project ID: ${adminDetails.projectId}, Client Project ID: ${clientProjectId}. ${adminDetails.errorHint}`;

    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error.code === 'auth/argument-error' || error.message?.toLowerCase().includes('verifyidtoken')) {
      errorMessage = `Invalid ID token. Client Project ID: ${clientProjectId}. Admin SDK Project ID: ${adminDetails.projectId}. ${adminDetails.errorHint} Please ensure these match. If they do, the token might be malformed. Try logging in again.`;
    } else if (error.code === 'permission-denied') {
      errorMessage = `Firestore permission denied for saving expense. Check security rules. ${adminDetails.errorHint}`;
    } else if (error.message) {
      errorMessage = `Failed to save expense: ${error.message}. ${adminDetails.errorHint}`;
    }
    return { success: false, error: errorMessage };
  }
}


export async function getExpenses(idToken: string): Promise<Expense[]> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  if (!adminAuth || !adminDb) {
    console.error("getExpenses: Firebase Admin SDK not initialized.");
    return [];
  }
  if (!idToken) return [];

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDocSnap = await adminDb.collection('users').doc(uid).get();
    if (!userDocSnap.exists) {
      console.warn(`getExpenses: User document not found for userId: ${uid}.`);
      return [];
    }
    const userData = userDocSnap.data() as UserProfile;
    const companyId = userData?.companyId;
    const userRole = userData?.role;

    let expensesQuery;
    if (companyId && (userRole === 'owner' || userRole === 'admin' || userRole === 'auditor')) {
      // Owner, Admin, Auditor: Fetch all expenses for their company
      expensesQuery = adminDb.collection('expenses')
        .where('companyId', '==', companyId)
        .orderBy('expenseDate', 'desc')
        .orderBy('createdAt', 'desc');
    } else if (companyId && userRole === 'user') {
      // Regular user in a company: Fetch only their own expenses within that company
      expensesQuery = adminDb.collection('expenses')
        .where('userId', '==', uid)
        .where('companyId', '==', companyId) // Ensure it's for their company
        .orderBy('expenseDate', 'desc')
        .orderBy('createdAt', 'desc');
    } else {
      // User not in a company: Fetch only their own expenses
      expensesQuery = adminDb.collection('expenses')
        .where('userId', '==', uid)
        .orderBy('expenseDate', 'desc')
        .orderBy('createdAt', 'desc');
    }

    const snapshot = await expensesQuery.get();
    return snapshot.docs.map(doc => {
      const data = doc.data();
      const expenseDate = data.expenseDate instanceof admin.firestore.Timestamp ? data.expenseDate.toDate() : new Date(data.expenseDate);
      const createdAt = data.createdAt instanceof admin.firestore.Timestamp ? data.createdAt.toDate() : new Date(data.createdAt);
      return { id: doc.id, ...data, expenseDate, createdAt } as unknown as Expense;
    });

  } catch (error: any) {
    console.error(`getExpenses: Error fetching expenses:`, error);
    // Handle specific errors as in saveExpense for consistency
    return [];
  }
}

export async function deleteExpense(idToken: string, expenseId: string): Promise<{ success: boolean; error?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  if (!adminAuth || !adminDb) return { success: false, error: "Admin SDK not initialized." };
  if (!idToken) return { success: false, error: "Auth token not provided." };

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const expenseRef = adminDb.collection('expenses').doc(expenseId);
    const expenseDoc = await expenseRef.get();
    if (!expenseDoc.exists) return { success: false, error: "Expense not found." };
    const expenseData = expenseDoc.data() as Expense;

    const userDocSnap = await adminDb.collection('users').doc(uid).get();
    if (!userDocSnap.exists) return { success: false, error: "User profile not found." };
    const userData = userDocSnap.data() as UserProfile;

    let authorized = false;
    if (expenseData.userId === uid && !expenseData.companyId) { // Own expense, not company
      authorized = true;
    } else if (expenseData.companyId && expenseData.companyId === userData.companyId) { // Company expense
      if (userData.role === 'owner' || userData.role === 'admin') {
        authorized = true;
      } else if (userData.role === 'user' && expenseData.userId === uid) {
        authorized = true; // User can delete their own company expense IF policy allows (current: yes)
      }
    }

    if (!authorized) return { success: false, error: "You are not authorized to delete this expense." };

    await expenseRef.delete();
    revalidatePath('/');
    return { success: true };

  } catch (error: any) {
    console.error(`deleteExpense: Error deleting expense ${expenseId}:`, error);
    return { success: false, error: error.message || "Failed to delete expense." };
  }
}

export async function updateExpenseStatus(idToken: string, expenseId: string, newStatus: ExpenseStatus): Promise<{ success: boolean; error?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  if (!adminAuth || !adminDb) return { success: false, error: "Admin SDK not initialized." };
  if (!idToken) return { success: false, error: "Auth token not provided." };

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const expenseRef = adminDb.collection('expenses').doc(expenseId);
    const expenseDoc = await expenseRef.get();
    if (!expenseDoc.exists) return { success: false, error: "Expense not found." };
    const expenseData = expenseDoc.data() as Expense;

    if (!expenseData.companyId) return { success: false, error: "This expense is not a company expense." };

    const userDocSnap = await adminDb.collection('users').doc(uid).get();
    if (!userDocSnap.exists) return { success: false, error: "User profile not found." };
    const userData = userDocSnap.data() as UserProfile;

    if (expenseData.companyId !== userData.companyId || (userData.role !== 'owner' && userData.role !== 'admin')) {
      return { success: false, error: "You are not authorized to update this expense's status." };
    }

    await expenseRef.update({ status: newStatus });
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error(`updateExpenseStatus: Error updating status for expense ${expenseId}:`, error);
    return { success: false, error: error.message || "Failed to update expense status." };
  }
}


// Company Actions
export async function createCompany(idToken: string, companyName: string): Promise<{ success: boolean; error?: string; companyId?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) return { success: false, error: "Admin SDK not initialized." };
  if (!idToken) return { success: false, error: "Auth token not provided." };

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Check if user is already in a company
    const userDocSnap = await adminDb.collection('users').doc(uid).get();
    if (userDocSnap.exists && (userDocSnap.data() as UserProfile).companyId) {
      return { success: false, error: "User is already part of a company." };
    }

    const companyData: Omit<Company, 'id'> = {
      name: companyName,
      ownerId: uid,
      members: [uid], // Owner is the first member
      createdAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
    };
    const companyRef = await adminDb.collection('companies').add(companyData);

    // Update user's profile with companyId and role 'owner'
    await adminDb.collection('users').doc(uid).set({ companyId: companyRef.id, role: 'owner' as UserRole }, { merge: true });

    revalidatePath('/company');
    revalidatePath('/');
    return { success: true, companyId: companyRef.id };
  } catch (error: any) {
    console.error("Error creating company:", error);
    return { success: false, error: error.message || "Failed to create company." };
  }
}


export async function sendInvitation(idToken: string, companyId: string, inviteeEmail: string, role: UserRole): Promise<{ success: boolean; error?: string; invitationId?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) return { success: false, error: "Admin SDK not initialized." };
  if (!idToken) return { success: false, error: "Auth token not provided." };

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const inviterUid = decodedToken.uid;

    const companyDoc = await adminDb.collection('companies').doc(companyId).get();
    if (!companyDoc.exists) return { success: false, error: "Company not found." };
    const companyData = companyDoc.data() as Company;

    // Check inviter's role
    const inviterUserDoc = await adminDb.collection('users').doc(inviterUid).get();
    if (!inviterUserDoc.exists) return { success: false, error: "Inviter profile not found." };
    const inviterProfile = inviterUserDoc.data() as UserProfile;
    if (inviterProfile.companyId !== companyId || (inviterProfile.role !== 'owner' && inviterProfile.role !== 'admin')) {
      return { success: false, error: "You are not authorized to invite users to this company." };
    }
    if (role === 'owner' && inviterProfile.role !== 'owner') {
      return { success: false, error: "Only owners can invite other owners." };
    }


    // Check if invitee is already a member
    try {
      const inviteeUserRecord = await adminAuth.getUserByEmail(inviteeEmail);
      const inviteeProfileDoc = await adminDb.collection('users').doc(inviteeUserRecord.uid).get();
      if (inviteeProfileDoc.exists()) {
        const inviteeProfile = inviteeProfileDoc.data() as UserProfile;
        if (inviteeProfile.companyId === companyId) {
          return { success: false, error: "User is already a member of this company." };
        }
      }
    } catch (e: any) {
      if (e.code !== 'auth/user-not-found') { // If user exists but other error, rethrow or handle
        console.error("Error checking invitee's existing membership:", e);
      }
      // If user not found, it's okay, they can be invited.
    }


    const invitationData: Omit<Invitation, 'id'> = {
      companyId,
      companyName: companyData.name,
      inviteeEmail,
      inviterId: inviterUid,
      role, // Store the intended role
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
    };
    const invitationRef = await adminDb.collection('invitations').add(invitationData);

    revalidatePath(`/company`); // Simplified revalidation
    return { success: true, invitationId: invitationRef.id };
  } catch (error: any) {
    console.error("Error sending invitation:", error);
    return { success: false, error: error.message || "Failed to send invitation." };
  }
}

export async function acceptInvitation(idToken: string, invitationId: string): Promise<{ success: boolean; error?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) return { success: false, error: "Admin SDK not initialized." };
  if (!idToken) return { success: false, error: "Auth token not provided." };

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const acceptingUserId = decodedToken.uid;
    const acceptingUserEmail = decodedToken.email;

    const invitationRef = adminDb.collection('invitations').doc(invitationId);
    const invitationDoc = await invitationRef.get();
    if (!invitationDoc.exists) return { success: false, error: "Invitation not found." };
    const invitationData = invitationDoc.data() as Invitation;

    if (invitationData.inviteeEmail.toLowerCase() !== acceptingUserEmail?.toLowerCase()) {
      return { success: false, error: "This invitation is not for you." };
    }
    if (invitationData.status !== 'pending') {
      return { success: false, error: `Invitation already ${invitationData.status}.` };
    }

    // Check if user is already in another company. If so, they must leave first.
    // For simplicity, this action will override current company if any.
    // A more robust solution would inform user or prevent.
    // const userProfileDoc = await adminDb.collection('users').doc(acceptingUserId).get();
    // if(userProfileDoc.exists() && (userProfileDoc.data() as UserProfile).companyId) {
    //     return { success: false, error: "You are already part of a company. Please leave it before joining a new one." };
    // }


    const companyRef = adminDb.collection('companies').doc(invitationData.companyId);
    await adminDb.runTransaction(async (transaction) => {
      const companyDoc = await transaction.get(companyRef);
      if (!companyDoc.exists) throw new Error("Company associated with this invitation no longer exists.");

      transaction.update(companyRef, { members: admin.firestore.FieldValue.arrayUnion(acceptingUserId) });
      transaction.update(invitationRef, {
        status: 'accepted',
        acceptedBy: acceptingUserId,
        acceptedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      transaction.set(adminDb.collection('users').doc(acceptingUserId), {
        companyId: invitationData.companyId,
        role: invitationData.role // Assign role from invitation
      }, { merge: true });
    });

    revalidatePath('/company');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error("Error accepting invitation:", error);
    return { success: false, error: error.message || "Failed to accept invitation." };
  }
}

export async function updateUserRole(idToken: string, targetUserId: string, companyId: string, newRole: UserRole): Promise<{ success: boolean; error?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) return { success: false, error: "Admin SDK not initialized." };
  if (!idToken) return { success: false, error: "Auth token not provided." };

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    // Verify requester's role
    const requesterProfileDoc = await adminDb.collection('users').doc(requesterUid).get();
    if (!requesterProfileDoc.exists) return { success: false, error: "Requester profile not found." };
    const requesterProfile = requesterProfileDoc.data() as UserProfile;

    if (requesterProfile.companyId !== companyId) return { success: false, error: "Requester not part of this company." };

    const companyDoc = await adminDb.collection('companies').doc(companyId).get();
    if (!companyDoc.exists) return { success: false, error: "Company not found." };
    const companyData = companyDoc.data() as Company;

    // Authorization logic for changing roles
    if (requesterProfile.role === 'owner') {
      // Owner can change any role, but cannot demote the last owner (themselves if targetUserId is ownerId) unless newRole is also 'owner' (transfer)
      if (targetUserId === companyData.ownerId && newRole !== 'owner' && companyData.members.filter(async id => (await adminDb.collection('users').doc(id).get().then(d => (d.data() as UserProfile)?.role === 'owner'))).length <= 1) {
        return { success: false, error: "Cannot demote the sole owner." };
      }
    } else if (requesterProfile.role === 'admin') {
      if (newRole === 'owner' || newRole === 'admin') return { success: false, error: "Admins cannot promote to owner or admin." };
      const targetUserProfileDoc = await adminDb.collection('users').doc(targetUserId).get();
      if (targetUserProfileDoc.exists() && ((targetUserProfileDoc.data() as UserProfile).role === 'owner' || (targetUserProfileDoc.data() as UserProfile).role === 'admin')) {
        return { success: false, error: "Admins cannot change roles of owners or other admins." };
      }
    } else {
      return { success: false, error: "You are not authorized to change roles." };
    }

    // If changing to owner, update company's ownerId and ensure old owner (if different) is no longer owner
    if (newRole === 'owner' && targetUserId !== companyData.ownerId) {
      await adminDb.collection('users').doc(companyData.ownerId).update({ role: 'admin' }); // Demote old owner to admin or other role
      await adminDb.collection('companies').doc(companyId).update({ ownerId: targetUserId });
    }


    await adminDb.collection('users').doc(targetUserId).update({ role: newRole });
    revalidatePath('/company');
    return { success: true };

  } catch (error: any) {
    console.error("Error updating user role:", error);
    return { success: false, error: error.message || "Failed to update role." };
  }
}

export async function removeUserFromCompany(idToken: string, targetUserId: string, companyId: string): Promise<{ success: boolean; error?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) return { success: false, error: "Admin SDK not initialized." };
  if (!idToken) return { success: false, error: "Auth token not provided." };

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    const companyRef = adminDb.collection('companies').doc(companyId);
    const companyDoc = await companyRef.get();
    if (!companyDoc.exists) return { success: false, error: "Company not found." };
    const companyData = companyDoc.data() as Company;

    if (targetUserId === companyData.ownerId) return { success: false, error: "Owner cannot be removed. Transfer ownership first." };

    const requesterProfileDoc = await adminDb.collection('users').doc(requesterUid).get();
    if (!requesterProfileDoc.exists) return { success: false, error: "Requester profile not found." };
    const requesterProfile = requesterProfileDoc.data() as UserProfile;

    if (requesterProfile.companyId !== companyId || (requesterProfile.role !== 'owner' && requesterProfile.role !== 'admin')) {
      return { success: false, error: "You are not authorized to remove users from this company." };
    }

    // Admins cannot remove other admins or owners (owner case already handled)
    if (requesterProfile.role === 'admin') {
      const targetUserProfileDoc = await adminDb.collection('users').doc(targetUserId).get();
      if (targetUserProfileDoc.exists() && (targetUserProfileDoc.data() as UserProfile).role === 'admin') {
        return { success: false, error: "Admins cannot remove other admins." };
      }
    }


    await adminDb.collection('users').doc(targetUserId).update({ companyId: null, role: null });
    await companyRef.update({ members: admin.firestore.FieldValue.arrayRemove(targetUserId) });

    revalidatePath('/company');
    return { success: true };

  } catch (error: any) {
    console.error("Error removing user from company:", error);
    return { success: false, error: error.message || "Failed to remove user." };
  }
}

export async function leaveCompany(idToken: string, companyId: string): Promise<{ success: boolean; error?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) return { success: false, error: "Admin SDK not initialized." };
  if (!idToken) return { success: false, error: "Auth token not provided." };

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const companyRef = adminDb.collection('companies').doc(companyId);
    const companyDoc = await companyRef.get();
    if (!companyDoc.exists) return { success: false, error: "Company not found." };
    const companyData = companyDoc.data() as Company;

    if (userId === companyData.ownerId) return { success: false, error: "Owner cannot leave. Transfer ownership or delete company." };

    await adminDb.collection('users').doc(userId).update({ companyId: null, role: null });
    await companyRef.update({ members: admin.firestore.FieldValue.arrayRemove(userId) });

    revalidatePath('/company');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error("Error leaving company:", error);
    return { success: false, error: error.message || "Failed to leave company." };
  }
}


// Client-side readable actions (use Firebase client SDK)
export async function getCompaniesForUser(idToken: string): Promise<Company[]> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  if (!adminAuth || !adminDb) {
    console.error("getCompaniesForUser: Firebase Admin SDK not initialized.");
    return [];
  }
  if (!idToken) {
    console.error("getCompaniesForUser: Auth token not provided.");
    return [];
  }

  try {
    // Verify the ID token and get the user's UID
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Query Firestore for companies where the user is either the owner or a member
    const ownerQuery = adminDb.collection('companies').where('ownerId', '==', uid);
    const memberQuery = adminDb.collection('companies').where('members', 'array-contains', uid);

    const [ownerSnapshot, memberSnapshot] = await Promise.all([ownerQuery.get(), memberQuery.get()]);

    // Use a Map to avoid duplicates if the user is both an owner and a member
    const companiesMap = new Map<string, Company>();
    ownerSnapshot.docs.forEach(doc => {
      const data = doc.data();
      companiesMap.set(doc.id, {
        id: doc.id,
        ...data,
        createdAt: data.createdAt instanceof admin.firestore.Timestamp ? data.createdAt.toDate() : data.createdAt,
      } as Company);
    });
    memberSnapshot.docs.forEach(doc => {
      if (!companiesMap.has(doc.id)) {
        const data = doc.data();
        companiesMap.set(doc.id, {
          id: doc.id,
          ...data,
          createdAt: data.createdAt instanceof admin.firestore.Timestamp ? data.createdAt.toDate() : data.createdAt,
        } as Company);
      }
    });

    return Array.from(companiesMap.values());
  } catch (error) {
    console.error("getCompaniesForUser: Error fetching companies:", error);
    return [];
  }
}

export async function getInvitationsForUser(idToken: string): Promise<Invitation[]> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  if (!adminAuth || !adminDb) {
    console.error("getInvitationsForUser: Firebase Admin SDK not initialized.");
    return [];
  }
  if (!idToken) {
    console.error("getInvitationsForUser: Auth token not provided.");
    return [];
  }

  try {
    // Verify the ID token and get the user's email
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userEmail = decodedToken.email;

    if (!userEmail) {
      console.error("getInvitationsForUser: User email not found in token.");
      return [];
    }

    // Query Firestore for invitations where the inviteeEmail matches the user's email
    const invitationsQuery = adminDb
      .collection('invitations')
      .where('inviteeEmail', '==', userEmail)
      .where('status', '==', 'pending');

    const snapshot = await invitationsQuery.get();

    return snapshot.docs.map(doc => {
      const data = doc.data();
      const createdAt = data.createdAt instanceof admin.firestore.Timestamp ? data.createdAt.toDate() : new Date(data.createdAt);
      return { id: doc.id, ...data, createdAt } as unknown as Invitation;
    });
  } catch (error) {
    console.error("getInvitationsForUser: Error fetching invitations:", error);
    return [];
  }
}

export const fetchMemberDisplayNames = async (memberIds: string[]): Promise<Record<string, string>> => {
  const adminDb = getAdminDb(); // Ensure you have access to Firestore Admin SDK
  const memberNames: Record<string, string> = {};

  try {
    const memberDocs = await Promise.all(
      memberIds.map(memberId => adminDb.collection('users').doc(memberId).get())
    );

    memberDocs.forEach(doc => {
      if (doc.exists) {
        const data = doc.data();
        memberNames[doc.id] = data?.displayName || doc.id; // Use displayName or fallback to UID
      }
    });
  } catch (error) {
    console.error("Error fetching member display names:", error);
  }

  return memberNames;
};