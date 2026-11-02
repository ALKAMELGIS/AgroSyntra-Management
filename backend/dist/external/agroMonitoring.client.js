"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgroMonitoringClient = void 0;
const AGRO_BASE_URL = 'https://api.agromonitoring.com/agro/1.0';
class AgroMonitoringClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    buildUrl(path, params = {}) {
        const url = new URL(`${AGRO_BASE_URL}${path}`);
        url.searchParams.set('appid', this.apiKey);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
        return url.toString();
    }
    async listPolygons() {
        const response = await fetch(this.buildUrl('/polygons'));
        if (!response.ok) {
            throw new Error(`Agro API error: ${response.status}`);
        }
        return response.json();
    }
    async createPolygon(body) {
        const response = await fetch(this.buildUrl('/polygons'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to create polygon: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        return response.json();
    }
    async getNdviHistory(polygonId, startUnix, endUnix) {
        const response = await fetch(this.buildUrl('/ndvi/history', {
            polyid: polygonId,
            start: String(startUnix),
            end: String(endUnix),
        }));
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Polygon not found. Please register the polygon with Agro API first.');
            }
            const errorText = await response.text();
            throw new Error(`Agro API error: ${response.statusText} - ${errorText}`);
        }
        return response.json();
    }
    async searchImages(polygonId, date) {
        const response = await fetch(this.buildUrl('/image/search', {
            start: date,
            end: date,
            polyid: polygonId,
        }));
        if (!response.ok) {
            throw new Error(`Agro API error: ${response.statusText}`);
        }
        return response.json();
    }
    async getSoil(polygonId) {
        const response = await fetch(this.buildUrl('/soil', { polyid: polygonId }));
        if (!response.ok) {
            if (response.status === 404)
                return null;
            throw new Error(`Agro API error: ${response.statusText}`);
        }
        const data = await response.json();
        return {
            moistureLevel: data.moisture ?? null,
            soilType: data.soil_type ?? null,
            temperature: data.temperature ?? null,
            ...data,
        };
    }
}
exports.AgroMonitoringClient = AgroMonitoringClient;
