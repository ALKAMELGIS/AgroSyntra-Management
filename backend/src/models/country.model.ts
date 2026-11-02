export interface Country {
  id: string;
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateCountryDto {
  name: string;
  code: string;
}

export interface UpdateCountryDto {
  name?: string;
  code?: string;
}
