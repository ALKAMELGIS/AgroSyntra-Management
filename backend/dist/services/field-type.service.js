"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FieldTypeService = void 0;
const field_type_repository_1 = require("../repositories/field-type.repository");
const pagination_1 = require("../utils/pagination");
class FieldTypeService {
    constructor() {
        this.repository = new field_type_repository_1.FieldTypeRepository();
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
}
exports.FieldTypeService = FieldTypeService;
