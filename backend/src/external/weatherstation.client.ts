import { Redis } from 'ioredis';
import { cacheKeys } from '../cache/keys';

interface WeatherData {
  temperature: { min: number; max: number; avg: number; feelsLike: number };
  humidity: number;
  rainfall: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  clouds: number;
  description: string;
  icon: string;
  date: string;
}

export class WeatherStationClient {
  private apiBaseUrl: string;
  private apiKey: string;
  private apiHeader: string;
  private cache: Redis;
  private cacheTTL = 300; // 5 minutes

  constructor(baseUrl: string, apiKey: string, apiHeader: string, redis: Redis) {
    this.apiBaseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.apiHeader = apiHeader;
    this.cache = redis;
  }

  async getCurrentByStationId(stationId: string): Promise<WeatherData> {
    const cacheKey = cacheKeys.weatherStationCurrent(stationId);
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as WeatherData;

    const response = await fetch(
      `${this.apiBaseUrl}/current?stationId=${encodeURIComponent(stationId)}`,
      {
        headers: {
          [this.apiHeader]: this.apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Weather station API error: ${response.status}`);
    }

    const data = (await response.json()) as WeatherData;
    await this.cache.setex(cacheKey, this.cacheTTL, JSON.stringify(data));
    return data;
  }

  async getForecastByStationId(stationId: string): Promise<WeatherData[]> {
    const cacheKey = cacheKeys.weatherStationForecast(stationId);
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as WeatherData[];

    const response = await fetch(
      `${this.apiBaseUrl}/forecast?stationId=${encodeURIComponent(stationId)}`,
      {
        headers: {
          [this.apiHeader]: this.apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Weather station API error: ${response.status}`);
    }

    const data = (await response.json()) as WeatherData[];
    await this.cache.setex(cacheKey, this.cacheTTL * 6, JSON.stringify(data)); // 30 minutes
    return data;
  }
}
