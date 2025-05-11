import type { Timestamp } from "firebase/firestore";

export interface ExpenseItem {
  id?: string; // for react-hook-form field array
  name: string;
  quantity: number;
  // unitPrice: number; // REMOVED
  // discount: number; // REMOVED
  netPrice: number; // This is now the primary price field for the item
}

export const expenseCategories = ['food', 'travel', 'supplies', 'entertainment', 'other'] as const;
export type ExpenseCategory = typeof expenseCategories[number];

export const paymentMethods = ['card', 'cash', 'online', 'other'] as const;
export type PaymentMethod = typeof paymentMethods[number];

export interface Expense {
  id?: string; // Firestore document ID
  company: string;
  items: ExpenseItem[];
  category: ExpenseCategory;
  totalAmount: number; // Sum of all item netPrices
  expenseDate: Timestamp;
  paymentMethod: PaymentMethod;
  // receiptImageUrl?: string | null; // Optional: if storing image URL
  createdAt: Timestamp; // Timestamp of record creation
  userId?: string; // For future authentication
}

export interface ExpenseFormData {
  company: string;
  items: Array<{
    id?: string;
    name: string;
    quantity: number | string; // string for input, number for processing
    // unitPrice: number | string; // REMOVED
    // discount: number | string; // REMOVED
    netPrice: number | string; // ADDED / Confirmed
  }>;
  category: ExpenseCategory;
  expenseDate: Date;
  paymentMethod: PaymentMethod;
}
