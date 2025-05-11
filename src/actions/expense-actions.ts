// src/actions/expense-actions.ts
'use server';

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
    return { success: false, error: "Firebase Admin SDK not initialized correctly on the server." };
  }

  if (!idToken) {
    return { success: false, error: "ID token was not provided to the server action." };
  }

  try {
    // 1. Verify the ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // 2. Prepare data with verified userId
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

    // 3. Add the document to Firestore using the admin SDK
    const docRef = await adminDb.collection('expenses').add(expenseData);
    
    revalidatePath('/'); 
    return { success: true, docId: docRef.id };

  } catch (error: any) {
    console.error("Error in server action (saveExpense):", error);
    let errorMessage = "Failed to save expense. Please try again.";
    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error.code === 'auth/argument-error' || 
               (error.message && (error.message.includes('VerifyIdTokenRequest') || error.message.toLowerCase().includes('invalid format') || error.message.toLowerCase().includes('invalid token')))) {
      errorMessage = 'Invalid ID token provided. Please try logging in again.';
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
    return { success: false, error: "Firebase Admin SDK not initialized." };
  }
  if (!idToken) {
    return { success: false, error: "Authentication token not provided." };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const companyData: Omit<Company, 'id'> = {
      name: companyName,
      ownerId: uid,
      members: [uid], // Owner is initially the only member
      createdAt: serverTimestamp() as Timestamp,
    };

    const companyRef = await adminDb.collection('companies').add(companyData);
    
    // Update user document with companyId (optional, but good for quick lookups)
    await adminDb.collection('users').doc(uid).update({ companyId: companyRef.id });
    
    revalidatePath('/companies'); // Or a relevant path
    return { success: true, companyId: companyRef.id };
  } catch (error: any) {
    console.error("Error creating company:", error);
    let errorMessage = "Failed to create company.";
     if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error.code === 'auth/argument-error') {
      errorMessage = 'Invalid ID token provided.';
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
    return { success: false, error: "Firebase Admin SDK not initialized." };
  }
   if (!idToken) {
    return { success: false, error: "Authentication token not provided." };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const inviterUid = decodedToken.uid;

    // Check if inviter is part of the company (optional, based on rules)
    const companyDoc = await adminDb.collection('companies').doc(companyId).get();
    if (!companyDoc.exists) {
      return { success: false, error: "Company not found." };
    }
    const companyData = companyDoc.data() as Company;
    if (!companyData.members.includes(inviterUid) && companyData.ownerId !== inviterUid) {
        return { success: false, error: "You are not authorized to invite users to this company." };
    }

    // Check if user already exists or is already a member
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
    
    // Here you would typically send an email to inviteeEmail with a link
    // For this example, we'll just log it.
    console.log(`Invitation sent to ${inviteeEmail} for company ${companyData.name}. Invitation ID: ${invitationRef.id}`);
    // TODO: Implement email sending logic (e.g., using Firebase Extensions or a third-party service)

    revalidatePath(`/companies/${companyId}/invitations`); // Or a relevant path
    return { success: true, invitationId: invitationRef.id };

  } catch (error: any) {
    console.error("Error sending invitation:", error);
    let errorMessage = "Failed to send invitation.";
    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error.code === 'auth/argument-error') {
      errorMessage = 'Invalid ID token provided.';
    } else if (error.code === 'auth/user-not-found' && error.message.includes(inviteeEmail)) {
      // This might be okay if you allow inviting non-existing users who will sign up
      // For now, let's allow it and the invitation will wait for them to register.
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
    return { success: false, error: "Firebase Admin SDK not initialized." };
  }
  if (!idToken) {
    return { success: false, error: "Authentication token not provided." };
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
    
    // Transaction to update company members and invitation status
    await adminDb.runTransaction(async (transaction) => {
      const companyDoc = await transaction.get(companyRef);
      if (!companyDoc.exists) {
        throw new Error("Company associated with this invitation no longer exists.");
      }
      const companyData = companyDoc.data() as Company;
      const updatedMembers = Array.from(new Set([...companyData.members, acceptingUserId]));
      
      transaction.update(companyRef, { members: updatedMembers });
      transaction.update(invitationRef, { status: 'accepted', acceptedBy: acceptingUserId, acceptedAt: serverTimestamp() });
      // Also update user's companyId
      transaction.update(adminDb.collection('users').doc(acceptingUserId), { companyId: invitationData.companyId });
    });
    
    revalidatePath('/companies'); // Or relevant paths
    revalidatePath(`/companies/${invitationData.companyId}`);
    return { success: true };

  } catch (error: any) {
    console.error("Error accepting invitation:", error);
    let errorMessage = "Failed to accept invitation.";
     if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error.code === 'auth/argument-error') {
      errorMessage = 'Invalid ID token provided.';
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
        // Query for companies where the user is a member OR the owner
        // Firestore does not support OR queries on different fields directly in this way.
        // A common workaround is to query for one condition and filter client-side, or duplicate data.
        // For simplicity here, we'll fetch companies where user is in 'members' array.
        // A more robust solution might involve a 'userCompanies' subcollection or denormalization.
        const q = query(companiesCol, where('members', 'array-contains', userId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company));
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