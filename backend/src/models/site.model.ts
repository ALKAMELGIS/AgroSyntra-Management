import type { Country } from './country.model';
import type { FarmArea } from './farm-area.model';

export interface Site {
  id: string;
  countryId: string;
  name: string;
  location?: string;
  totalArea?: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  country?: Country;
  farmAreas?: FarmArea[];
}
