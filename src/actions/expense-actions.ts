'use server';

import { db } from '@/lib/firebase';
import type { Expense, ExpenseFormData, ExpenseItem } from '@/types/expense';
import { extractReceiptData, type ExtractReceiptDataInput, type ExtractReceiptDataOutput } from '@/ai/flows/extract-receipt-data';
import { addDoc, collection, getDocs, query, orderBy, Timestamp, serverTimestamp } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';

// Helper function to validate and convert AI output category
const validateCategory = (aiCategory: string): Expense['category'] => {
  const validCategories = ['food', 'travel', 'supplies', 'entertainment', 'other'] as const;
  if (validCategories.includes(aiCategory as Expense['category'])) {
    return aiCategory as Expense['category'];
  }
  return 'other'; // Default to 'other' if AI category is not valid
};


export async function processReceiptImage(photoDataUri: string): Promise<ExtractReceiptDataOutput | { error: string }> {
  try {
    const input: ExtractReceiptDataInput = { photoDataUri };
    const result = await extractReceiptData(input);
    // Ensure items have price as number
    const processedItems = result.items.map(item => ({
      ...item,
      price: Number(item.price) || 0 // Ensure price is a number, default to 0 if NaN
    }));
    
    return {
      ...result,
      items: processedItems,
      category: validateCategory(result.category)
    };
  } catch (error) {
    console.error("Error processing receipt image:", error);
    return { error: "Failed to process receipt image. Please try again." };
  }
}

export async function saveExpense(data: ExpenseFormData): Promise<{ success: boolean; error?: string }> {
  try {
    const totalAmount = data.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    
    const expenseData: Omit<Expense, 'id' | 'createdAt'> & { createdAt: Timestamp } = {
      company: data.company,
      items: data.items.map(item => ({ name: item.name, price: Number(item.price) || 0 })),
      category: data.category,
      totalAmount,
      // userId: "anonymous", // Placeholder for future auth
      createdAt: serverTimestamp() as Timestamp, // Firestore will set this
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
    const q = query(expensesCol, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return [];
  }
}
