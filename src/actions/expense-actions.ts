// src/actions/expense-actions.ts
'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { db } from '@/lib/firebase'; // Keep for client-side queries if needed, e.g. getExpenses
import type { Expense, ExpenseFormData, ExpenseItem, ExpenseCategory, PaymentMethod } from '@/types/expense';
import { extractReceiptData, type ExtractReceiptDataInput } from '@/ai/flows/extract-receipt-data';
import type { ExtractReceiptDataOutput as AIExtractReceiptDataOutput } from '@/ai/flows/extract-receipt-data';
import { collection, getDocs, query, orderBy, Timestamp, serverTimestamp, where, addDoc as clientAddDoc } from 'firebase/firestore'; // renamed addDoc to clientAddDoc
import { revalidatePath } from 'next/cache';
import { expenseCategories, paymentMethods } from '@/types/expense';

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
      userId: uid, // Associate the expense with the authenticated user
      company: data.company,
      items,
      category: data.category,
      totalAmount,
      expenseDate: Timestamp.fromDate(new Date(data.expenseDate)), // Firestore Timestamp for server
      paymentMethod: data.paymentMethod,
      createdAt: serverTimestamp(), // Firestore server timestamp
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
    } else if (error.code === 'auth/argument-error') {
      errorMessage = 'Invalid ID token provided.';
    } else if (error.code === 'permission-denied' && error.message.includes('firestore')) {
        errorMessage = 'Firestore permission denied. Check your security rules and Admin SDK setup.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return { success: false, error: errorMessage };
  }
}

// getExpenses can remain using client-side SDK as it's for fetching data for the current user
export async function getExpenses(userId: string): Promise<Expense[]> {
  if (!userId) {
    console.warn("getExpenses called without userId.");
    return [];
  }
  try {
    const expensesCol = collection(db, 'expenses'); // client-side db
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
        expenseDate: (data.expenseDate as Timestamp).toDate(), // Convert Firestore Timestamp to JS Date
        createdAt: (data.createdAt as Timestamp).toDate(),   // Convert Firestore Timestamp to JS Date
      } as unknown as Expense; 
    });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return [];
  }
}
