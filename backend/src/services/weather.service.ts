import { OpenWeatherClient } from '../external/openweather.client';
import { WeatherStationClient } from '../external/weatherstation.client';
import { AgroMonitoringClient } from '../external/agroMonitoring.client';
import { config } from '../config';
import { redisClient } from '../cache/client';
import { FieldRepository } from '../repositories/field.repository';
import { AppError } from '../utils/errors';
import { resolveOpenWeatherKey } from './systemSettings.service';

type WeatherSource = 'openweather' | 'weatherstation';

export class WeatherService {
  private readonly fieldRepository = new FieldRepository();
  private readonly weatherStation?: WeatherStationClient;

  constructor() {
    if (config.external.weatherStationApiBaseUrl && config.external.weatherStationApiKey) {
      this.weatherStation = new WeatherStationClient(
        config.external.weatherStationApiBaseUrl,
        config.external.weatherStationApiKey,
        config.external.weatherStationApiHeader,
        redisClient as any
      );
    }
  }

  async isOpenWeatherConfigured(): Promise<boolean> {
    const key = await resolveOpenWeatherKey();
    return !!key;
  }

  private async getOpenWeatherClient(): Promise<OpenWeatherClient> {
    const apiKey = await resolveOpenWeatherKey();
    if (!apiKey) {
      throw new AppError('OpenWeather API key not configured. Add it in Admin → API Keys → Weather Map API Key.', 'CONFIG_ERROR', 500);
    }
    return new OpenWeatherClient(apiKey, redisClient as any);
  }

  private async getAgroClient(): Promise<AgroMonitoringClient> {
    const apiKey = await resolveOpenWeatherKey();
    if (!apiKey) {
      throw new AppError('OpenWeather API key not configured. Add it in Admin → API Keys → Weather Map API Key.', 'CONFIG_ERROR', 500);
    }
    return new AgroMonitoringClient(apiKey);
  }

  async getCurrent(lat: number, lon: number, source: WeatherSource, refresh = false) {
    if (source === 'openweather') {
      const client = await this.getOpenWeatherClient();
      return client.getCurrentWeather(lat, lon, { refresh });
    }
    if (source === 'weatherstation') {
      throw new AppError('Station ID required for weatherstation', 'VALIDATION_ERROR', 400);
    }
    throw new AppError('Unsupported weather source', 'VALIDATION_ERROR', 400);
  }

  async getForecast(lat: number, lon: number, source: WeatherSource) {
    if (source === 'openweather') {
      const client = await this.getOpenWeatherClient();
      return client.getForecast(lat, lon);
    }
    if (source === 'weatherstation') {
      throw new AppError('Station ID required for weatherstation', 'VALIDATION_ERROR', 400);
    }
    throw new AppError('Unsupported weather source', 'VALIDATION_ERROR', 400);
  }

  async getForField(fieldId: string, type: 'current' | 'forecast', source: WeatherSource) {
    const { latitude, longitude } = await this.fieldRepository.getLocation(fieldId);
    if (type === 'forecast') {
      return this.getForecast(latitude, longitude, source);
    }
    return this.getCurrent(latitude, longitude, source);
  }

  async getStationCurrent(stationId: string) {
    if (!this.weatherStation) {
      throw new AppError('Weather station API not configured', 'CONFIG_ERROR', 500);
    }
    return this.weatherStation.getCurrentByStationId(stationId);
  }

  async getStationForecast(stationId: string) {
    if (!this.weatherStation) {
      throw new AppError('Weather station API not configured', 'CONFIG_ERROR', 500);
    }
    return this.weatherStation.getForecastByStationId(stationId);
  }

  async listAgroPolygons() {
    const client = await this.getAgroClient();
    return client.listPolygons();
  }

  async createAgroPolygon(body: Record<string, unknown>) {
    const client = await this.getAgroClient();
    return client.createPolygon(body);
  }

  async getAgroNdviHistory(polygonId: string, startDate: string, endDate: string) {
    const startUnix = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
    const endUnix = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000);
    const client = await this.getAgroClient();
    return client.getNdviHistory(polygonId, startUnix, endUnix);
  }

  async searchAgroImages(polygonId: string, date: string) {
    const client = await this.getAgroClient();
    return client.searchImages(polygonId, date);
  }

  async getAgroSoil(polygonId: string) {
    const client = await this.getAgroClient();
    return client.getSoil(polygonId);
  }
}
