"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherStationClient = void 0;
const keys_1 = require("../cache/keys");
class WeatherStationClient {
    constructor(baseUrl, apiKey, apiHeader, redis) {
        this.cacheTTL = 300; // 5 minutes
        this.apiBaseUrl = baseUrl.replace(/\/+$/, '');
        this.apiKey = apiKey;
        this.apiHeader = apiHeader;
        this.cache = redis;
    }
    async getCurrentByStationId(stationId) {
        const cacheKey = keys_1.cacheKeys.weatherStationCurrent(stationId);
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return JSON.parse(cached);
        const response = await fetch(`${this.apiBaseUrl}/current?stationId=${encodeURIComponent(stationId)}`, {
            headers: {
                [this.apiHeader]: this.apiKey,
            },
        });
        if (!response.ok) {
            throw new Error(`Weather station API error: ${response.status}`);
        }
        const data = (await response.json());
        await this.cache.setex(cacheKey, this.cacheTTL, JSON.stringify(data));
        return data;
    }
    async getForecastByStationId(stationId) {
        const cacheKey = keys_1.cacheKeys.weatherStationForecast(stationId);
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return JSON.parse(cached);
        const response = await fetch(`${this.apiBaseUrl}/forecast?stationId=${encodeURIComponent(stationId)}`, {
            headers: {
                [this.apiHeader]: this.apiKey,
            },
        });
        if (!response.ok) {
            throw new Error(`Weather station API error: ${response.status}`);
        }
        const data = (await response.json());
        await this.cache.setex(cacheKey, this.cacheTTL * 6, JSON.stringify(data)); // 30 minutes
        return data;
    }
}
exports.WeatherStationClient = WeatherStationClient;
