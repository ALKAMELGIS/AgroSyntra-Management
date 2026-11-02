const AGRO_BASE_URL = 'https://api.agromonitoring.com/agro/1.0';

export class AgroMonitoringClient {
  constructor(private readonly apiKey: string) {}

  private buildUrl(path: string, params: Record<string, string> = {}): string {
    const url = new URL(`${AGRO_BASE_URL}${path}`);
    url.searchParams.set('appid', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async listPolygons(): Promise<unknown> {
    const response = await fetch(this.buildUrl('/polygons'));
    if (!response.ok) {
      throw new Error(`Agro API error: ${response.status}`);
    }
    return response.json();
  }

  async createPolygon(body: Record<string, unknown>): Promise<unknown> {
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

  async getNdviHistory(polygonId: string, startUnix: number, endUnix: number): Promise<unknown> {
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

  async searchImages(polygonId: string, date: string): Promise<unknown> {
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

  async getSoil(polygonId: string): Promise<unknown | null> {
    const response = await fetch(this.buildUrl('/soil', { polyid: polygonId }));
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Agro API error: ${response.statusText}`);
    }
    const data = await response.json() as Record<string, unknown>;
    return {
      moistureLevel: data.moisture ?? null,
      soilType: data.soil_type ?? null,
      temperature: data.temperature ?? null,
      ...data,
    };
  }
}
