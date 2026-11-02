import type { Crop } from './crop.model';
import type { FarmArea } from './farm-area.model';
import type { CropHistory } from './crop-history.model';
import type { FieldType } from './field-type.model';
import type { Valve } from './valve.model';

export interface Field {
  id: string;
  farmAreaId: string;
  fieldTypeId?: string;
  name: string;
  currentCropId?: string;
  varietyId?: string;
  valveCount: number;
  area?: number;
  latitude?: number;
  longitude?: number;
  polygon?: GeoJSONPolygon;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  farmArea?: FarmArea;
  fieldType?: FieldType;
  currentCrop?: Crop;
  current_crop?: string;
  varietyName?: string;
  valves?: Valve[];
  cropHistory?: CropHistory[];
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface CreateFieldDto {
  farmAreaId: string;
  fieldTypeId?: string;
  name: string;
  currentCropId?: string;
  varietyId?: string;
  valveCount?: number;
  area?: number;
  latitude?: number;
  longitude?: number;
  polygon?: number[][];
}
