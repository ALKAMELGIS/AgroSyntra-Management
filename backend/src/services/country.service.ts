import { CountryRepository } from '../repositories/country.repository';
import type { CreateCountryDto, UpdateCountryDto } from '../models/country.model';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';

export class CountryService {
  private readonly repository = new CountryRepository();

  async list(params: { page?: number; limit?: number; countryIds?: string[]; organizationId?: string }) {
    const { items, total } = await this.repository.list(params);
    const { page, limit } = normalizePagination(params);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  create(payload: CreateCountryDto, organizationId: string) {
    return this.repository.create(payload, organizationId);
  }

  update(id: string, payload: UpdateCountryDto) {
    return this.repository.update(id, payload);
  }

  remove(id: string) {
    return this.repository.softDelete(id);
  }
}
