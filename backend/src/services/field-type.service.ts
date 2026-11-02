import { FieldTypeRepository } from '../repositories/field-type.repository';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';

export class FieldTypeService {
  private readonly repository = new FieldTypeRepository();

  async list(params: { page?: number; limit?: number }) {
    const { items, total } = await this.repository.list(params);
    const { page, limit } = normalizePagination(params);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  create(payload: { name: string; namingPattern?: string; defaultValveCount?: number }) {
    return this.repository.create(payload);
  }

  update(
    id: string,
    payload: { name?: string; namingPattern?: string; defaultValveCount?: number }
  ) {
    return this.repository.update(id, payload);
  }

  remove(id: string) {
    return this.repository.delete(id);
  }
}
