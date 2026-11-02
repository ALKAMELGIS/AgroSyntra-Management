import type { Field } from './field.model';

export interface ECPHEntry {
  id: string;
  fieldId: string;
  date: Date;
  time?: string;
  qtyOfWater?: number;
  cycle?: number;
  totalWaterQty?: number;
  fieldTotalWaterBasedOnDrip?: number;
  dripperCount?: number;
  dripTestCount?: number;
  cropId?: string;
  cropName?: string;
  weatherCondition?: string;
  irrigationStatus?: string;
  templateId?: string;
  createdAt: Date;
  field?: Field;
  valveReadings?: ECPHValveReading[];
}

export interface ECPHValveReading {
  id: string;
  ecphEntryId: string;
  valveNumber: number;
  dripVolume?: number;
  ecIn?: number;
  ec?: number;
  phIn?: number;
  ph?: number;
  drain?: number;
  percentDrain?: number;
  totalWaterBasedOnDrip?: number;
  qtyOfWater?: number;
  cycle?: number;
  totalWaterQty?: number;
}
