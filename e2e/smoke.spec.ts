import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('homepage should load', async ({ page }) => {
    await page.goto('/');
    
    // Should redirect to login or show dashboard
    await expect(page).toHaveURL(/login|dashboard|\//);
  });

  test('should have correct page title', async ({ page }) => {
    await page.goto('/');
    
    // Check page title contains app name
    await expect(page).toHaveTitle(/al maha|farm/i);
  });

  test('API health check should return healthy', async ({ request }) => {
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    
    const response = await request.get(`${apiUrl}/api/v1/health`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toMatch(/healthy|degraded/);
  });
});
