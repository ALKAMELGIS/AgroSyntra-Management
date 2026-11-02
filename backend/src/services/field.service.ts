import { FieldRepository } from '../repositories/field.repository';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';
import { AppError } from '../utils/errors';

export class FieldService {
  private readonly repository = new FieldRepository();

  async list(params: { page?: number; limit?: number; farmAreaId?: string; fieldIds?: string[]; siteId?: string; organizationId?: string }) {
    const { items, total } = await this.repository.list(params);
    const { page, limit } = normalizePagination(params);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  create(payload: {
    farmAreaId: string;
    fieldTypeId?: string;
    name: string;
    currentCropId?: string;
    varietyId?: string;
    valveCount?: number;
    area?: number;
    latitude?: number;
    longitude?: number;
    polygon?: number[][];
    organizationId: string;
  }) {
    const { polygon, ...rest } = payload;
    const polygonWkt = polygon ? this.toPolygonWkt(polygon) : null;
    return this.repository.create({ ...rest, polygonWkt });
  }

  update(
    id: string,
    payload: {
      farmAreaId?: string;
      fieldTypeId?: string;
      name?: string;
      currentCropId?: string;
      varietyId?: string | null;
      valveCount?: number;
      area?: number;
      latitude?: number;
      longitude?: number;
      polygon?: number[][];
    }
  ) {
    const { polygon, ...rest } = payload;
    let polygonWkt: string | null | undefined;
    if (polygon !== undefined) {
      polygonWkt = polygon.length >= 3 ? this.toPolygonWkt(polygon) : null;
    }
    return this.repository.update(id, { ...rest, polygonWkt });
  }

  remove(id: string) {
    return this.repository.softDelete(id);
  }

  getCropHistory(fieldId: string) {
    return this.repository.getCropHistory(fieldId);
  }

  changeCrop(fieldId: string, cropId: string, startDate: string, varietyId?: string | null) {
    return this.repository.changeCurrentCrop(fieldId, cropId, startDate, varietyId);
  }

  addHistory(fieldId: string, cropId: string, startDate: string, endDate?: string | null) {
    return this.repository.addCropHistoryEntry(fieldId, cropId, startDate, endDate ?? null);
  }

  private toPolygonWkt(points: number[][]): string {
    if (points.length < 3) {
      throw new AppError('Polygon requires at least 3 points', 'VALIDATION_ERROR', 400);
    }
    const coords = points.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
    const first = `${points[0][1]} ${points[0][0]}`;
    return `POLYGON((${coords}, ${first}))`;
  }
}
