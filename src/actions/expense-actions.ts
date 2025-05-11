
// src/actions/expense-actions.ts
'use server';

import { db } from '@/lib/firebase';
import type { Expense, ExpenseFormData, ExpenseItem, ExpenseCategory, PaymentMethod } from '@/types/expense';
import { extractReceiptData, type ExtractReceiptDataInput } from '@/ai/flows/extract-receipt-data';
import type { ExtractReceiptDataOutput as AIExtractReceiptDataOutput } from '@/ai/flows/extract-receipt-data';
import { addDoc, collection, getDocs, query, orderBy, Timestamp, serverTimestamp, where } from 'firebase/firestore';
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

export async function saveExpense(userId: string, data: ExpenseFormData): Promise<{ success: boolean; error?: string }> {
  if (!userId) {
    return { success: false, error: "User not authenticated." };
  }
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
      userId, // Associate expense with the user
      company: data.company,
      items,
      category: data.category,
      totalAmount,
      expenseDate: Timestamp.fromDate(new Date(data.expenseDate)),
      paymentMethod: data.paymentMethod,
      createdAt: serverTimestamp() as Timestamp,
    };

    await addDoc(collection(db, 'expenses'), expenseData);
    revalidatePath('/'); 
    return { success: true };
  } catch (error) {
    console.error("Error saving expense:", error);
    return { success: false, error: "Failed to save expense." };
  }
}

export async function getExpenses(userId: string): Promise<Expense[]> {
  if (!userId) {
    console.warn("getExpenses called without userId.");
    return [];
  }
  try {
    const expensesCol = collection(db, 'expenses');
    // Filter expenses by userId
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
