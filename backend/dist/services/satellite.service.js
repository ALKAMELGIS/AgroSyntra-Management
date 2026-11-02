"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SatelliteService = void 0;
const sentinelhub_client_1 = require("../external/sentinelhub.client");
const config_1 = require("../config");
const client_1 = require("../cache/client");
const field_repository_1 = require("../repositories/field.repository");
const errors_1 = require("../utils/errors");
class SatelliteService {
    constructor() {
        this.fieldRepository = new field_repository_1.FieldRepository();
        if (!config_1.config.external.sentinelHubInstanceId) {
            throw new errors_1.AppError('SentinelHub instance ID not configured', 'CONFIG_ERROR', 500);
        }
        this.client = new sentinelhub_client_1.SentinelHubClient({
            instanceId: config_1.config.external.sentinelHubInstanceId,
            wmsUrl: config_1.config.external.sentinelHubWmsUrl || undefined,
            clientId: config_1.config.external.sentinelHubClientId || undefined,
            clientSecret: config_1.config.external.sentinelHubClientSecret || undefined,
        }, client_1.redisClient);
    }
    getWmsUrl(params) {
        return this.client.getWMSUrl(params);
    }
    getLayers() {
        return this.client.getAvailableLayers();
    }
    async getNdviForField(fieldId, timeRange) {
        const polygon = await this.fieldRepository.getPolygon(fieldId);
        return this.client.processNDVI(polygon, timeRange);
    }
    processNdvi(polygon, timeRange) {
        return this.client.processNDVI(polygon, timeRange);
    }
}
exports.SatelliteService = SatelliteService;
