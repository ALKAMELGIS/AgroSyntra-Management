import { EcphRepository } from '../repositories/ecph.repository';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';
import { assertFieldDateWritable } from './seasons.service';

export class EcphService {
  private readonly repository = new EcphRepository();

  async list(params: {
    page?: number;
    limit?: number;
    fieldId?: string;
    siteId?: string;
    startDate?: string;
    endDate?: string;
    templateId?: string;
    organizationId: string;
  }) {
    const { items, total } = await this.repository.list(params);
    const { page, limit } = normalizePagination(params);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  async create(payload: {
    fieldId: string;
    date: string;
    time?: string;
    qtyOfWater?: number;
    cycle?: number;
    totalWaterQty?: number;
    fieldTotalWaterBasedOnDrip?: number;
    dripperCount?: number;
    dripTestCount?: number;
    weatherCondition?: string;
    irrigationStatus?: string;
    templateId?: string;
    valveReadings?: Array<{
      valveNumber: number;
      dripVolume?: number;
      ecIn?: number;
      ec?: number;
      phIn?: number;
      ph?: number;
      drain?: number;
      percentDrain?: number;
      totalWaterBasedOnDrip?: number;
      qtyOfWater?: number;
      cycle?: number;
      totalWaterQty?: number;
    }>;
  }) {
    await assertFieldDateWritable(payload.fieldId, payload.date);
    return this.repository.create(payload);
  }

  async update(
    id: string,
    payload: {
      date?: string;
      time?: string;
      qtyOfWater?: number;
      cycle?: number;
      totalWaterQty?: number;
      fieldTotalWaterBasedOnDrip?: number;
      dripperCount?: number;
      dripTestCount?: number;
      weatherCondition?: string;
      irrigationStatus?: string;
      valveReadings?: Array<{
        valveNumber: number;
        dripVolume?: number;
        ecIn?: number;
        ec?: number;
        phIn?: number;
        ph?: number;
        drain?: number;
        percentDrain?: number;
        totalWaterBasedOnDrip?: number;
        qtyOfWater?: number;
        cycle?: number;
        totalWaterQty?: number;
      }>;
    }
  ) {
    const existing = await this.repository.getById(id);
    await assertFieldDateWritable(existing.fieldId, payload.date ?? existing.date);
    return this.repository.update(id, payload);
  }

  remove(id: string) {
    return this.repository.delete(id);
  }
}
