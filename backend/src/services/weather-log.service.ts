import { WeatherLogRepository } from '../repositories/weather-log.repository';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';
import { assertFieldInOrganization, assertSiteInOrganization } from '../utils/tenantValidation';

/**
 * Every call is scoped to the caller's organization: reads only see logs whose
 * site belongs to it, writes refuse a site or field from another organization,
 * and update/delete of another organization's log id is a 404.
 */
export class WeatherLogService {
  private readonly repository = new WeatherLogRepository();

  async list(params: {
    organizationId: string;
    page?: number;
    limit?: number;
    siteId?: string;
    fieldId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { items, total } = await this.repository.list(params);
    const { page, limit } = normalizePagination(params);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  getById(id: string, organizationId: string) {
    return this.repository.getById(id, organizationId);
  }

  async create(
    organizationId: string,
    payload: {
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
    }
  ) {
    await assertSiteInOrganization(payload.siteId, organizationId);
    if (payload.fieldId) await assertFieldInOrganization(payload.fieldId, organizationId);
    return this.repository.create(payload);
  }

  async update(
    id: string,
    organizationId: string,
    payload: {
      date?: string;
      countryId?: string;
      siteId?: string;
      fieldId?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      maxTemp?: number | null;
      minTemp?: number | null;
      avgTemp?: number | null;
      feelsLike?: number | null;
      avgRH?: number | null;
      rainfall?: number | null;
      pressure?: number | null;
      windSpeed?: number | null;
      windDirection?: number | null;
      clouds?: number | null;
      description?: string | null;
      source?: string | null;
      notes?: string | null;
    }
  ) {
    // Load the row within the caller's organization first: another
    // organization's log id is a 404 before any field check runs.
    await this.repository.getById(id, organizationId);
    if (payload.siteId) await assertSiteInOrganization(payload.siteId, organizationId);
    if (payload.fieldId) await assertFieldInOrganization(payload.fieldId, organizationId);
    return this.repository.update(id, organizationId, payload);
  }

  remove(id: string, organizationId: string) {
    return this.repository.delete(id, organizationId);
  }
}
