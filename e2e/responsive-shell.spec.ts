import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14 Pro', width: 390, height: 844 },
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'iPad landscape', width: 1024, height: 768 },
];

for (const viewport of VIEWPORTS) {
  test(`login shell fits ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/login');

    const viewportMeta = page.locator('meta[name="viewport"]');
    await expect(viewportMeta).toHaveAttribute('content', /viewport-fit=cover/);
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflowX).toBe(false);
  });
}
