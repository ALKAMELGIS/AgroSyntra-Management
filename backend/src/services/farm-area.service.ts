import { FarmAreaRepository } from '../repositories/farm-area.repository';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';

export class FarmAreaService {
  private readonly repository = new FarmAreaRepository();

  async list(params: { page?: number; limit?: number; siteId?: string; farmAreaIds?: string[]; organizationId?: string }) {
    const { items, total } = await this.repository.list(params);
    const { page, limit } = normalizePagination(params);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  create(payload: { siteId: string; name: string; size?: number; description?: string }) {
    return this.repository.create(payload);
  }

  update(
    id: string,
    payload: { name?: string; size?: number; description?: string; siteId?: string }
  ) {
    return this.repository.update(id, payload);
  }

  setCrops(id: string, cropIds: string[]) {
    return this.repository.setCrops(id, cropIds);
  }

  remove(id: string) {
    return this.repository.softDelete(id);
  }
}
