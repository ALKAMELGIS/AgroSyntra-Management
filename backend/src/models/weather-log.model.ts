export interface WeatherLogEntry {
  id: string;
  date: string;
  countryId?: string;
  siteId: string;
  fieldId?: string;
  latitude?: number;
  longitude?: number;
  maxTemp?: number;
  minTemp?: number;
  avgTemp?: number;
  feelsLike?: number;
  avgRH?: number;
  rainfall?: number;
  pressure?: number;
  windSpeed?: number;
  windDirection?: number;
  clouds?: number;
  description?: string;
  source?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
