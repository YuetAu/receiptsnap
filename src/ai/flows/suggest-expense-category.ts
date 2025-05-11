// src/ai/flows/suggest-expense-category.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting an expense category
 * based on the extracted data from a receipt.
 *
 * - suggestExpenseCategory - A function that takes receipt data and suggests an expense category.
 * - SuggestExpenseCategoryInput - The input type for the suggestExpenseCategory function.
 * - SuggestExpenseCategoryOutput - The return type for the suggestExpenseCategory function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestExpenseCategoryInputSchema = z.object({
  companyName: z.string().describe('The name of the company on the receipt.'),
  items: z.array(
    z.object({
      name: z.string().describe('The name of the item.'),
      price: z.number().describe('The price of the item.'),
    })
  ).describe('A list of items and their prices from the receipt.'),
});
export type SuggestExpenseCategoryInput = z.infer<typeof SuggestExpenseCategoryInputSchema>;

const SuggestExpenseCategoryOutputSchema = z.object({
  category: z.string().describe('The suggested expense category for the receipt.'),
});
export type SuggestExpenseCategoryOutput = z.infer<typeof SuggestExpenseCategoryOutputSchema>;

export async function suggestExpenseCategory(input: SuggestExpenseCategoryInput): Promise<SuggestExpenseCategoryOutput> {
  return suggestExpenseCategoryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestExpenseCategoryPrompt',
  input: {schema: SuggestExpenseCategoryInputSchema},
  output: {schema: SuggestExpenseCategoryOutputSchema},
  prompt: `You are an expert in expense categorization.

  Given the following information from a receipt, suggest the most appropriate expense category.

  Company Name: {{{companyName}}}
  Items:
  {{#each items}}
  - {{name}}: {{price}}
  {{/each}}

  Available categories: Food, Travel, Accommodation, Entertainment, Supplies, Utilities, Other

  Please select one category from the list above. Return ONLY the name of the category.
  `,
});

const suggestExpenseCategoryFlow = ai.defineFlow(
  {
    name: 'suggestExpenseCategoryFlow',
    inputSchema: SuggestExpenseCategoryInputSchema,
    outputSchema: SuggestExpenseCategoryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
