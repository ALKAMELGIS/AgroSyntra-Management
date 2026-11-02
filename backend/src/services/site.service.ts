import { SiteRepository } from '../repositories/site.repository';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';

export class SiteService {
  private readonly repository = new SiteRepository();

  async list(params: { page?: number; limit?: number; countryId?: string; siteIds?: string[]; organizationId?: string }) {
    const { items, total } = await this.repository.list(params);
    const { page, limit } = normalizePagination(params);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  create(payload: {
    countryId: string;
    name: string;
    location?: string;
    totalArea?: number;
    organizationId: string;
  }) {
    return this.repository.create(payload);
  }

  update(
    id: string,
    payload: { name?: string; location?: string; totalArea?: number; countryId?: string }
  ) {
    return this.repository.update(id, payload);
  }

  remove(id: string) {
    return this.repository.softDelete(id);
  }
}
