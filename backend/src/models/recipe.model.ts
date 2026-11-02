export type RecipeStatus = 'draft' | 'approved';

export interface Recipe {
  id: string;
  name: string;
  status: RecipeStatus;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  description?: string;
  tankVolume?: number;
  cycles?: number;
  elementPpm?: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
  fertilizers?: RecipeFertilizer[];
}

export interface RecipeFertilizer {
  id: string;
  recipeId: string;
  name: string;
  dose?: number;
  kgPerLiter?: number;
  tankVolume?: number;
  quantityPer1000L?: number;
  elementPpm?: Record<string, number>;
  element?: string;
  concentration?: number;
}
