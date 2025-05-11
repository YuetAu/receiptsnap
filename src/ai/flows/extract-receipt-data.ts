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
      unitPrice: z.number().describe('The price per unit of the item.'),
      discount: z.number().optional().default(0).describe('The discount amount for this item. Default to 0 if not specified.'),
      // netPrice: z.number().describe('The final price for this item after discount (quantity * unitPrice - discount).'), // This will be calculated
    })
  ).describe('A list of items with their details.'),
  category: z.enum(expenseCategories).describe(`The category of the expense. Must be one of: ${expenseCategories.join(', ')}`),
  expenseDate: z.string().describe('The date of the expense in YYYY-MM-DD format. If not found, use the current date.'),
  paymentMethod: z.enum(paymentMethods).describe(`The payment method used. Must be one of: ${paymentMethods.join(', ')}. If not found, use 'other'.`),
});
export type ExtractReceiptDataOutput = z.infer<typeof ExtractReceiptDataOutputSchema>;

export async function extractReceiptData(input: ExtractReceiptDataInput): Promise<ExtractReceiptDataOutput> {
  const result = await extractReceiptDataFlow(input);
  // Calculate netPrice for each item
  const itemsWithNetPrice = result.items.map(item => ({
    ...item,
    netPrice: (item.quantity * item.unitPrice) - (item.discount || 0)
  }));
  return { ...result, items: itemsWithNetPrice };
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
    - unitPrice: The price for a single unit of the item.
    - discount: Any discount applied specifically to this item. If none, use 0.
  - Category: The overall category of the expense. This must be one of: ${expenseCategories.join(', ')}. Infer this from the items and company.
  - Expense Date: The date shown on the receipt. Format as YYYY-MM-DD. If no date is clearly visible, use the current date.
  - Payment Method: The method of payment (e.g., card, cash, online). This must be one of: ${paymentMethods.join(', ')}. If not determinable, use 'other'.

  Return the data in JSON format according to the defined schema. Ensure all numerical fields (quantity, unitPrice, discount) are numbers.

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
    // Ensure items have default quantity and discount if not provided
    const processedItems = output.items.map(item => ({
      name: item.name,
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || 0,
      discount: item.discount || 0,
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
