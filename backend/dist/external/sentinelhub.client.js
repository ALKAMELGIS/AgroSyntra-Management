"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SentinelHubClient = void 0;
const crypto_1 = require("crypto");
const keys_1 = require("../cache/keys");
class SentinelHubClient {
    constructor(config, redis) {
        this.ndviCacheTTL = 1800;
        this.instanceId = config.instanceId;
        this.wmsUrl = config.wmsUrl || `https://services.sentinel-hub.com/ogc/wms/${config.instanceId}`;
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.cache = redis;
    }
    getWMSUrl(params) {
        const queryParams = new URLSearchParams({
            SERVICE: 'WMS',
            REQUEST: 'GetMap',
            LAYERS: params.layer,
            FORMAT: 'image/png',
            TRANSPARENT: 'true',
            VERSION: '1.3.0',
            MAXCC: String(params.maxCloudCoverage || 30),
            WIDTH: String(params.width || 512),
            HEIGHT: String(params.height || 512),
            CRS: 'EPSG:4326',
            BBOX: params.bbox,
            TIME: params.time,
        });
        return `${this.wmsUrl}?${queryParams.toString()}`;
    }
    async getAvailableLayers() {
        const cacheKey = `sentinelhub:layers:${this.instanceId}`;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return JSON.parse(cached);
        const url = `${this.wmsUrl}?SERVICE=WMS&REQUEST=GetCapabilities`;
        const response = await fetch(url);
        const text = await response.text();
        const layers = this.parseCapabilities(text);
        await this.cache.setex(cacheKey, 86400, JSON.stringify(layers));
        return layers;
    }
    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
            return this.accessToken;
        }
        if (!this.clientId || !this.clientSecret) {
            throw new Error('OAuth credentials not configured');
        }
        const response = await fetch('https://services.sentinel-hub.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.clientId,
                client_secret: this.clientSecret,
            }),
        });
        if (!response.ok) {
            throw new Error('Failed to get SentinelHub access token');
        }
        const data = await response.json();
        this.accessToken = data.access_token;
        this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000 - 60000);
        return this.accessToken;
    }
    async processNDVI(polygon, timeRange) {
        const cacheKey = this.getNdviCacheKey(polygon, timeRange);
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            const buffer = Buffer.from(parsed.imageBase64, 'base64');
            return {
                image: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
                contentType: parsed.contentType,
            };
        }
        const token = await this.getAccessToken();
        const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: [{ bands: ["B04", "B08"] }],
          output: { bands: 1 }
        };
      }
      function evaluatePixel(sample) {
        let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
        return [ndvi];
      }
    `;
        const request = {
            input: {
                bounds: {
                    geometry: {
                        type: 'Polygon',
                        coordinates: [polygon.map(([lat, lng]) => [lng, lat])],
                    },
                },
                data: [
                    {
                        type: 'sentinel-2-l2a',
                        dataFilter: {
                            timeRange: {
                                from: timeRange.split('/')[0] + 'T00:00:00Z',
                                to: timeRange.split('/')[1] + 'T23:59:59Z',
                            },
                            maxCloudCoverage: 30,
                        },
                    },
                ],
            },
            output: {
                width: 512,
                height: 512,
                responses: [{ identifier: 'default', format: { type: 'image/png' } }],
            },
            evalscript,
        };
        const response = await fetch('https://services.sentinel-hub.com/api/v1/process', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            throw new Error(`SentinelHub process error: ${response.status}`);
        }
        const contentType = response.headers.get('content-type') || 'image/png';
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        await this.cache.setex(cacheKey, this.ndviCacheTTL, JSON.stringify({ imageBase64: imageBuffer.toString('base64'), contentType }));
        return {
            image: imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength),
            contentType,
        };
    }
    parseCapabilities(xml) {
        const layerRegex = /<Layer.*?<Name>(.+?)<\/Name>.*?<Title>(.+?)<\/Title>/gs;
        const layers = [];
        let match;
        while ((match = layerRegex.exec(xml)) !== null) {
            layers.push({ id: match[1], name: match[2] });
        }
        return layers;
    }
    getNdviCacheKey(polygon, timeRange) {
        const hash = (0, crypto_1.createHash)('sha1')
            .update(JSON.stringify({ polygon, timeRange }))
            .digest('hex');
        return keys_1.cacheKeys.sentinelNdvi(hash);
    }
}
exports.SentinelHubClient = SentinelHubClient;
