"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherService = void 0;
const openweather_client_1 = require("../external/openweather.client");
const weatherstation_client_1 = require("../external/weatherstation.client");
const agroMonitoring_client_1 = require("../external/agroMonitoring.client");
const config_1 = require("../config");
const client_1 = require("../cache/client");
const field_repository_1 = require("../repositories/field.repository");
const errors_1 = require("../utils/errors");
const systemSettings_service_1 = require("./systemSettings.service");
class WeatherService {
    constructor() {
        this.fieldRepository = new field_repository_1.FieldRepository();
        if (config_1.config.external.weatherStationApiBaseUrl && config_1.config.external.weatherStationApiKey) {
            this.weatherStation = new weatherstation_client_1.WeatherStationClient(config_1.config.external.weatherStationApiBaseUrl, config_1.config.external.weatherStationApiKey, config_1.config.external.weatherStationApiHeader, client_1.redisClient);
        }
    }
    async isOpenWeatherConfigured() {
        const key = await (0, systemSettings_service_1.resolveOpenWeatherKey)();
        return !!key;
    }
    async getOpenWeatherClient() {
        const apiKey = await (0, systemSettings_service_1.resolveOpenWeatherKey)();
        if (!apiKey) {
            throw new errors_1.AppError('OpenWeather API key not configured. Add it in Admin → API Keys → Weather Map API Key.', 'CONFIG_ERROR', 500);
        }
        return new openweather_client_1.OpenWeatherClient(apiKey, client_1.redisClient);
    }
    async getAgroClient() {
        const apiKey = await (0, systemSettings_service_1.resolveOpenWeatherKey)();
        if (!apiKey) {
            throw new errors_1.AppError('OpenWeather API key not configured. Add it in Admin → API Keys → Weather Map API Key.', 'CONFIG_ERROR', 500);
        }
        return new agroMonitoring_client_1.AgroMonitoringClient(apiKey);
    }
    async getCurrent(lat, lon, source, refresh = false) {
        if (source === 'openweather') {
            const client = await this.getOpenWeatherClient();
            return client.getCurrentWeather(lat, lon, { refresh });
        }
        if (source === 'weatherstation') {
            throw new errors_1.AppError('Station ID required for weatherstation', 'VALIDATION_ERROR', 400);
        }
        throw new errors_1.AppError('Unsupported weather source', 'VALIDATION_ERROR', 400);
    }
    async getForecast(lat, lon, source) {
        if (source === 'openweather') {
            const client = await this.getOpenWeatherClient();
            return client.getForecast(lat, lon);
        }
        if (source === 'weatherstation') {
            throw new errors_1.AppError('Station ID required for weatherstation', 'VALIDATION_ERROR', 400);
        }
        throw new errors_1.AppError('Unsupported weather source', 'VALIDATION_ERROR', 400);
    }
    async getForField(fieldId, type, source) {
        const { latitude, longitude } = await this.fieldRepository.getLocation(fieldId);
        if (type === 'forecast') {
            return this.getForecast(latitude, longitude, source);
        }
        return this.getCurrent(latitude, longitude, source);
    }
    async getStationCurrent(stationId) {
        if (!this.weatherStation) {
            throw new errors_1.AppError('Weather station API not configured', 'CONFIG_ERROR', 500);
        }
        return this.weatherStation.getCurrentByStationId(stationId);
    }
    async getStationForecast(stationId) {
        if (!this.weatherStation) {
            throw new errors_1.AppError('Weather station API not configured', 'CONFIG_ERROR', 500);
        }
        return this.weatherStation.getForecastByStationId(stationId);
    }
    async listAgroPolygons() {
        const client = await this.getAgroClient();
        return client.listPolygons();
    }
    async createAgroPolygon(body) {
        const client = await this.getAgroClient();
        return client.createPolygon(body);
    }
    async getAgroNdviHistory(polygonId, startDate, endDate) {
        const startUnix = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
        const endUnix = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000);
        const client = await this.getAgroClient();
        return client.getNdviHistory(polygonId, startUnix, endUnix);
    }
    async searchAgroImages(polygonId, date) {
        const client = await this.getAgroClient();
        return client.searchImages(polygonId, date);
    }
    async getAgroSoil(polygonId) {
        const client = await this.getAgroClient();
        return client.getSoil(polygonId);
    }
}
exports.WeatherService = WeatherService;
