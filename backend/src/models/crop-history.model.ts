export interface CropHistory {
  id: string;
  fieldId: string;
  cropId: string;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
}
