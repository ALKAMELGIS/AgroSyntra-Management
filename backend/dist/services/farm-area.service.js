"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FarmAreaService = void 0;
const farm_area_repository_1 = require("../repositories/farm-area.repository");
const pagination_1 = require("../utils/pagination");
class FarmAreaService {
    constructor() {
        this.repository = new farm_area_repository_1.FarmAreaRepository();
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
    update(id, payload) {
        return this.repository.update(id, payload);
    }
    setCrops(id, cropIds) {
        return this.repository.setCrops(id, cropIds);
    }
    remove(id) {
        return this.repository.softDelete(id);
    }
}
exports.FarmAreaService = FarmAreaService;
