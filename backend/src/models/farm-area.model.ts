import type { Crop } from './crop.model';
import type { Field } from './field.model';
import type { Site } from './site.model';

export interface FarmArea {
  id: string;
  siteId: string;
  name: string;
  size?: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  site?: Site;
  fields?: Field[];
  crops?: Crop[];
}
