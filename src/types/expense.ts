
import type { Timestamp } from "firebase/firestore";

export interface ExpenseItem {
  id?: string; // for react-hook-form field array
  name: string;
  quantity: number;
  netPrice: number; 
}

export const expenseCategories = ['food', 'travel', 'supplies', 'entertainment', 'other'] as const;
export type ExpenseCategory = typeof expenseCategories[number];

export const paymentMethods = ['card', 'cash', 'online', 'other'] as const;
export type PaymentMethod = typeof paymentMethods[number];

export interface Expense {
  id?: string; // Firestore document ID
  userId: string; // ID of the user who created the expense
  company: string;
  items: ExpenseItem[];
  category: ExpenseCategory;
  totalAmount: number; 
  expenseDate: Timestamp;
  paymentMethod: PaymentMethod;
  createdAt: Timestamp; 
}

export interface ExpenseFormData {
  // userId is not directly in the form data, but obtained from auth context
  company: string;
  items: Array<{
    id?: string;
    name: string;
    quantity: number | string; 
    netPrice: number | string; 
  }>;
  category: ExpenseCategory;
  expenseDate: Date;
  paymentMethod: PaymentMethod;
}
