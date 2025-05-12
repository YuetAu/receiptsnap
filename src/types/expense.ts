
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

export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

export interface Expense {
  id?: string; // Firestore document ID
  userId: string; // ID of the user who created the expense
  company: string; // This might be company name or companyId. Let's clarify. Assuming company NAME for now, will add companyId.
  companyId?: string | null; // ID of the company the expense belongs to
  items: ExpenseItem[];
  category: ExpenseCategory;
  totalAmount: number; 
  expenseDate: Timestamp;
  paymentMethod: PaymentMethod;
  status: ExpenseStatus; // Status of the expense, especially for company context
  createdAt: Timestamp; 
}

export interface ExpenseFormData {
  company: string; // Company name (manual input or from user's company)
  companyId?: string | null; // Company ID, if user is part of one
  items: Array<{
    id?: string;
    name: string;
    quantity: number | string; 
    netPrice: number | string; 
  }>;
  category: ExpenseCategory;
  expenseDate: Date;
  paymentMethod: PaymentMethod;
  status?: ExpenseStatus; // Defaults to 'pending' if companyId is present
}
