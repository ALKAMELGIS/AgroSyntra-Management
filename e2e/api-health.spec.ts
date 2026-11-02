import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:3001';

test.describe('API Health & Readiness', () => {
  test('health endpoint should report status', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/health`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.checks.database).toBeDefined();
    expect(data.data.checks.redis).toBeDefined();
    expect(data.data.memory).toBeDefined();
    expect(data.data.uptime).toBeGreaterThanOrEqual(0);
  });

  test('liveness probe should respond', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/health/live`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.data.status).toBe('live');
  });

  test('readiness probe should respond', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/health/ready`);
    const data = await res.json();
    expect(data.data.status).toMatch(/ready|not_ready/);
  });

  test('login API should reject invalid credentials', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: 'fake@test.com', password: 'wrong' },
    });
    expect(res.status()).toBe(401);
  });

  test('protected routes should require auth', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/users`);
    expect(res.status()).toBe(401);
  });
});
