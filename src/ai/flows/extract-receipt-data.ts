// src/ai/flows/extract-receipt-data.ts
'use server';

/**
 * @fileOverview Extracts data from a receipt image using GenAI.
 *
 * - extractReceiptData - A function that handles the receipt data extraction process.
 * - ExtractReceiptDataInput - The input type for the extractReceiptData function.
 * - ExtractReceiptDataOutput - The return type for the extractReceiptData function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { PaymentMethod } from '@/types/expense';
import { paymentMethods, expenseCategories } from '@/types/expense';

const ExtractReceiptDataInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a receipt, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractReceiptDataInput = z.infer<typeof ExtractReceiptDataInputSchema>;

const ExtractReceiptDataOutputSchema = z.object({
  company: z.string().describe('The name of the company on the receipt.'),
  items: z.array(
    z.object({
      name: z.string().describe('The name of the item.'),
      quantity: z.number().describe('The quantity of the item. Default to 1 if not specified.'),
      netPrice: z.number().describe('The final price for this specific line item as it appears on the receipt, after any item-specific discounts or considerations. This is not the subtotal or total of the receipt.'),
    })
  ).describe('A list of items with their details.'),
  category: z.enum(expenseCategories).describe(`The category of the expense. Must be one of: ${expenseCategories.join(', ')}`),
  expenseDate: z.string().describe('The date of the expense in YYYY-MM-DD format. If not found, use the current date.'),
  paymentMethod: z.enum(paymentMethods).describe(`The payment method used. Must be one of: ${paymentMethods.join(', ')}. If not found, use 'other'.`),
});
export type ExtractReceiptDataOutput = z.infer<typeof ExtractReceiptDataOutputSchema>;

export async function extractReceiptData(input: ExtractReceiptDataInput): Promise<ExtractReceiptDataOutput> {
  // The flow now directly returns items with netPrice. No further calculation needed here.
  return extractReceiptDataFlow(input);
}

const extractReceiptDataPrompt = ai.definePrompt({
  name: 'extractReceiptDataPrompt',
  input: {schema: ExtractReceiptDataInputSchema},
  output: {schema: ExtractReceiptDataOutputSchema},
  prompt: `You are an expert at extracting structured data from receipts.
  Analyze the provided receipt image and extract the following information:

  - Company Name: The name of the company the receipt is from.
  - Items: A list of items purchased. For each item, extract:
    - name: The name of the item.
    - quantity: The quantity of the item. If not explicitly mentioned, assume 1.
    - netPrice: The final price for this specific line item as it appears on the receipt (e.g., after any line-item specific discounts).
  - Category: The overall category of the expense. This must be one of: ${expenseCategories.join(', ')}. Infer this from the items and company.
  - Expense Date: The date shown on the receipt. Format as YYYY-MM-DD. If no date is clearly visible, use the current date.
  - Payment Method: The method of payment (e.g., card, cash, online). This must be one of: ${paymentMethods.join(', ')}. If not determinable, use 'other'.

  Return the data in JSON format according to the defined schema. Ensure all numerical fields (quantity, netPrice) are numbers.

  Receipt Image: {{media url=photoDataUri}}`,
});

const extractReceiptDataFlow = ai.defineFlow(
  {
    name: 'extractReceiptDataFlow',
    inputSchema: ExtractReceiptDataInputSchema,
    outputSchema: ExtractReceiptDataOutputSchema,
  },
  async input => {
    const {output} = await extractReceiptDataPrompt(input);
    if (!output) {
      throw new Error("AI failed to return output for receipt data extraction.");
    }
    // Ensure items have default quantity if not provided and netPrice is a number
    const processedItems = output.items.map(item => ({
      name: item.name,
      quantity: item.quantity || 1,
      netPrice: item.netPrice || 0,
    }));
    
    return {
      ...output,
      items: processedItems,
      category: output.category || 'other',
      paymentMethod: output.paymentMethod || 'other',
      expenseDate: output.expenseDate || new Date().toISOString().split('T')[0],
    };
  }
);
