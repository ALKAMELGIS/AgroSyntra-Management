"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcphService = void 0;
const ecph_repository_1 = require("../repositories/ecph.repository");
const pagination_1 = require("../utils/pagination");
const seasons_service_1 = require("./seasons.service");
class EcphService {
    constructor() {
        this.repository = new ecph_repository_1.EcphRepository();
    }
    async list(params) {
        const { items, total } = await this.repository.list(params);
        const { page, limit } = (0, pagination_1.normalizePagination)(params);
        return { items, meta: (0, pagination_1.buildPaginationMeta)(total, page, limit) };
    }
    getById(id) {
        return this.repository.getById(id);
    }
    async create(payload) {
        await (0, seasons_service_1.assertFieldDateWritable)(payload.fieldId, payload.date);
        return this.repository.create(payload);
    }
    async update(id, payload) {
        const existing = await this.repository.getById(id);
        await (0, seasons_service_1.assertFieldDateWritable)(existing.fieldId, payload.date ?? existing.date);
        return this.repository.update(id, payload);
    }
    remove(id) {
        return this.repository.delete(id);
    }
}
exports.EcphService = EcphService;
