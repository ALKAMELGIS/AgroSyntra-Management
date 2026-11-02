"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FertigationService = void 0;
const fertigation_repository_1 = require("../repositories/fertigation.repository");
const pagination_1 = require("../utils/pagination");
class FertigationService {
    constructor() {
        this.repository = new fertigation_repository_1.FertigationRepository();
    }
    async list(params) {
        const { items, total } = await this.repository.list(params);
        const { page, limit } = (0, pagination_1.normalizePagination)(params);
        return { items, meta: (0, pagination_1.buildPaginationMeta)(total, page, limit) };
    }
    getById(id) {
        return this.repository.getById(id);
    }
    create(payload) {
        return this.repository.create(payload);
    }
    async bulkImport(entries) {
        const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };
        for (let i = 0; i < entries.length; i += 1) {
            const parsed = entries[i];
            try {
                const existingId = await this.repository.findIdByFieldAndDate(parsed.fieldId, parsed.date);
                if (existingId) {
                    await this.repository.update(existingId, {
                        date: parsed.date,
                        recipeId: parsed.recipeId,
                        cropId: parsed.cropId,
                        weekNumber: parsed.weekNumber,
                        flowRate: parsed.flowRate,
                        frequency: parsed.frequency,
                        valvesCount: parsed.valvesCount,
                        dailyWater: parsed.dailyWater,
                        fertilizers: parsed.fertilizers,
                        totalFertilizer: parsed.totalFertilizer,
                        cumulative: parsed.cumulative,
                        workerId: parsed.workerId,
                    });
                    results.updated += 1;
                }
                else {
                    await this.repository.create(parsed);
                    results.inserted += 1;
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                results.errors.push(`Entry ${i + 1}: ${message}`);
            }
        }
        return results;
    }
    update(id, payload) {
        return this.repository.update(id, payload);
    }
    remove(id) {
        return this.repository.delete(id);
    }
}
exports.FertigationService = FertigationService;
