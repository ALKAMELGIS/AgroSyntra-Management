"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CropService = void 0;
const crop_repository_1 = require("../repositories/crop.repository");
const pagination_1 = require("../utils/pagination");
class CropService {
    constructor() {
        this.repository = new crop_repository_1.CropRepository();
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
    remove(id) {
        return this.repository.delete(id);
    }
    listVarieties(cropId) {
        return this.repository.listVarieties(cropId);
    }
    createVariety(cropId, name, breederId) {
        return this.repository.createVariety(cropId, name, breederId);
    }
    updateVariety(id, payload) {
        return this.repository.updateVariety(id, payload);
    }
    removeVariety(id) {
        return this.repository.deleteVariety(id);
    }
}
exports.CropService = CropService;
