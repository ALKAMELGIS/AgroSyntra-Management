import type { Field } from './field.model';

export interface Harvest {
  id: string;
  fieldId: string;
  fieldName?: string;
  date: Date;
  totalQuantity: number;
  notes?: string;
  startTime?: string;
  endTime?: string;
  shiftNumber?: string;
  weekNumber?: string;
  batchNumber?: string;
  segmentId?: string;
  harvestedAreaHa?: number;
  packhouse?: string;
  authorizedBy?: string;
  extraData?: Record<string, any>;
  cropName?: string;
  varietyName?: string;
  openFieldPlantingId?: string;
  plantingRecordId?: string;
  createdAt: Date;
  updatedAt: Date;
  field?: Field;
  varieties?: HarvestVariety[];
}

export interface HarvestVariety {
  id: string;
  harvestId: string;
  variety: string;
  quantity: number;
  grade?: string;
}

export interface CreateHarvestDto {
  fieldId: string;
  date: string;
  notes?: string;
  startTime?: string;
  endTime?: string;
  shiftNumber?: string;
  weekNumber?: string;
  batchNumber?: string;
  segmentId?: string;
  harvestedAreaHa?: number;
  packhouse?: string;
  authorizedBy?: string;
  varieties: {
    variety: string;
    quantity: number;
    grade?: string;
  }[];
}
