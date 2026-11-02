export interface Crop {
  id: string;
  name: string;
  dripperCount?: number;
  dripTestCount?: number;
  plantCount?: number;
  createdAt: Date;
  updatedAt: Date;
  varieties?: CropVariety[];
}

export interface CropVariety {
  id: string;
  cropId: string;
  name: string;
  isActive: boolean;
  breederId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
