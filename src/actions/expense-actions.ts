// src/actions/expense-actions.ts
'use server';

import admin from 'firebase-admin'; 
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { db } from '@/lib/firebase'; 
import type { Expense, ExpenseFormData, ExpenseItem, ExpenseCategory, PaymentMethod } from '@/types/expense';
import { extractReceiptData, type ExtractReceiptDataInput } from '@/ai/flows/extract-receipt-data';
import type { ExtractReceiptDataOutput as AIExtractReceiptDataOutput } from '@/ai/flows/extract-receipt-data';
import { collection, getDocs, query, orderBy, Timestamp, serverTimestamp, where, addDoc as clientAddDoc } from 'firebase/firestore'; 
import { revalidatePath } from 'next/cache';
import { expenseCategories, paymentMethods } from '@/types/expense';
import type { Company } from '@/types/company';
import type { Invitation } from '@/types/invitation';

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
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        errorHint = "GOOGLE_APPLICATION_CREDENTIALS env var not set. ";
      } else if (admin.apps.length === 0) {
        errorHint = "Firebase Admin SDK potentially not initialized (admin.apps is empty). Check server logs for GOOGLE_APPLICATION_CREDENTIALS path/permission issues. ";
      } else {
        errorHint = "Admin SDK initialized but no projectId found. Check service account JSON validity. ";
      }
      // Fallback for project ID from FIREBASE_CONFIG (often in Firebase environments)
      if (process.env.FIREBASE_CONFIG) {
        try {
            const fbConfig = JSON.parse(process.env.FIREBASE_CONFIG);
            if (fbConfig.projectId) {
                projectId = fbConfig.projectId;
                errorHint = projectId === "N/A (Admin SDK project ID not available)" ? errorHint : ""; // Clear hint if projectId found this way
            }
        } catch(e) {/*ignore*/ }
      }
    }
  } catch (e) {
    console.error("Failed to retrieve admin project ID for error reporting (this is not the ID token error itself):", e);
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
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      errorMsg += " GOOGLE_APPLICATION_CREDENTIALS environment variable is not set. Please check your .env.local file and restart the server.";
    } else {
      errorMsg += " Check server logs for Firebase Admin initialization errors related to your service account file.";
    }
    console.error("saveExpense:", errorMsg);
    return { success: false, error: errorMsg };
  }

  if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
    console.error("saveExpense: ID token was not provided, not a string, or empty. Token received (type):", typeof idToken, "Token (is falsy):", !idToken);
    return { success: false, error: "ID token was not provided or was invalid before verification. Please try logging in again." };
  }


  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const items: ExpenseItem[] = data.items.map(item => {
      const quantity = Number(item.quantity) || 1;
      const netPrice = Number(item.netPrice) || 0;
      return {
        name: item.name,
        quantity: quantity <= 0 ? 1 : quantity,
        netPrice,
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.netPrice, 0);
    
    const expenseData = {
      userId: uid, 
      company: data.company,
      items,
      category: data.category,
      totalAmount,
      expenseDate: Timestamp.fromDate(new Date(data.expenseDate)), 
      paymentMethod: data.paymentMethod,
      createdAt: serverTimestamp(), 
    };

    const docRef = await adminDb.collection('expenses').add(expenseData);
    
    revalidatePath('/'); 
    return { success: true, docId: docRef.id };

  } catch (error: any) {
    console.error("Error in server action (saveExpense):", error);
    let errorMessage = "Failed to save expense. Please try again.";
    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error.code === 'auth/argument-error' || 
               (error.message && (error.message.toLowerCase().includes('verifyidtokenrequest') || error.message.toLowerCase().includes('invalid format') || error.message.toLowerCase().includes('invalid token')))) {
      
      const adminDetails = getAdminProjectDetails();
      const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'MISSING_CLIENT_ENV_VAR';
      const detailedAdminError = `${adminDetails.errorHint}Client Project ID (from env): ${clientProjectId}. Admin SDK Project ID: ${adminDetails.projectId}.`;
      
      console.error(`saveExpense: verifyIdToken failed. ${detailedAdminError} Ensure client/admin project IDs match and Admin SDK is properly initialized (check GOOGLE_APPLICATION_CREDENTIALS in .env.local and server logs). Token (first 20 chars): ${idToken ? idToken.substring(0,20) : "N/A"}... Token length: ${idToken ? idToken.length : "N/A"}. Full error:`, error.message);
      errorMessage = `Invalid ID token. ${detailedAdminError} If IDs match and Admin SDK seems fine, the token might be malformed. Try logging in again.`;
    } else if (error.code === 'permission-denied' || (error.message && error.message.toLowerCase().includes('permission denied'))) {
        errorMessage = 'Firestore permission denied. Check your security rules and Admin SDK setup.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return { success: false, error: errorMessage };
  }
}


