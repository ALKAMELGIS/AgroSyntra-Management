import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@almahafarm.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'Admin123!@#';

async function login(page: any) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/(?!login)/, { timeout: 15000 });
}

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const sidebarLinks = [
    { path: '/dashboard', text: /dashboard/i },
    { path: '/ecph-entry', text: /ec.*ph/i },
    { path: '/fertigation/entry', text: /fertigation/i },
    { path: '/harvest/entry', text: /harvest/i },
    { path: '/inventory', text: /inventory/i },
    { path: '/tasks', text: /tasks/i },
    { path: '/weather-log', text: /weather/i },
    { path: '/manage/recipes', text: /recipe/i },
    { path: '/manage/farm-areas', text: /farm.*area/i },
    { path: '/manage/field-types', text: /field.*type/i },
    { path: '/manage/valves', text: /valve/i },
  ];

  for (const link of sidebarLinks) {
    test(`should load ${link.path} without error`, async ({ page }) => {
      await page.goto(link.path);
      await page.waitForLoadState('networkidle');
      const errorBoundary = page.getByText('Something went wrong');
      await expect(errorBoundary).not.toBeVisible();
    });
  }

  test('command palette should open with Ctrl+K', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 5000 });
  });

  test('theme toggle should work', async ({ page }) => {
    const themeButton = page.getByRole('button', { name: /theme/i });
    await expect(themeButton).toBeVisible();
    await themeButton.click();
  });
});
