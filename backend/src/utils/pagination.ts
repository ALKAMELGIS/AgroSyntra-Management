import { PaginationMeta, PaginationParams } from '../models/common.model';

export function normalizePagination(params: PaginationParams) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(10000, Math.max(1, params.limit ?? 20));
  return { page, limit, offset: (page - 1) * limit };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