export async function getExpenses(userId: string): Promise<Expense[]> {
  if (!userId) {
    console.warn("getExpenses called without userId.");
    return [];
  }
  try {
    const expensesCol = collection(db, 'expenses'); 
    const q = query(
        expensesCol, 
        where('userId', '==', userId), 
        orderBy('expenseDate', 'desc'), 
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id,
        ...data,
        expenseDate: (data.expenseDate as Timestamp).toDate(), 
        createdAt: (data.createdAt as Timestamp).toDate(),   
      } as unknown as Expense; 
    });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return [];
  }
}

// Company Actions
export async function createCompany(idToken: string, companyName: string): Promise<{ success: boolean; error?: string; companyId?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  if (!adminAuth || !adminDb) {
     let errorMsg = "Firebase Admin SDK not initialized correctly.";
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      errorMsg += " GOOGLE_APPLICATION_CREDENTIALS env var not set.";
    }
    return { success: false, error: errorMsg };
  }
  if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
    console.error("createCompany: ID token was not provided, not a string, or empty.");
    return { success: false, error: "Authentication token not provided or invalid." };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const companyData: Omit<Company, 'id'> = {
      name: companyName,
      ownerId: uid,
      members: [uid], 
      createdAt: serverTimestamp() as Timestamp,
    };

    const companyRef = await adminDb.collection('companies').add(companyData);
    
    await adminDb.collection('users').doc(uid).set({ companyId: companyRef.id }, { merge: true });
    
    revalidatePath('/companies'); 
    return { success: true, companyId: companyRef.id };
  } catch (error: any) {
    console.error("Error creating company:", error);
    let errorMessage = "Failed to create company.";
     if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error.code === 'auth/argument-error') {
        const adminDetails = getAdminProjectDetails();
        const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'MISSING_CLIENT_ENV_VAR';
        const detailedAdminError = `${adminDetails.errorHint}Client Project ID: ${clientProjectId}. Admin SDK Project ID: ${adminDetails.projectId}.`;
        console.error(`createCompany: verifyIdToken failed. ${detailedAdminError} Token (first 20): ${idToken ? idToken.substring(0,20) : "N/A"}`);
        errorMessage = `Invalid ID token. ${detailedAdminError} Check for mismatch or Admin SDK init issues.`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return { success: false, error: errorMessage };
  }
}


export async function sendInvitation(idToken: string, companyId: string, inviteeEmail: string): Promise<{ success: boolean; error?: string; invitationId?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  if (!adminAuth || !adminDb) {
    let errorMsg = "Firebase Admin SDK not initialized correctly.";
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      errorMsg += " GOOGLE_APPLICATION_CREDENTIALS env var not set.";
    }
    return { success: false, error: errorMsg };
  }
   if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
    console.error("sendInvitation: ID token was not provided, not a string, or empty.");
    return { success: false, error: "Authentication token not provided or invalid." };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const inviterUid = decodedToken.uid;

    const companyDoc = await adminDb.collection('companies').doc(companyId).get();
    if (!companyDoc.exists) {
      return { success: false, error: "Company not found." };
    }
    const companyData = companyDoc.data() as Company;
    if (!companyData.members.includes(inviterUid) && companyData.ownerId !== inviterUid) {
        return { success: false, error: "You are not authorized to invite users to this company." };
    }

    const inviteeUserRecord = await adminAuth.getUserByEmail(inviteeEmail).catch(() => null);
    if (inviteeUserRecord && companyData.members.includes(inviteeUserRecord.uid)) {
        return { success: false, error: "User is already a member of this company."};
    }
    
    const invitationData: Omit<Invitation, 'id'> = {
      companyId,
      companyName: companyData.name,
      inviteeEmail,
      inviterId: inviterUid,
      status: 'pending',
      createdAt: serverTimestamp() as Timestamp,
    };

    const invitationRef = await adminDb.collection('invitations').add(invitationData);
    
    console.log(`Invitation sent to ${inviteeEmail} for company ${companyData.name}. Invitation ID: ${invitationRef.id}`);

    revalidatePath(`/companies/${companyId}/invitations`); 
    return { success: true, invitationId: invitationRef.id };

  } catch (error: any) {
    console.error("Error sending invitation:", error);
    let errorMessage = "Failed to send invitation.";
    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error.code === 'auth/argument-error') {
      const adminDetails = getAdminProjectDetails();
      const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'MISSING_CLIENT_ENV_VAR';
      const detailedAdminError = `${adminDetails.errorHint}Client Project ID: ${clientProjectId}. Admin SDK Project ID: ${adminDetails.projectId}.`;
      console.error(`sendInvitation: verifyIdToken failed. ${detailedAdminError} Token (first 20): ${idToken ? idToken.substring(0,20) : "N/A"}`);
      errorMessage = `Invalid ID token. ${detailedAdminError} Check for mismatch or Admin SDK init issues.`;
    } else if (error.code === 'auth/user-not-found' && error.message.includes(inviteeEmail)) {
      // This is fine for creating an invitation for a new user.
      // The error message will be handled by the generic clause if it's not this specific case.
    } else if (error.message) {
      errorMessage = error.message;
    }
    return { success: false, error: errorMessage };
  }
}

