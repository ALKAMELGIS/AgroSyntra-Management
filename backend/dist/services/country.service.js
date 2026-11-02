"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountryService = void 0;
const country_repository_1 = require("../repositories/country.repository");
const pagination_1 = require("../utils/pagination");
class CountryService {
    constructor() {
        this.repository = new country_repository_1.CountryRepository();
    }
    async list(params) {
        const { items, total } = await this.repository.list(params);
        const { page, limit } = (0, pagination_1.normalizePagination)(params);
        return { items, meta: (0, pagination_1.buildPaginationMeta)(total, page, limit) };
    }
    getById(id) {
        return this.repository.getById(id);
    }
    create(payload, organizationId) {
        return this.repository.create(payload, organizationId);
    }
    update(id, payload) {
        return this.repository.update(id, payload);
    }
    remove(id) {
        return this.repository.softDelete(id);
    }
}
exports.CountryService = CountryService;
