'use client';

import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { processReceiptImage, saveExpense } from '@/actions/expense-actions';
import type { ExpenseFormData, ExpenseItem, ExpenseCategory } from '@/types/expense';
import { expenseCategories } from '@/types/expense';
import { UploadCloud, PlusCircle, XCircle, Loader2 } from 'lucide-react';
import type { ExtractReceiptDataOutput } from '@/ai/flows/extract-receipt-data';

const itemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  price: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val) : val),
    z.number().min(0, 'Price must be positive')
  ),
});

const expenseFormSchema = z.object({
  company: z.string().min(1, 'Company name is required'),
  items: z.array(itemSchema).min(1, 'At least one item is required'),
  category: z.enum(expenseCategories, { required_error: 'Category is required' }),
});

export function ExpenseForm() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      company: '',
      items: [{ name: '', price: 0 }],
      category: 'other',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
      form.reset(); // Reset form when new image is selected
    }
  };

  const handleExtractData = async () => {
    if (!imageFile) {
      toast({ title: 'No image selected', description: 'Please select a receipt image first.', variant: 'destructive' });
      return;
    }

    setIsExtracting(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUri = reader.result as string;
      const result = await processReceiptImage(dataUri);
      setIsExtracting(false);

      if ('error' in result) {
        toast({ title: 'Extraction Failed', description: result.error, variant: 'destructive' });
      } else {
        toast({ title: 'Extraction Successful', description: 'Data extracted from receipt.' });
        form.reset({
          company: result.company,
          items: result.items.length > 0 ? result.items.map(item => ({ name: item.name, price: item.price })) : [{ name: '', price: 0 }],
          category: result.category as ExpenseCategory,
        });
      }
    };
    reader.readAsDataURL(imageFile);
  };

  const onSubmit = async (data: ExpenseFormData) => {
    setIsSaving(true);
    const result = await saveExpense(data);
    setIsSaving(false);

    if (result.success) {
      toast({ title: 'Expense Saved', description: 'Your expense has been successfully saved.' });
      form.reset();
      setImageFile(null);
      setImagePreviewUrl(null);
    } else {
      toast({ title: 'Save Failed', description: result.error, variant: 'destructive' });
    }
  };
  
  useEffect(() => {
    // Clean up preview URL when component unmounts or imageFile changes
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);


  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold text-center">Add New Expense</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="receipt-image" className="text-base font-medium">Receipt Image</Label>
              <Input
                id="receipt-image"
                type="file"
                accept="image/*"
                capture="environment" // Suggests camera on mobile
                onChange={handleImageChange}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>

            {imagePreviewUrl && (
              <div className="my-4 p-2 border border-dashed border-muted-foreground/50 rounded-md flex flex-col items-center">
                <Image src={imagePreviewUrl} alt="Receipt Preview" width={200} height={300} className="rounded-md object-contain max-h-[300px]" data-ai-hint="receipt preview" />
                <Button 
                  type="button" 
                  onClick={handleExtractData} 
                  disabled={isExtracting || !imageFile}
                  className="mt-4 w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  {isExtracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  Extract Data from Image
                </Button>
              </div>
            )}

            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Company</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Starbucks" {...field} className="text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <Label className="text-base font-medium mb-2 block">Items</Label>
              {fields.map((item, index) => (
                <div key={item.id} className="flex gap-2 mb-2 items-start">
                  <FormField
                    control={form.control}
                    name={`items.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="flex-grow">
                        <FormControl>
                          <Input placeholder="Item name" {...field} className="text-sm"/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${index}.price`}
                    render={({ field }) => (
                      <FormItem className="w-1/3">
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="Price" {...field} className="text-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="mt-1 text-destructive hover:text-destructive/80">
                      <XCircle size={20} />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', price: 0 })} className="text-primary border-primary hover:bg-primary/5">
                <PlusCircle size={16} className="mr-2" /> Add Item
              </Button>
            </div>

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-base">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {expenseCategories.map(cat => (
                        <SelectItem key={cat} value={cat} className="capitalize text-base">
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <CardFooter className="p-0 pt-4">
              <Button type="submit" disabled={isSaving || isExtracting} className="w-full text-lg py-3">
                {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                Save Expense
              </Button>
            </CardFooter>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