export async function acceptInvitation(idToken: string, invitationId: string): Promise<{ success: boolean; error?: string }> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  if (!adminAuth || !adminDb) {
    let errorMsg = "Firebase Admin SDK not initialized correctly.";
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      errorMsg += " GOOGLE_APPLICATION_CREDENTIALS env var not set.";
    }
    return { success: false, error: errorMsg };
  }
  if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
    console.error("acceptInvitation: ID token was not provided, not a string, or empty.");
    return { success: false, error: "Authentication token not provided or invalid." };
  }
  
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const acceptingUserId = decodedToken.uid;
    const acceptingUserEmail = decodedToken.email;

    const invitationRef = adminDb.collection('invitations').doc(invitationId);
    const invitationDoc = await invitationRef.get();

    if (!invitationDoc.exists) {
      return { success: false, error: "Invitation not found." };
    }

    const invitationData = invitationDoc.data() as Invitation;

    if (invitationData.inviteeEmail.toLowerCase() !== acceptingUserEmail?.toLowerCase()) {
      return { success: false, error: "This invitation is not for you." };
    }
    if (invitationData.status !== 'pending') {
      return { success: false, error: `Invitation already ${invitationData.status}.` };
    }

    const companyRef = adminDb.collection('companies').doc(invitationData.companyId);
    
    await adminDb.runTransaction(async (transaction) => {
      const companyDoc = await transaction.get(companyRef);
      if (!companyDoc.exists) {
        throw new Error("Company associated with this invitation no longer exists.");
      }
      const companyData = companyDoc.data() as Company;
      
      const updatedMembers = Array.from(new Set([...companyData.members, acceptingUserId]));
      
      transaction.update(companyRef, { members: updatedMembers });
      transaction.update(invitationRef, { status: 'accepted', acceptedBy: acceptingUserId, acceptedAt: serverTimestamp() });
      
      transaction.set(adminDb.collection('users').doc(acceptingUserId), { companyId: invitationData.companyId }, { merge: true });
    });
    
    revalidatePath('/companies'); 
    revalidatePath(`/companies/${invitationData.companyId}`);
    return { success: true };

  } catch (error: any) {
    console.error("Error accepting invitation:", error);
    let errorMessage = "Failed to accept invitation.";
     if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error.code === 'auth/argument-error') {
      const adminDetails = getAdminProjectDetails();
      const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'MISSING_CLIENT_ENV_VAR';
      const detailedAdminError = `${adminDetails.errorHint}Client Project ID: ${clientProjectId}. Admin SDK Project ID: ${adminDetails.projectId}.`;
      console.error(`acceptInvitation: verifyIdToken failed. ${detailedAdminError} Token (first 20): ${idToken ? idToken.substring(0,20) : "N/A"}`);
      errorMessage = `Invalid ID token. ${detailedAdminError} Check for mismatch or Admin SDK init issues.`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return { success: false, error: errorMessage };
  }
}

export async function getCompaniesForUser(userId: string): Promise<Company[]> {
    if (!userId) return [];
    try {
        const companiesCol = collection(db, 'companies');
        const qOwner = query(companiesCol, where('ownerId', '==', userId));
        const qMember = query(companiesCol, where('members', 'array-contains', userId));
        
        const [ownerSnapshot, memberSnapshot] = await Promise.all([getDocs(qOwner), getDocs(qMember)]);
        
        const companiesMap = new Map<string, Company>();
        ownerSnapshot.docs.forEach(doc => companiesMap.set(doc.id, { id: doc.id, ...doc.data() } as Company));
        memberSnapshot.docs.forEach(doc => companiesMap.set(doc.id, { id: doc.id, ...doc.data() } as Company));
        
        return Array.from(companiesMap.values());
    } catch (error) {
        console.error("Error fetching companies:", error);
        return [];
    }
}

export async function getInvitationsForUser(email: string): Promise<Invitation[]> {
    if (!email) return [];
    try {
        const invitationsCol = collection(db, 'invitations');
        const q = query(invitationsCol, where('inviteeEmail', '==', email), where('status', '==', 'pending'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invitation));
    } catch (error) {
        console.error("Error fetching invitations:", error);
        return [];
    }
}
