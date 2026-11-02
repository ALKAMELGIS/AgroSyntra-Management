import type { Field } from './field.model';
import type { Recipe } from './recipe.model';

export interface FertigationEntry {
  id: string;
  fieldId: string;
  recipeId?: string;
  recipeName?: string;
  cropId?: string;
  cropName?: string;
  crop?: string;
  date: Date;
  weekNumber?: number;
  flowRate?: number;
  frequency?: number;
  valvesCount?: number;
  dailyWater?: number;
  fertilizers?: Record<string, number>;
  totalFertilizer?: number;
  cumulative?: {
    fertilizers?: Record<string, number>;
  };
  workerId?: string;
  operatorName?: string;
  createdAt: Date;
  updatedAt: Date;
  field?: Field;
  recipe?: Recipe;
}
