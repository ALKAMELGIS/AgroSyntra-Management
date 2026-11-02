"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherLogService = void 0;
const weather_log_repository_1 = require("../repositories/weather-log.repository");
const pagination_1 = require("../utils/pagination");
class WeatherLogService {
    constructor() {
        this.repository = new weather_log_repository_1.WeatherLogRepository();
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
exports.WeatherLogService = WeatherLogService;
