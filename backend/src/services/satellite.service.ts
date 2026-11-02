import { SentinelHubClient } from '../external/sentinelhub.client';
import { config } from '../config';
import { redisClient } from '../cache/client';
import { FieldRepository } from '../repositories/field.repository';
import { AppError } from '../utils/errors';

export class SatelliteService {
  private readonly fieldRepository = new FieldRepository();
  private readonly client: SentinelHubClient;

  constructor() {
    if (!config.external.sentinelHubInstanceId) {
      throw new AppError('SentinelHub instance ID not configured', 'CONFIG_ERROR', 500);
    }
    this.client = new SentinelHubClient(
      {
        instanceId: config.external.sentinelHubInstanceId,
        wmsUrl: config.external.sentinelHubWmsUrl || undefined,
        clientId: config.external.sentinelHubClientId || undefined,
        clientSecret: config.external.sentinelHubClientSecret || undefined,
      },
      redisClient as any
    );
  }

  getWmsUrl(params: {
    layer: string;
    bbox: string;
    time: string;
    width?: number;
    height?: number;
    maxCloudCoverage?: number;
  }) {
    return this.client.getWMSUrl(params);
  }

  getLayers() {
    return this.client.getAvailableLayers();
  }

  async getNdviForField(fieldId: string, timeRange: string) {
    const polygon = await this.fieldRepository.getPolygon(fieldId);
    return this.client.processNDVI(polygon, timeRange);
  }

  processNdvi(polygon: number[][], timeRange: string) {
    return this.client.processNDVI(polygon, timeRange);
  }
}
