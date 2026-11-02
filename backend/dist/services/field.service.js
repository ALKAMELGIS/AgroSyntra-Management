"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FieldService = void 0;
const field_repository_1 = require("../repositories/field.repository");
const pagination_1 = require("../utils/pagination");
const errors_1 = require("../utils/errors");
class FieldService {
    constructor() {
        this.repository = new field_repository_1.FieldRepository();
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
        const { polygon, ...rest } = payload;
        const polygonWkt = polygon ? this.toPolygonWkt(polygon) : null;
        return this.repository.create({ ...rest, polygonWkt });
    }
    update(id, payload) {
        const { polygon, ...rest } = payload;
        let polygonWkt;
        if (polygon !== undefined) {
            polygonWkt = polygon.length >= 3 ? this.toPolygonWkt(polygon) : null;
        }
        return this.repository.update(id, { ...rest, polygonWkt });
    }
    remove(id) {
        return this.repository.softDelete(id);
    }
    getCropHistory(fieldId) {
        return this.repository.getCropHistory(fieldId);
    }
    changeCrop(fieldId, cropId, startDate, varietyId) {
        return this.repository.changeCurrentCrop(fieldId, cropId, startDate, varietyId);
    }
    addHistory(fieldId, cropId, startDate, endDate) {
        return this.repository.addCropHistoryEntry(fieldId, cropId, startDate, endDate ?? null);
    }
    toPolygonWkt(points) {
        if (points.length < 3) {
            throw new errors_1.AppError('Polygon requires at least 3 points', 'VALIDATION_ERROR', 400);
        }
        const coords = points.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
        const first = `${points[0][1]} ${points[0][0]}`;
        return `POLYGON((${coords}, ${first}))`;
    }
}
exports.FieldService = FieldService;
