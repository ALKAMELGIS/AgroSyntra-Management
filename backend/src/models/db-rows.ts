/**
 * Raw database row types (snake_case columns as returned by PostgreSQL).
 * Used to type the `row: any` parameters in repository map functions,
 * eliminating implicit `any` throughout the data layer.
 */

export interface DbCropRow {
  id: string;
  name: string;
  dripper_count: number | null;
  drip_test_count: number | null;
  plant_count: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbCountryRow {
  id: string;
  name: string;
  code: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DbSiteRow {
  id: string;
  name: string;
  location: string | null;
  total_area: number | null;
  country_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DbFarmAreaRow {
  id: string;
  name: string;
  size: number | null;
  description: string | null;
  site_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DbFieldRow {
  id: string;
  name: string;
  type: string | null;
  valves: number | null;
  current_crop: string | null;
  farm_area_id: string;
  field_type_id: string | null;
  polygon: unknown;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DbFieldTypeRow {
  id: string;
  name: string;
  naming_pattern: string | null;
  default_valve_count: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbHarvestRow {
  id: string;
  field_id: string;
  date: Date;
  total_quantity: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbHarvestVarietyRow {
  id: string;
  harvest_id: string;
  variety: string;
  quantity: number;
  grade: string | null;
}

export interface DbEcphRow {
  id: string;
  field_id: string;
  site_id: string | null;
  farm_area_id: string | null;
  date: string;
  time: string | null;
  qty_of_water: number | null;
  cycle: number | null;
  total_water_qty: number | null;
  field_total_water_based_on_drip: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbFertigationRow {
  id: string;
  field_id: string;
  recipe_id: string | null;
  date: string;
  week_number: number | null;
  flow_rate: number | null;
  frequency: number | null;
  daily_water: number | null;
  total_fertilizer: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  is_active: boolean;
  refresh_token: string | null;
  microsoft_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbRecipeRow {
  id: string;
  name: string;
  recipe_name: string | null;
  description: string | null;
  crop_type: string | null;
  growth_stage: string | null;
  ec_target: number | null;
  ph_target: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbWeatherLogRow {
  id: string;
  field_id: string;
  country_id: string | null;
  site_id: string | null;
  date: string;
  temperature_high: number | null;
  temperature_low: number | null;
  humidity: number | null;
  wind_speed: number | null;
  precipitation: number | null;
  uv_index: number | null;
  conditions: string | null;
  created_at: Date;
  updated_at: Date;
}
