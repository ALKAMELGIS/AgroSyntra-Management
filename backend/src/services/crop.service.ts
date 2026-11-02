import { CropRepository } from '../repositories/crop.repository';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';

export class CropService {
  private readonly repository = new CropRepository();

  async list(params: { page?: number; limit?: number }) {
    const { items, total } = await this.repository.list(params);
    const { page, limit } = normalizePagination(params);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  create(payload: { name: string; dripperCount?: number; dripTestCount?: number }) {
    return this.repository.create(payload);
  }

  update(id: string, payload: { name?: string; dripperCount?: number; dripTestCount?: number }) {
    return this.repository.update(id, payload);
  }

  remove(id: string) {
    return this.repository.delete(id);
  }

  listVarieties(cropId: string) {
    return this.repository.listVarieties(cropId);
  }

  createVariety(cropId: string, name: string, breederId?: string) {
    return this.repository.createVariety(cropId, name, breederId);
  }

  updateVariety(id: string, payload: { name?: string; isActive?: boolean }) {
    return this.repository.updateVariety(id, payload);
  }

  removeVariety(id: string) {
    return this.repository.deleteVariety(id);
  }
}
