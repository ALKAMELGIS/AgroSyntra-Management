import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@almahafarm.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'Admin123!@#';

async function login(page: any) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/(?!login)/, { timeout: 15000 });
}

test.describe('Data Entry Pages', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('recipes page should load and display table', async ({ page }) => {
    await page.goto('/manage/recipes');
    await page.waitForLoadState('networkidle');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });
  });

  test('inventory page should load tabs', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');
    const errorBoundary = page.getByText('Something went wrong');
    await expect(errorBoundary).not.toBeVisible();
  });

  test('tasks page should load', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
    const errorBoundary = page.getByText('Something went wrong');
    await expect(errorBoundary).not.toBeVisible();
  });

  test('manpower record page should load', async ({ page }) => {
    await page.goto('/manpower-record');
    await page.waitForLoadState('networkidle');
    const errorBoundary = page.getByText('Something went wrong');
    await expect(errorBoundary).not.toBeVisible();
  });

  test('GIS map page should load', async ({ page }) => {
    await page.goto('/gis-map');
    await page.waitForLoadState('networkidle');
    const errorBoundary = page.getByText('Something went wrong');
    await expect(errorBoundary).not.toBeVisible();
  });

  test('user management page should load', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });
  });
});
