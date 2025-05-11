import type { ExpenseCategory } from '@/types/expense';
import { Utensils, Plane, ShoppingBasket, Film, Package, type LucideProps } from 'lucide-react';

interface CategoryIconProps extends LucideProps {
  category: ExpenseCategory | string; // Allow string for broader compatibility
}

const categoryIconMap: Record<ExpenseCategory, React.ElementType<LucideProps>> = {
  food: Utensils,
  travel: Plane,
  supplies: ShoppingBasket,
  entertainment: Film,
  other: Package,
};

export function CategoryIcon({ category, ...props }: CategoryIconProps) {
  const IconComponent = categoryIconMap[category as ExpenseCategory] || Package; // Default to Package if category is unknown
  return <IconComponent {...props} />;
}
