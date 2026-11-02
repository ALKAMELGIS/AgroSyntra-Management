import { dbPool } from '../db/client';
import { logger } from '../utils/logger';

// ─── Dot-notation value extractor ────────────────────────────────

function extractValue(obj: any, path: string): any {
  return path.split('.').reduce((curr, key) => curr?.[key], obj);
}

// ─── Auth config masking ─────────────────────────────────────────

const MASK = '••••••';

function maskValue(val: string | undefined): string {
  if (!val) return '';
  if (val.length <= 4) return MASK;
  return MASK + val.slice(-4);
}

export function maskAuthConfig(config: any, authType: string): any {
  if (!config) return config;
  const masked = { ...config };
  switch (authType) {
    case 'api_key':
      if (masked.key) masked.key = maskValue(masked.key);
      break;
    case 'bearer_token':
      if (masked.token) masked.token = maskValue(masked.token);
      break;
    case 'basic':
      if (masked.password) masked.password = maskValue(masked.password);
      break;
  }
  return masked;
}

function isMasked(val: string | undefined): boolean {
  return typeof val === 'string' && val.startsWith(MASK);
}

// Merge incoming auth_config with existing, preserving masked fields
async function resolveAuthConfig(id: string, incoming: any, authType: string): Promise<any> {
  if (!incoming) return undefined;
  const needsResolve =
    (authType === 'api_key' && isMasked(incoming.key)) ||
    (authType === 'bearer_token' && isMasked(incoming.token)) ||
    (authType === 'basic' && isMasked(incoming.password));

  if (!needsResolve) return incoming;

  const existing = await dbPool.query('SELECT auth_config, auth_type FROM api_integrations WHERE id = $1', [id]);
  if (existing.rowCount === 0) return incoming;
  const orig = existing.rows[0].auth_config || {};

  const resolved = { ...incoming };
  if (authType === 'api_key' && isMasked(resolved.key)) resolved.key = orig.key;
  if (authType === 'bearer_token' && isMasked(resolved.token)) resolved.token = orig.token;
  if (authType === 'basic' && isMasked(resolved.password)) resolved.password = orig.password;
  return resolved;
}

function maskRow(row: any) {
  if (!row) return row;
  return { ...row, auth_config: maskAuthConfig(row.auth_config, row.auth_type) };
}

// ─── HTTP fetch helper ───────────────────────────────────────────

