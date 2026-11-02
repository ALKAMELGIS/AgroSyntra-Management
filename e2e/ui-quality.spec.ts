/**
 * UI quality gate — runs every main screen on phone, tablet and desktop and fails on:
 *  - uncaught page errors
 *  - horizontal page overflow
 *  - serious / critical accessibility violations (axe-core, WCAG 2.2 A/AA)
 *  - touch targets below 24×24 CSS px in the app shell (WCAG 2.5.8)
 *  - missing accessible names on interactive controls
 *
 * The backend is mocked (empty lists), so it runs without a database:
 *   npx playwright test e2e/ui-quality.spec.ts
 * Point TEST_URL at a running dev server or a served production build.
 */
import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

// Entrance fades would make axe sample half-transparent text; the app honours this setting.
test.use({ reducedMotion: 'reduce' });

const USER = { id: 1, name: 'QA Manager', email: 'qa@farm.test', role: 'ceo', organizationId: 1 };

/** Screens that need real backend payload shapes to render — checked for overflow only. */
const NEEDS_REAL_DATA = new Set(['/summary', '/admin/health']);

export const ROUTES = [
  '/', '/hub/operations', '/hub/ipm', '/dashboard', '/daily-brief', '/summary', '/notifications',
  '/ecph-entry', '/fertigation/entry', '/irrigation/entry', '/harvest/entry', '/pump-room', '/templates',
  '/harvest/dashboard', '/fertigation/dashboard', '/irrigation/dashboard', '/efficiency-dashboard',
  '/ecph/reports', '/fertigation/reports', '/harvest/reports', '/report-builder',
  '/ipm/pesticide-applications', '/ipm/biological-control-record', '/ipm/bumble-bees', '/ipm/product-catalog',
  '/ipm/scouting-reports', '/ipm/pest-catalog', '/ipm/spray-calendar', '/audit/batch-trace', '/audit/phi-audit-log',
  '/weather-log', '/weather-log/map', '/remote-sensing', '/gis-map', '/gps-tracking',
  '/tasks', '/shift-schedule', '/manpower-record', '/manpower-cost',
  '/manage/countries', '/manage/farm-areas', '/manage/field-types', '/manage/valves', '/manage/recipes',
  '/manage/seasons', '/inventory', '/admin/users', '/admin/organization', '/admin/crop-history', '/admin/health',
];

/** Generic populated rows so tables, cards and charts render with content (shape is deliberately broad). */
const CROPS = ['Tomato', 'Cucumber', 'Pepper', 'Lettuce', 'Strawberry', 'Eggplant', 'Zucchini', 'Melon'];
const NAMES = ['North Block A', 'North Block B', 'GH-01', 'GH-02', 'Open Field 3', 'Nursery', 'Pivot 1', 'Pivot 2'];
const RICH_ROWS = NAMES.map((name, i) => ({
  id: `r${i + 1}`, name, code: `C-${100 + i}`, title: `Record ${i + 1}`,
  date: `2026-10-${20 + i}`, created_at: `2026-10-${20 + i}T08:00:00Z`, updated_at: `2026-10-${20 + i}T09:00:00Z`,
  site_id: 's1', siteId: 's1', site_name: 'Al Maha GH', field_id: `f${i + 1}`, fieldId: `f${i + 1}`, field_name: `GH-0${i + 1}`,
  crop: CROPS[i], crop_name: CROPS[i], variety: 'Standard', quantity: 120 + i * 13, amount: 40 + i * 3, value: 12 + i,
  total: 300 + i * 20, status: ['active', 'pending', 'approved', 'active', 'closed', 'active', 'pending', 'active'][i],
  role: 'worker', email: `user${i}@farm.test`, ec_in: 2.1, ph_in: 6.1, ec_out: 2.6, ph_out: 6.4, drain: 28 + i,
  temperature: 30 + i, humidity: 50 + i, notes: 'Routine check', unit: 'kg', category: 'Fertilizer', is_active: true, count: i + 2,
}));

async function prepare(page: Page, opts: { lang?: 'en' | 'ar'; theme?: 'light' | 'dark'; auth?: boolean; rich?: boolean } = {}) {
  await page.addInitScript(([u, lang, theme]) => {
    if (u) {
      localStorage.setItem('almaha_user', JSON.stringify(u));
      localStorage.setItem('almaha_access_token', 'qa-token');
      localStorage.setItem('almaha_refresh_token', 'qa-refresh');
    }
    localStorage.setItem('i18nextLng', lang as string);
    localStorage.setItem('almaha_theme_mode', theme as string);
  }, [opts.auth === false ? null : USER, opts.lang || 'en', opts.theme || 'light'] as const);
  const data = opts.rich ? RICH_ROWS : [];
  await page.route(/\/api\/v1\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, pagination: { total: data.length, page: 1, limit: 50 } }) }));
  await page.route(/socket\.io/, (route) => route.abort());
  // Third-party map tiles / weather calls are irrelevant to layout and slow the run down.
  await page.route(/tile\.|arcgisonline|sentinel-hub|openweathermap|googleapis\.com\/maps/, (route) => route.abort());
}

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
  // Let MUI fades/collapses finish so contrast is measured on final colours.
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 4000 })
    .catch(() => {});
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(`${route} renders cleanly`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await prepare(page);
        await page.goto(route);
        await settle(page);

        expect(await horizontalOverflow(page), 'page must not scroll sideways').toBeLessThanOrEqual(1);
        if (NEEDS_REAL_DATA.has(route)) return;

        expect(errors, 'no uncaught errors').toEqual([]);
        await expect(page.getByText('Something went wrong')).toHaveCount(0);

        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          // Leaflet renders its own third-party controls.
          .exclude('.leaflet-control-container')
          .analyze();
        const blocking = axe.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
        expect(blocking, 'serious/critical accessibility issues').toEqual([]);
      });
    }

    test('app shell controls are large enough to tap and are named', async ({ page }) => {
      await prepare(page);
      await page.goto('/');
      await settle(page);
      const small = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('header button, header a, nav button, nav a, [aria-label="Quick navigation"] button'));
        return nodes
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            const r = el.getBoundingClientRect();
            const name = el.getAttribute('aria-label') || (el.textContent || '').trim();
            return { name, w: Math.round(r.width), h: Math.round(r.height) };
          })
          .filter((x) => x.w < 24 || x.h < 24 || !x.name);
      });
      expect(small).toEqual([]);
    });
  });
}

