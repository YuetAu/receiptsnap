// src/actions/expense-actions.ts
'use server';

import { db } from '@/lib/firebase';
import type { Expense, ExpenseFormData, ExpenseItem, ExpenseCategory, PaymentMethod } from '@/types/expense';
import { extractReceiptData, type ExtractReceiptDataInput } from '@/ai/flows/extract-receipt-data';
import type { ExtractReceiptDataOutput as AIExtractReceiptDataOutput } from '@/ai/flows/extract-receipt-data'; // Renamed to avoid conflict
import { addDoc, collection, getDocs, query, orderBy, Timestamp, serverTimestamp } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import { expenseCategories, paymentMethods } from '@/types/expense';

// Helper function to validate and convert AI output category
const validateCategory = (aiCategory: string): ExpenseCategory => {
  if (expenseCategories.includes(aiCategory as ExpenseCategory)) {
    return aiCategory as ExpenseCategory;
  }
  return 'other'; // Default to 'other' if AI category is not valid
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
    const result = await extractReceiptData(input); // AI now returns items with netPrice

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
      ...result, // contains company, category (raw), expenseDate (raw), paymentMethod (raw) from AI
      items: processedItems,
      category: validateCategory(result.category),
      paymentMethod: validatePaymentMethod(result.paymentMethod),
      expenseDate: result.expenseDate || new Date().toISOString().split('T')[0], // Ensure date is present
    };
  } catch (error) {
    console.error("Error processing receipt image:", error);
    return { error: "Failed to process receipt image. Please try again." };
  }
}

export async function saveExpense(data: ExpenseFormData): Promise<{ success: boolean; error?: string }> {
  try {
    const items: ExpenseItem[] = data.items.map(item => {
      const quantity = Number(item.quantity) || 1;
      const netPrice = Number(item.netPrice) || 0;
      return {
        name: item.name,
        quantity,
        netPrice,
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.netPrice, 0);
    
    const expenseData: Omit<Expense, 'id' | 'createdAt'> & { createdAt: Timestamp, expenseDate: Timestamp } = {
      company: data.company,
      items,
      category: data.category,
      totalAmount,
      expenseDate: Timestamp.fromDate(new Date(data.expenseDate)),
      paymentMethod: data.paymentMethod,
      createdAt: serverTimestamp() as Timestamp, // Firestore will set this
      // userId: "anonymous", // Placeholder for future auth
    };

    await addDoc(collection(db, 'expenses'), expenseData);
    revalidatePath('/'); // Revalidate the page to show new expense in history
    return { success: true };
  } catch (error) {
    console.error("Error saving expense:", error);
    return { success: false, error: "Failed to save expense." };
  }
}

export async function getExpenses(): Promise<Expense[]> {
  try {
    const expensesCol = collection(db, 'expenses');
    const q = query(expensesCol, orderBy('expenseDate', 'desc'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id,
        ...data,
        expenseDate: (data.expenseDate as Timestamp).toDate(), // Convert Timestamp to Date
        createdAt: (data.createdAt as Timestamp).toDate(), // Convert Timestamp to Date
      } as unknown as Expense; // Cast needed due to Timestamp to Date conversion
    });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return [];
  }
}