async function fetchFromApi(integration: any, urlOverride?: string): Promise<any> {
  const url = urlOverride || integration.base_url;
  const opts: RequestInit = { method: 'GET', headers: { 'Accept': 'application/json' } as Record<string, string> };
  const hdrs = opts.headers as Record<string, string>;
  const cfg = integration.auth_config || {};

  switch (integration.auth_type) {
    case 'api_key':
      if (cfg.header) {
        hdrs[cfg.header] = cfg.key;
      } else {
        const sep = url.includes('?') ? '&' : '?';
        const finalUrl = `${url}${sep}${cfg.param || 'api_key'}=${cfg.key}`;
        const res = await fetch(finalUrl, opts);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      }
      break;
    case 'bearer_token':
      hdrs['Authorization'] = `Bearer ${cfg.token}`;
      break;
    case 'basic':
      hdrs['Authorization'] = `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`;
      break;
  }

  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── CRUD ────────────────────────────────────────────────────────

export async function listIntegrations(filters: {
  type?: string;
  page?: number;
  limit?: number;
}) {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters.type) {
    conditions.push(`type = $${idx}`);
    params.push(filters.type);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(filters.limit || 50, 100);
  const page = Math.max(filters.page || 1, 1);
  const offset = (page - 1) * limit;

  const countResult = await dbPool.query(`SELECT COUNT(*) FROM api_integrations ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(limit);
  params.push(offset);
  const result = await dbPool.query(
    `SELECT ai.*,
       (SELECT COUNT(*) FROM api_integration_fields aif WHERE aif.integration_id = ai.id) AS field_count
     FROM api_integrations ai ${where}
     ORDER BY ai.name ASC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params,
  );

  return {
    items: result.rows.map(maskRow),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getIntegration(id: string) {
  const result = await dbPool.query('SELECT * FROM api_integrations WHERE id = $1', [id]);
  if (result.rowCount === 0) throw Object.assign(new Error('Integration not found'), { status: 404 });

  const fieldsResult = await dbPool.query(
    `SELECT aif.*, f.name AS field_name, fa.name AS farm_area_name
     FROM api_integration_fields aif
     JOIN fields f ON f.id = aif.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE aif.integration_id = $1
     ORDER BY f.name`,
    [id],
  );

  return { ...maskRow(result.rows[0]), fields: fieldsResult.rows };
}

export async function createIntegration(data: any) {
  const result = await dbPool.query(
    `INSERT INTO api_integrations
       (name, type, provider, base_url, auth_type, auth_config, polling_interval_minutes, data_mapping, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      data.name, data.type, data.provider || null, data.baseUrl,
      data.authType || 'api_key', JSON.stringify(data.authConfig || {}),
      data.pollingIntervalMinutes || 60, JSON.stringify(data.dataMapping || {}),
      data.isActive !== false, data.createdBy || null,
    ],
  );
  return maskRow(result.rows[0]);
}

export async function updateIntegration(id: string, data: any) {
  const sets: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) { params.push(data.name); sets.push(`name = $${params.length}`); }
  if (data.type !== undefined) { params.push(data.type); sets.push(`type = $${params.length}`); }
  if (data.provider !== undefined) { params.push(data.provider); sets.push(`provider = $${params.length}`); }
  if (data.baseUrl !== undefined) { params.push(data.baseUrl); sets.push(`base_url = $${params.length}`); }
  if (data.authType !== undefined) { params.push(data.authType); sets.push(`auth_type = $${params.length}`); }

  if (data.authConfig !== undefined) {
    const resolved = await resolveAuthConfig(id, data.authConfig, data.authType || 'api_key');
    params.push(JSON.stringify(resolved));
    sets.push(`auth_config = $${params.length}`);
  }

  if (data.pollingIntervalMinutes !== undefined) { params.push(data.pollingIntervalMinutes); sets.push(`polling_interval_minutes = $${params.length}`); }
  if (data.dataMapping !== undefined) { params.push(JSON.stringify(data.dataMapping)); sets.push(`data_mapping = $${params.length}`); }
  if (data.isActive !== undefined) { params.push(data.isActive); sets.push(`is_active = $${params.length}`); }

  if (sets.length === 0) throw Object.assign(new Error('No fields to update'), { status: 400 });

  sets.push('updated_at = NOW()');
  params.push(id);
  const result = await dbPool.query(
    `UPDATE api_integrations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (result.rowCount === 0) throw Object.assign(new Error('Integration not found'), { status: 404 });
  return maskRow(result.rows[0]);
}

export async function deleteIntegration(id: string) {
  const result = await dbPool.query('DELETE FROM api_integrations WHERE id = $1 RETURNING id', [id]);
  if (result.rowCount === 0) throw Object.assign(new Error('Integration not found'), { status: 404 });
}

// ─── Duplicate ───────────────────────────────────────────────────

export async function duplicateIntegration(id: string) {
  const orig = await dbPool.query('SELECT * FROM api_integrations WHERE id = $1', [id]);
  if (orig.rowCount === 0) throw Object.assign(new Error('Integration not found'), { status: 404 });
  const o = orig.rows[0];

  const dup = await dbPool.query(
    `INSERT INTO api_integrations
       (name, type, provider, base_url, auth_type, auth_config, polling_interval_minutes, data_mapping, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      o.name + ' (Copy)', o.type, o.provider, o.base_url,
      o.auth_type, JSON.stringify(o.auth_config || {}),
      o.polling_interval_minutes, JSON.stringify(o.data_mapping || {}),
      o.is_active, o.created_by,
    ],
  );

  // Copy field assignments
  const fields = await dbPool.query(
    'SELECT field_id, station_id, is_shared, config_override FROM api_integration_fields WHERE integration_id = $1',
    [id],
  );
  for (const f of fields.rows) {
    await dbPool.query(
      `INSERT INTO api_integration_fields (integration_id, field_id, station_id, is_shared, config_override)
       VALUES ($1, $2, $3, $4, $5)`,
      [dup.rows[0].id, f.field_id, f.station_id, f.is_shared, JSON.stringify(f.config_override || {})],
    );
  }

  return maskRow(dup.rows[0]);
}

// ─── Field assignment ────────────────────────────────────────────

export async function getIntegrationFields(integrationId: string) {
  const result = await dbPool.query(
    `SELECT aif.*, f.name AS field_name, fa.name AS farm_area_name
     FROM api_integration_fields aif
     JOIN fields f ON f.id = aif.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE aif.integration_id = $1
     ORDER BY f.name`,
    [integrationId],
  );
  return result.rows;
}

export async function assignFields(
  integrationId: string,
  assignments: Array<{ fieldId: string; stationId?: string; isShared?: boolean }>,
) {
  const results = [];
  for (const a of assignments) {
    const result = await dbPool.query(
      `INSERT INTO api_integration_fields (integration_id, field_id, station_id, is_shared)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (integration_id, field_id)
       DO UPDATE SET station_id = EXCLUDED.station_id, is_shared = EXCLUDED.is_shared
       RETURNING *`,
      [integrationId, a.fieldId, a.stationId || null, a.isShared || false],
    );
    results.push(result.rows[0]);
  }
  return results;
}

export async function removeFieldAssignment(integrationId: string, fieldId: string) {
  await dbPool.query(
    'DELETE FROM api_integration_fields WHERE integration_id = $1 AND field_id = $2',
    [integrationId, fieldId],
  );
}

// ─── Test connection ─────────────────────────────────────────────

export async function testConnection(id: string) {
  const result = await dbPool.query('SELECT * FROM api_integrations WHERE id = $1', [id]);
  if (result.rowCount === 0) throw Object.assign(new Error('Integration not found'), { status: 404 });
  const integration = result.rows[0];

  try {
    const data = await fetchFromApi(integration);
    return { success: true, message: 'Connection successful', sampleKeys: Object.keys(data || {}).slice(0, 10) };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection failed' };
  }
}

export async function testConnectionUnsaved(data: { baseUrl: string; authType: string; authConfig: any }) {
  const fakeIntegration = {
    base_url: data.baseUrl,
    auth_type: data.authType,
    auth_config: data.authConfig || {},
  };
  try {
    const resp = await fetchFromApi(fakeIntegration);
    return { success: true, message: 'Connection successful', sampleKeys: Object.keys(resp || {}).slice(0, 10) };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection failed' };
  }
}

// ─── Sync weather data ──────────────────────────────────────────

export async function syncWeatherData(integrationId: string, triggeredBy: 'auto' | 'manual' = 'manual') {
  const intResult = await dbPool.query('SELECT * FROM api_integrations WHERE id = $1', [integrationId]);
  if (intResult.rowCount === 0) throw Object.assign(new Error('Integration not found'), { status: 404 });
  const integration = intResult.rows[0];

  if (integration.type !== 'weather_station') {
    throw Object.assign(new Error('Only weather_station integrations can be synced'), { status: 400 });
  }

  // Create sync log entry
  const logResult = await dbPool.query(
    `INSERT INTO api_sync_logs (integration_id, triggered_by) VALUES ($1, $2) RETURNING id`,
    [integrationId, triggeredBy],
  );
  const logId = logResult.rows[0].id;

  const fieldsResult = await dbPool.query(
    `SELECT aif.*, f.name AS field_name, f.farm_area_id,
            fa.site_id, s.country_id
     FROM api_integration_fields aif
     JOIN fields f ON f.id = aif.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     LEFT JOIN sites s ON s.id = fa.site_id
     WHERE aif.integration_id = $1`,
    [integrationId],
  );

  if (fieldsResult.rows.length === 0) {
    logger.warn({ integrationId }, 'No fields assigned to integration');
    await dbPool.query(
      `UPDATE api_sync_logs SET finished_at = NOW(), status = 'success', synced_count = 0, skipped_count = 0, error_count = 0 WHERE id = $1`,
      [logId],
    );
    return { synced: 0, skipped: 0, errors: [] };
  }

  const mapping = integration.data_mapping || {};
  const today = new Date().toISOString().split('T')[0];
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const apiData = await fetchFromApi(integration);

    for (const field of fieldsResult.rows) {
      try {
        const existing = await dbPool.query(
          'SELECT id FROM weather_logs WHERE field_id = $1 AND date = $2 AND source = $3',
          [field.field_id, today, integration.name],
        );
        if (existing.rowCount && existing.rowCount > 0) {
          skipped++;
          continue;
        }

        const weatherData: Record<string, any> = {
          date: today,
          siteId: field.site_id,
          fieldId: field.field_id,
          source: integration.name,
        };
        if (field.country_id) weatherData.countryId = field.country_id;

        for (const [ourField, apiPath] of Object.entries(mapping)) {
          const val = extractValue(apiData, apiPath as string);
          if (val !== undefined && val !== null) {
            weatherData[ourField] = Number(val);
          }
        }

        if (weatherData.maxTemp != null && weatherData.minTemp != null && weatherData.avgTemp == null) {
          weatherData.avgTemp = (weatherData.maxTemp + weatherData.minTemp) / 2;
        }

        await dbPool.query(
          `INSERT INTO weather_logs
             (date, country_id, site_id, field_id, max_temp, min_temp, avg_temp, feels_like,
              avg_rh, rainfall, pressure, wind_speed, wind_direction, clouds, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            weatherData.date, weatherData.countryId || null, weatherData.siteId,
            weatherData.fieldId,
            weatherData.maxTemp ?? null, weatherData.minTemp ?? null, weatherData.avgTemp ?? null,
            weatherData.feelsLike ?? null, weatherData.avgRH ?? null, weatherData.rainfall ?? null,
            weatherData.pressure ?? null, weatherData.windSpeed ?? null,
            weatherData.windDirection ?? null, weatherData.clouds ?? null, weatherData.source,
          ],
        );
        synced++;
      } catch (fieldErr: any) {
        errors.push(`${field.field_name}: ${fieldErr.message}`);
      }
    }

    await dbPool.query(
      'UPDATE api_integrations SET last_synced_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1',
      [integrationId],
    );

    const status = errors.length > 0 ? (synced > 0 ? 'partial' : 'failed') : 'success';
    await dbPool.query(
      `UPDATE api_sync_logs SET finished_at = NOW(), status = $1, synced_count = $2, skipped_count = $3, error_count = $4, errors = $5 WHERE id = $6`,
      [status, synced, skipped, errors.length, JSON.stringify(errors), logId],
    );
  } catch (apiErr: any) {
    const errMsg = apiErr.message || 'API fetch failed';
    await dbPool.query(
      'UPDATE api_integrations SET last_error = $1, updated_at = NOW() WHERE id = $2',
      [errMsg, integrationId],
    );
    await dbPool.query(
      `UPDATE api_sync_logs SET finished_at = NOW(), status = 'failed', error_count = 1, errors = $1 WHERE id = $2`,
      [JSON.stringify([errMsg]), logId],
    );
    throw apiErr;
  }

  return { synced, skipped, errors };
}

// ─── Sync soil data ─────────────────────────────────────────────

export async function syncSoilData(integrationId: string, triggeredBy: 'auto' | 'manual' = 'manual') {
  const intResult = await dbPool.query('SELECT * FROM api_integrations WHERE id = $1', [integrationId]);
  if (intResult.rowCount === 0) throw Object.assign(new Error('Integration not found'), { status: 404 });
  const integration = intResult.rows[0];

  if (integration.type !== 'soil_sensor') {
    throw Object.assign(new Error('Only soil_sensor integrations can use this sync'), { status: 400 });
  }

  const logResult = await dbPool.query(
    `INSERT INTO api_sync_logs (integration_id, triggered_by) VALUES ($1, $2) RETURNING id`,
    [integrationId, triggeredBy],
  );
  const logId = logResult.rows[0].id;

  const fieldsResult = await dbPool.query(
    `SELECT aif.*, f.name AS field_name
     FROM api_integration_fields aif
     JOIN fields f ON f.id = aif.field_id
     WHERE aif.integration_id = $1`,
    [integrationId],
  );

  if (fieldsResult.rows.length === 0) {
    logger.warn({ integrationId }, 'No fields assigned to soil sensor integration');
    await dbPool.query(
      `UPDATE api_sync_logs SET finished_at = NOW(), status = 'success', synced_count = 0 WHERE id = $1`,
      [logId],
    );
    return { synced: 0, skipped: 0, errors: [] };
  }

  const mapping = integration.data_mapping || {};
  const today = new Date().toISOString().split('T')[0];
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const apiData = await fetchFromApi(integration);

    for (const field of fieldsResult.rows) {
      try {
        const soilData: Record<string, any> = {};
        for (const [ourField, apiPath] of Object.entries(mapping)) {
          const val = extractValue(apiData, apiPath as string);
          if (val !== undefined && val !== null) {
            soilData[ourField] = Number(val);
          }
        }

        // Check for duplicate
        const depthVal = soilData.depth_cm ?? 0;
        const existing = await dbPool.query(
          `SELECT id FROM soil_sensor_readings
           WHERE field_id = $1 AND date = $2 AND source = $3 AND COALESCE(depth_cm, 0) = $4`,
          [field.field_id, today, integration.name, depthVal],
        );
        if (existing.rowCount && existing.rowCount > 0) {
          skipped++;
          continue;
        }

        await dbPool.query(
          `INSERT INTO soil_sensor_readings
             (field_id, date, moisture_pct, temperature_c, ec_dsm, ph, depth_cm, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            field.field_id, today,
            soilData.moisture_pct ?? null, soilData.temperature_c ?? null,
            soilData.ec_dsm ?? null, soilData.ph ?? null,
            soilData.depth_cm ?? null, integration.name,
          ],
        );
        synced++;
      } catch (fieldErr: any) {
        errors.push(`${field.field_name}: ${fieldErr.message}`);
      }
    }

    await dbPool.query(
      'UPDATE api_integrations SET last_synced_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1',
      [integrationId],
    );

    const status = errors.length > 0 ? (synced > 0 ? 'partial' : 'failed') : 'success';
    await dbPool.query(
      `UPDATE api_sync_logs SET finished_at = NOW(), status = $1, synced_count = $2, skipped_count = $3, error_count = $4, errors = $5 WHERE id = $6`,
      [status, synced, skipped, errors.length, JSON.stringify(errors), logId],
    );
  } catch (apiErr: any) {
    const errMsg = apiErr.message || 'API fetch failed';
    await dbPool.query(
      'UPDATE api_integrations SET last_error = $1, updated_at = NOW() WHERE id = $2',
      [errMsg, integrationId],
    );
    await dbPool.query(
      `UPDATE api_sync_logs SET finished_at = NOW(), status = 'failed', error_count = 1, errors = $1 WHERE id = $2`,
      [JSON.stringify([errMsg]), logId],
    );
    throw apiErr;
  }

  return { synced, skipped, errors };
}

// ─── Sync history ────────────────────────────────────────────────

export async function getSyncHistory(integrationId: string, limit = 20) {
  const result = await dbPool.query(
    `SELECT * FROM api_sync_logs WHERE integration_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [integrationId, limit],
  );
  return result.rows;
}

// ─── Weather autofill ────────────────────────────────────────────

export async function getWeatherAutofill(siteId: string, date: string) {
  // Find fields under this site that have a weather station integration
  const result = await dbPool.query(
    `SELECT wl.field_id, f.name AS field_name,
            wl.max_temp, wl.min_temp, wl.avg_temp, wl.avg_rh, wl.rainfall,
            wl.pressure, wl.wind_speed, wl.wind_direction, wl.clouds, wl.source
     FROM weather_logs wl
     JOIN fields f ON f.id = wl.field_id
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE fa.site_id = $1
       AND wl.date = $2
       AND wl.source IS NOT NULL
       AND wl.source != 'manual'
       AND wl.source != 'openweathermap'
     ORDER BY wl.created_at DESC
     LIMIT 1`,
    [siteId, date],
  );

  if (result.rowCount === 0) {
    // Fallback: find latest entry from any integration source for this site
    const fallback = await dbPool.query(
      `SELECT wl.field_id, f.name AS field_name,
              wl.max_temp, wl.min_temp, wl.avg_temp, wl.avg_rh, wl.rainfall,
              wl.pressure, wl.wind_speed, wl.wind_direction, wl.clouds, wl.source, wl.date
       FROM weather_logs wl
       JOIN fields f ON f.id = wl.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1
         AND wl.source IS NOT NULL
         AND wl.source != 'manual'
         AND wl.source != 'openweathermap'
       ORDER BY wl.date DESC, wl.created_at DESC
       LIMIT 1`,
      [siteId],
    );
    if (fallback.rowCount === 0) return null;
    return fallback.rows[0];
  }
  return result.rows[0];
}

// ─── Scheduled sync (called by job queue) ────────────────────────

export async function syncAllDueIntegrations() {
  const result = await dbPool.query(
    `SELECT id, name, type FROM api_integrations
     WHERE is_active = true
       AND type IN ('weather_station', 'soil_sensor')
       AND (last_synced_at IS NULL OR last_synced_at < NOW() - (polling_interval_minutes || ' minutes')::INTERVAL)`,
  );

  let total = 0;
  for (const row of result.rows) {
    try {
      if (row.type === 'weather_station') {
        await syncWeatherData(row.id, 'auto');
      } else if (row.type === 'soil_sensor') {
        await syncSoilData(row.id, 'auto');
      }
      total++;
      logger.info({ integrationId: row.id, name: row.name, type: row.type }, 'Integration data synced');
    } catch (err: any) {
      logger.error({ integrationId: row.id, error: err.message }, 'Integration sync failed');
    }
  }
  return total;
}

// Generic sync dispatcher (used by manual sync route)
export async function syncIntegration(integrationId: string, triggeredBy: 'auto' | 'manual' = 'manual') {
  const result = await dbPool.query('SELECT type FROM api_integrations WHERE id = $1', [integrationId]);
  if (result.rowCount === 0) throw Object.assign(new Error('Integration not found'), { status: 404 });
  const { type } = result.rows[0];
  if (type === 'weather_station') return syncWeatherData(integrationId, triggeredBy);
  if (type === 'soil_sensor') return syncSoilData(integrationId, triggeredBy);
  throw Object.assign(new Error(`Sync not supported for type: ${type}`), { status: 400 });
}