test.describe('Arabic / RTL and dark mode', () => {
  for (const route of ['/', '/login', '/ecph-entry', '/ipm/scouting-reports', '/admin/organization', '/tasks']) {
    test(`${route} works in Arabic`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await prepare(page, { lang: 'ar', auth: route !== '/login' });
      await page.goto(route);
      await settle(page);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      expect(errors).toEqual([]);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    });
  }

  for (const route of [...ROUTES.filter((r) => !NEEDS_REAL_DATA.has(r)), '/login']) {
    test(`${route} has no contrast failures in dark mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 860 });
      await prepare(page, { theme: 'dark', auth: route !== '/login' });
      await page.goto(route);
      await settle(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).exclude('.leaflet-control-container').analyze();
      const issues = axe.violations.flatMap((v) => v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary || '').split('\n')[1] || ''}`.slice(0, 220)));
      expect(issues).toEqual([]);
    });
  }

  for (const route of ROUTES.filter((r) => !NEEDS_REAL_DATA.has(r))) {
    test(`${route} has no light panels in dark mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 860 });
      await prepare(page, { theme: 'dark' });
      await page.goto(route);
      await settle(page);
      // Any element with a light background covering >6% of the screen is a dark-mode leak.
      const leaks = await page.evaluate(() => {
        const vw = innerWidth; const vh = innerHeight; const out: string[] = [];
        const lum = (c: string) => {
          const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 0;
          const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
          if (parseFloat(a) < 0.6) return 0;
          return (0.2126 * +r + 0.7152 * +g + 0.0722 * +b) / 255;
        };
        document.querySelectorAll('body *').forEach((el) => {
          if ((el as HTMLElement).closest('.leaflet-container')) return;
          const r = el.getBoundingClientRect();
          const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
          const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
          if ((w * h) / (vw * vh) < 0.06) return;
          if (lum(getComputedStyle(el).backgroundColor) > 0.75) out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 60)}`);
        });
        return out;
      });
      expect(leaks).toEqual([]);
    });
  }

  for (const route of ROUTES.filter((r) => !NEEDS_REAL_DATA.has(r))) {
    test(`${route} renders in Arabic without overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await prepare(page, { lang: 'ar' });
      await page.goto(route);
      await settle(page);
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      expect(errors).toEqual([]);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('populated data', () => {
  // Pages whose payload shape a generic fixture cannot satisfy.
  const SKIP = new Set([...NEEDS_REAL_DATA, '/audit/phi-audit-log']);
  for (const theme of ['light', 'dark'] as const) {
    for (const route of ROUTES.filter((r) => !SKIP.has(r))) {
      test(`${route} with data (${theme})`, async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 860 });
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await prepare(page, { theme, rich: true });
        await page.goto(route);
        await settle(page);
        expect(errors).toEqual([]);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .exclude('.leaflet-control-container')
          .analyze();
        const blocking = axe.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} ${(n.failureSummary || '').split('\n')[1] || ''}`.slice(0, 200)).join(' | ')}`);
        expect(blocking).toEqual([]);
      });
    }
  }
});

test.describe('core usability', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('phone bottom navigation reaches menu, search and alerts', async ({ page }) => {
    await prepare(page);
    await page.goto('/');
    await settle(page);
    const bar = page.getByRole('navigation', { name: 'Quick navigation' });
    await expect(bar).toBeVisible();

    await bar.getByRole('button', { name: 'Alerts' }).click();
    await expect(page).toHaveURL(/\/notifications$/);

    await bar.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByPlaceholder(/search pages/i)).toBeVisible();
    await page.keyboard.press('Escape');

    await bar.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).first()).toBeVisible();
  });

  test('breadcrumb shows where the user is and links back to the module hub', async ({ page }) => {
    await prepare(page);
    await page.goto('/ipm/scouting-reports');
    await settle(page);
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByText('Scouting Reports')).toBeVisible();
    await crumbs.getByRole('link', { name: 'IPM' }).click();
    await expect(page).toHaveURL(/\/hub\/ipm$/);
  });

  test('recently opened pages appear on Home', async ({ page }) => {
    await prepare(page);
    await page.goto('/tasks');
    await settle(page);
    await page.goto('/');
    await settle(page);
    await expect(page.getByRole('region', { name: 'Recently opened' }).getByText('Tasks')).toBeVisible();
  });

  test('language switch flips the layout to RTL', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepare(page);
    await page.goto('/');
    await settle(page);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('keyboard focus is visible on the first control', async ({ page }) => {
    await prepare(page, { auth: false });
    await page.goto('/login');
    await settle(page);
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return cs.outlineStyle !== 'none' || cs.boxShadow !== 'none';
    });
    expect(outline).toBe(true);
  });
});
