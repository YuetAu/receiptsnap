import type { Timestamp } from "firebase/firestore";

export interface ExpenseItem {
  id?: string; // for react-hook-form field array
  name: string;
  price: number;
}

export const expenseCategories = ['food', 'travel', 'supplies', 'entertainment', 'other'] as const;
export type ExpenseCategory = typeof expenseCategories[number];

export interface Expense {
  id?: string; // Firestore document ID
  company: string;
  items: ExpenseItem[];
  category: ExpenseCategory;
  totalAmount: number;
  // receiptImageUrl?: string | null; // Optional: if storing image URL
  createdAt: Timestamp;
  userId?: string; // For future authentication
}

export interface ExpenseFormData {
  company: string;
  items: ExpenseItem[];
  category: ExpenseCategory;
  // receiptImage?: FileList; // For file input, handled separately
}
