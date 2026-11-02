import { apiRequest, apiRequestWithMeta } from './api';

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function fetchCountries() {
  return apiRequest('/countries?limit=10000');
}

export async function fetchSites(countryId) {
  const params = new URLSearchParams({ limit: '10000' });
  if (countryId) params.set('country_id', countryId);
  return apiRequest(`/sites?${params.toString()}`);
}

export async function fetchFarmAreas(siteId) {
  const params = new URLSearchParams({ limit: '10000' });
  if (siteId) params.set('site_id', siteId);
  return apiRequest(`/farm-areas?${params.toString()}`);
}

export async function fetchFields(farmAreaId, siteId) {
  const params = new URLSearchParams({ limit: '10000' });
  if (farmAreaId) params.set('farm_area_id', farmAreaId);
  if (siteId) params.set('site_id', siteId);
  return apiRequest(`/fields?${params.toString()}`);
}

export async function fetchCrops() {
  return apiRequest('/crops?limit=10000');
}

export async function fetchFieldTypes() {
  return apiRequest('/field-types');
}

export async function createCountry(payload) {
  return apiRequest('/countries', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCountry(id, payload) {
  return apiRequest(`/countries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteCountry(id) {
  return apiRequest(`/countries/${id}`, { method: 'DELETE' });
}

export async function createSite(payload) {
  return apiRequest('/sites', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSite(id, payload) {
  return apiRequest(`/sites/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteSite(id) {
  return apiRequest(`/sites/${id}`, { method: 'DELETE' });
}

export async function createFarmArea(payload) {
  return apiRequest('/farm-areas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFarmArea(id, payload) {
  return apiRequest(`/farm-areas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteFarmArea(id) {
  return apiRequest(`/farm-areas/${id}`, { method: 'DELETE' });
}

export async function assignFarmAreaCrops(farmAreaId, cropIds) {
  return apiRequest(`/farm-areas/${farmAreaId}/crops`, {
    method: 'PUT',
    body: JSON.stringify({ cropIds }),
  });
}

export async function createCrop(payload) {
  return apiRequest('/crops', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCrop(id, payload) {
  return apiRequest(`/crops/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteCrop(id) {
  return apiRequest(`/crops/${id}`, { method: 'DELETE' });
}

export async function fetchVarieties(cropId) {
  return apiRequest(`/crops/${cropId}/varieties`);
}

export async function fetchCropHistoryBySite(siteId) {
  return apiRequest(`/crop-history${buildQuery({ site_id: siteId })}`);
}

export async function fetchPlantingRecordsBySite(siteId) {
  return apiRequest(`/planting-records${buildQuery({ site_id: siteId })}`);
}

export async function createVariety(cropId, payload) {
  return apiRequest(`/crops/${cropId}/varieties`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateVariety(cropId, varietyId, payload) {
  return apiRequest(`/crops/${cropId}/varieties/${varietyId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteVariety(cropId, varietyId) {
  return apiRequest(`/crops/${cropId}/varieties/${varietyId}`, { method: 'DELETE' });
}

export async function createField(payload) {
  return apiRequest('/fields', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateField(id, payload) {
  return apiRequest(`/fields/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteField(id) {
  return apiRequest(`/fields/${id}`, { method: 'DELETE' });
}

export async function changeFieldCrop(id, payload) {
  return apiRequest(`/fields/${id}/crop`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchFieldCropHistory(id) {
  return apiRequest(`/fields/${id}/crop-history`);
}

export async function addFieldHistory(id, payload) {
  return apiRequest(`/fields/${id}/crop-history`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchFieldValves(fieldId) {
  return apiRequest(`/fields/${fieldId}/valves`);
}

export async function replaceFieldValves(fieldId, valves) {
  return apiRequest(`/fields/${fieldId}/valves`, {
    method: 'PUT',
    body: JSON.stringify({ valves }),
  });
}

export async function listHarvests(params) {
  return apiRequestWithMeta(`/harvests${buildQuery(params)}`);
}

export async function listHarvestsAll(params = {}) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { data, meta } = await listHarvests({ ...params, page, limit: 100 });
    items.push(...data);
    totalPages = meta?.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return items;
}

export async function previewHarvestPhi(fieldId, date, segmentId, startTime) {
  const params = { field_id: fieldId, date };
  if (segmentId) params.segment_id = segmentId;
  if (startTime) params.start_time = startTime;
  return apiRequest(`/harvests/phi-preview${buildQuery(params)}`);
}

export async function createHarvest(payload) {
  return apiRequest('/harvests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateHarvest(id, payload) {
  return apiRequest(`/harvests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteHarvest(id) {
  return apiRequest(`/harvests/${id}`, { method: 'DELETE' });
}

export async function listIrrigationSheets(siteId, year) {
  return apiRequest(`/irrigation/sheets?site_id=${siteId}&year=${year}`);
}

export async function createIrrigationSheet(payload) {
  return apiRequest('/irrigation/sheets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getIrrigationSummary(siteId, year) {
  return apiRequest(`/irrigation/summary?site_id=${siteId}&year=${year}`);
}

export async function listIrrigationRecords(monthSheetId) {
  return apiRequest(`/irrigation/records?month_sheet_id=${monthSheetId}`);
}

export async function listIrrigationRecordsAll(params = {}) {
  if (!params.site_id) return [];
  return apiRequest(`/irrigation/records-by-site${buildQuery(params)}`);
}

export async function createIrrigationRecord(payload) {
  return apiRequest('/irrigation/records', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateIrrigationRecord(id, payload) {
  return apiRequest(`/irrigation/records/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteIrrigationRecord(id) {
  return apiRequest(`/irrigation/records/${id}`, { method: 'DELETE' });
}

export async function bulkImportIrrigation(payload) {
  return apiRequest('/irrigation/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listFertilizerProducts() {
  return apiRequest('/fertilizer-applications/fertilizer-products');
}

export async function upsertFertilizerProduct(payload) {
  return apiRequest('/fertilizer-applications/fertilizer-products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function syncFertilizerProducts(names) {
  return apiRequest('/fertilizer-applications/fertilizer-products/sync', {
    method: 'POST',
    body: JSON.stringify({ names }),
  });
}

export async function listFertAppWorkbook(siteId) {
  return apiRequest(`/fertilizer-applications/workbook?site_id=${siteId}`);
}

export async function ensureFertAppWorkbook(payload) {
  return apiRequest('/fertilizer-applications/workbook', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listFertAppRecords(siteId, year) {
  const params = new URLSearchParams({ site_id: siteId });
  if (year) params.set('year', String(year));
  return apiRequest(`/fertilizer-applications/records?${params.toString()}`);
}

export async function listFertAppRecordsAll(params = {}) {
  if (!params.site_id) return [];
  return apiRequest(`/fertilizer-applications/records${buildQuery(params)}`);
}

export async function createFertAppRecord(payload) {
  return apiRequest('/fertilizer-applications/records', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFertAppRecord(id, payload) {
  return apiRequest(`/fertilizer-applications/records/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteFertAppRecord(id) {
  return apiRequest(`/fertilizer-applications/records/${id}`, { method: 'DELETE' });
}

export async function bulkImportFertApp(payload) {
  return apiRequest('/fertilizer-applications/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function bulkCreateHarvest(entries) {
  return apiRequest('/harvests/bulk', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export async function getHarvestReportSummary(params) {
  return apiRequest(`/harvests/reports/summary${buildQuery(params)}`);
}

export async function getHarvestDailyWorksheet(params) {
  return apiRequest(`/harvests/reports/daily-worksheet${buildQuery(params)}`);
}

export async function getHarvestWeeklySummary(params) {
  return apiRequest(`/harvests/reports/weekly-summary${buildQuery(params)}`);
}

export async function listFertigationEntries(params) {
  return apiRequestWithMeta(`/fertigation${buildQuery(params)}`);
}

export async function listFertigationAll(params = {}) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { data, meta } = await listFertigationEntries({ ...params, page, limit: 100 });
    items.push(...data);
    totalPages = meta?.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return items;
}

export async function createFertigation(payload) {
  return apiRequest('/fertigation', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFertigation(id, payload) {
  return apiRequest(`/fertigation/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteFertigation(id) {
  return apiRequest(`/fertigation/${id}`, { method: 'DELETE' });
}

export async function listFertigationGroups(siteId) {
  return apiRequest(`/fertigation/groups?site_id=${encodeURIComponent(siteId)}`);
}

export async function createFertigationGroup(payload) {
  return apiRequest('/fertigation/groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFertigationGroup(id, payload) {
  return apiRequest(`/fertigation/groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteFertigationGroup(id) {
  return apiRequest(`/fertigation/groups/${id}`, { method: 'DELETE' });
}

export async function listEcphEntries(params) {
  return apiRequestWithMeta(`/ecph${buildQuery(params)}`);
}

export async function listEcphAll(params = {}) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { data, meta } = await listEcphEntries({ ...params, page, limit: 100 });
    items.push(...data);
    totalPages = meta?.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return items;
}

export async function createEcph(payload) {
  return apiRequest('/ecph', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function bulkCreateEcph(entries) {
  return apiRequest('/ecph/bulk', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export async function bulkCreateFertigation(entries) {
  return apiRequest('/fertigation/bulk', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export async function updateEcph(id, payload) {
  return apiRequest(`/ecph/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteEcph(id) {
  return apiRequest(`/ecph/${id}`, { method: 'DELETE' });
}

export async function listWeatherLogs(params) {
  return apiRequestWithMeta(`/weather-logs${buildQuery(params)}`);
}

export async function listWeatherLogsAll(params = {}) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { data, meta } = await listWeatherLogs({ ...params, page, limit: 100 });
    items.push(...data);
    totalPages = meta?.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return items;
}

export async function createWeatherLog(payload) {
  return apiRequest('/weather-logs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateWeatherLog(id, payload) {
  return apiRequest(`/weather-logs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteWeatherLog(id) {
  return apiRequest(`/weather-logs/${id}`, { method: 'DELETE' });
}

export async function listRecipes(params) {
  return apiRequestWithMeta(`/recipes${buildQuery(params)}`);
}

export async function listRecipesAll(params = {}) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { data, meta } = await listRecipes({ ...params, page, limit: 100 });
    items.push(...data);
    totalPages = meta?.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return items;
}

export async function createRecipe(payload) {
  return apiRequest('/recipes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRecipe(id, payload) {
  return apiRequest(`/recipes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function approveRecipe(id) {
  return apiRequest(`/recipes/${id}/approve`, { method: 'POST' });
}

export async function deleteRecipe(id) {
  return apiRequest(`/recipes/${id}`, { method: 'DELETE' });
}

export async function getHarvestSummary(params = {}) {
  return apiRequest(`/analytics/harvest-summary${buildQuery(params)}`);
}

export async function getWaterUsage(params = {}) {
  return apiRequest(`/analytics/water-usage${buildQuery(params)}`);
}

export async function getFertilizerUsage(params = {}) {
  return apiRequest(`/analytics/fertilizer-usage${buildQuery(params)}`);
}

export async function getEcphTrends(params = {}) {
  return apiRequest(`/analytics/ecph-trends${buildQuery(params)}`);
}

export async function getMonthlySummary(params = {}) {
  return apiRequest(`/analytics/monthly-summary${buildQuery(params)}`);
}

// Audit log (managers only)
export async function queryAuditLogs(params = {}) {
  const res = await apiRequest(`/audit${buildQuery(params)}`);
  return res;
}

export async function getEntityAuditHistory(entity, entityId) {
  return apiRequest(`/audit/entity/${entity}/${entityId}`);
}

export async function getUserActivity(userId, limit = 20) {
  return apiRequest(`/audit/user/${userId}${buildQuery({ limit })}`);
}
