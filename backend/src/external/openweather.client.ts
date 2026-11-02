import { Redis } from 'ioredis';

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

export class OpenWeatherClient {
  private apiKey: string;
  private baseUrl = 'https://api.openweathermap.org/data/2.5';
  private cache: Redis;
  private cacheTTL = 600;

  constructor(apiKey: string, redis: Redis) {
    this.apiKey = apiKey;
    this.cache = redis;
  }

  async getCurrentWeather(lat: number, lon: number, options?: { refresh?: boolean }): Promise<WeatherData> {
    const cacheKey = `weather:current:${lat.toFixed(4)}:${lon.toFixed(4)}`;

    if (options?.refresh) {
      await this.cache.del(cacheKey);
    } else {
      const cached = await this.cache.get(cacheKey);
      if (cached) return JSON.parse(cached) as WeatherData;
    }

    const url = `${this.baseUrl}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${this.apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();
    const result = this.transformCurrentWeather(data);

    await this.cache.setex(cacheKey, this.cacheTTL, JSON.stringify(result));

    return result;
  }

  async getForecast(lat: number, lon: number): Promise<WeatherData[]> {
    const cacheKey = `weather:forecast:${lat.toFixed(4)}:${lon.toFixed(4)}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as WeatherData[];

    const url = `${this.baseUrl}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${this.apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();
    const result = this.transformForecast(data);

    await this.cache.setex(cacheKey, this.cacheTTL * 6, JSON.stringify(result));

    return result;
  }

  private transformCurrentWeather(data: any): WeatherData {
    return {
      temperature: {
        min: data.main.temp_min,
        max: data.main.temp_max,
        avg: data.main.temp,
        feelsLike: data.main.feels_like,
      },
      humidity: data.main.humidity,
      rainfall: data.rain?.['1h'] || data.rain?.['3h'] || 0,
      pressure: data.main.pressure,
      windSpeed: data.wind.speed,
      windDirection: data.wind.deg,
      clouds: data.clouds.all,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      date: new Date().toISOString().split('T')[0],
    };
  }

  private transformForecast(data: any): WeatherData[] {
    const dailyMap = new Map<string, any[]>();

    for (const item of data.list) {
      const date = item.dt_txt.split(' ')[0];
      if (!dailyMap.has(date)) dailyMap.set(date, []);
      dailyMap.get(date)!.push(item);
    }

    return Array.from(dailyMap.entries()).map(([date, items]) => ({
      date,
      temperature: {
        min: Math.min(...items.map((i) => i.main.temp_min)),
        max: Math.max(...items.map((i) => i.main.temp_max)),
        avg: items.reduce((s, i) => s + i.main.temp, 0) / items.length,
        feelsLike: items.reduce((s, i) => s + i.main.feels_like, 0) / items.length,
      },
      humidity: items.reduce((s, i) => s + i.main.humidity, 0) / items.length,
      rainfall: items.reduce((s, i) => s + (i.rain?.['3h'] || 0), 0),
      pressure: items.reduce((s, i) => s + i.main.pressure, 0) / items.length,
      windSpeed: items.reduce((s, i) => s + i.wind.speed, 0) / items.length,
      windDirection: items[0].wind.deg,
      clouds: items.reduce((s, i) => s + i.clouds.all, 0) / items.length,
      description: items[Math.floor(items.length / 2)].weather[0].description,
      icon: items[Math.floor(items.length / 2)].weather[0].icon,
    }));
  }
}
