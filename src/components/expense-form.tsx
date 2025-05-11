// src/components/expense-form.tsx
'use client';

import type { ChangeEvent } from 'react';
import { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from '@/hooks/use-toast';
import { processReceiptImage, saveExpense } from '@/actions/expense-actions';
import type { ExpenseFormData, ExpenseCategory, PaymentMethod } from '@/types/expense';
import { expenseCategories, paymentMethods } from '@/types/expense';
import { UploadCloud, PlusCircle, XCircle, Loader2, CalendarIcon } from 'lucide-react';
import type { ExtractReceiptDataOutput as AIExtractReceiptDataOutput } from '@/ai/flows/extract-receipt-data';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth'; 
import { auth } from '@/lib/firebase'; 

const itemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Item name is required'),
  quantity: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val) : val),
    z.number().min(0.01, 'Quantity must be positive')
  ),
  netPrice: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val) : val),
    z.number().min(0, 'Net price must be non-negative')
  ),
});

const expenseFormSchema = z.object({
  company: z.string().min(1, 'Company name is required'),
  items: z.array(itemSchema).min(1, 'At least one item is required'),
  category: z.enum(expenseCategories, { required_error: 'Category is required' }),
  expenseDate: z.date({ required_error: 'Expense date is required' }),
  paymentMethod: z.enum(paymentMethods, { required_error: 'Payment method is required' }),
});

export function ExpenseForm() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth(); 

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      company: '',
      items: [{ name: '', quantity: 1, netPrice: 0 }],
      category: 'other',
      expenseDate: new Date(),
      paymentMethod: 'card',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const watchedItems = form.watch('items');
  
  const calculateTotalExpense = () => {
    return watchedItems.reduce((total, item) => total + (Number(item.netPrice) || 0), 0);
  };


  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
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
      const result = await processReceiptImage(dataUri) as (AIExtractReceiptDataOutput & { items: Array<{name: string, quantity: number, netPrice: number}> }) | { error: string};
      setIsExtracting(false);

      if ('error' in result) {
        toast({ title: 'Extraction Failed', description: result.error, variant: 'destructive' });
      } else {
        toast({ title: 'Extraction Successful', description: 'Data extracted from receipt.' });
        
        form.reset({
          company: result.company,
          items: result.items.length > 0 
            ? result.items.map(item => ({ 
                name: item.name, 
                quantity: item.quantity, 
                netPrice: item.netPrice,
              })) 
            : [{ name: '', quantity: 1, netPrice: 0 }],
          category: result.category as ExpenseCategory,
          expenseDate: result.expenseDate ? new Date(result.expenseDate) : new Date(),
          paymentMethod: result.paymentMethod as PaymentMethod,
        });
      }
    };
    reader.readAsDataURL(imageFile);
  };

  const onSubmit = async (data: ExpenseFormData) => {
    if (!user || !auth.currentUser) { 
      toast({ title: 'Not Authenticated', description: 'Please log in to save expenses.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    let idToken: string | null = null; 
    try {
      // Force refresh the token to ensure it's not stale
      idToken = await auth.currentUser.getIdToken(true); 

      if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
        console.error("onSubmit: idToken is null, empty, or not a string after getIdToken(true). Token:", idToken);
        toast({ title: 'Authentication Error', description: 'Could not retrieve valid user session token. Please try logging in again.', variant: 'destructive' });
        setIsSaving(false);
        return;
      }
      // console.log("onSubmit: Obtained idToken (first 20 chars):", idToken.substring(0, 20));


      const result = await saveExpense(idToken, data); 

      if (result.success) {
        toast({ title: 'Expense Saved', description: `Your expense (ID: ${result.docId}) has been successfully saved.` });
        form.reset({
          company: '',
          items: [{ name: '', quantity: 1, netPrice: 0 }],
          category: 'other',
          expenseDate: new Date(),
          paymentMethod: 'card',
        });
        setImageFile(null);
        setImagePreviewUrl(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        console.error("onSubmit: saveExpense returned error:", result.error, "Token used (first 20 chars):", idToken ? idToken.substring(0, 20) : "null/empty");
        toast({ title: 'Save Failed', description: result.error, variant: 'destructive' });
      }
    } catch (error: any) {
      console.error("onSubmit: Error during token retrieval or saveExpense call:", error, "Token value if obtained (first 20 chars):", idToken ? idToken.substring(0,20) : "not obtained or null/empty");
      toast({ title: 'Save Failed', description: error.message || "An unexpected error occurred.", variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };
  
  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);


  return (
    <Card className="w-full max-w-3xl mx-auto shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold text-center">Add New Expense</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="receipt-image" className="text-base font-medium">Receipt Image (Optional)</Label>
              <Input
                id="receipt-image"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageChange}
                ref={fileInputRef}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>

            {imagePreviewUrl && (
              <div className="my-4 p-4 border border-dashed border-muted-foreground/50 rounded-md flex flex-col items-center bg-secondary/30">
                <Image src={imagePreviewUrl} alt="Receipt Preview" width={200} height={300} className="rounded-md object-contain max-h-[300px] border bg-background shadow-sm" data-ai-hint="receipt preview" />
                <Button 
                  type="button" 
                  onClick={handleExtractData} 
                  disabled={isExtracting || !imageFile}
                  className="mt-4 w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground py-2.5"
                >
                  {isExtracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  Extract Data from Image
                </Button>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <FormField
                control={form.control}
                name="expenseDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-base">Expense Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal text-base",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>


            <div>
              <Label className="text-base font-medium mb-2 block">Items</Label>
              <div className="space-y-3">
                {fields.map((item, index) => (
                  <div key={item.id} className="p-3 border rounded-md bg-secondary/20 space-y-2 relative">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <FormField
                        control={form.control}
                        name={`items.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Item name" {...field} className="text-sm"/>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                       <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Quantity</FormLabel>
                            <FormControl>
                              <Input type="number" step="any" placeholder="Qty" {...field} className="text-sm" onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.netPrice`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Net Price</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="Net Price" {...field} className="text-sm" onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    {fields.length > 1 && (
                       <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="absolute top-1 right-1 text-destructive hover:text-destructive/80 h-7 w-7">
                        <XCircle size={18} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', quantity: 1, netPrice: 0 })} className="text-primary border-primary hover:bg-primary/5 mt-3">
                <PlusCircle size={16} className="mr-2" /> Add Item
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
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
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="text-base">
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {paymentMethods.map(method => (
                          <SelectItem key={method} value={method} className="capitalize text-base">
                            {method.charAt(0).toUpperCase() + method.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="pt-4 border-t mt-6">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Total Expense:</span>
                <span>${calculateTotalExpense().toFixed(2)}</span>
              </div>
            </div>

            <CardFooter className="p-0 pt-6">
              <Button type="submit" disabled={isSaving || isExtracting || !user} className="w-full text-lg py-3">
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

    