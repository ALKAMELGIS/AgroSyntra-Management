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

        // One page title for assistive tech, and a descriptive browser-tab title.
        await expect(page.locator('main h1')).toHaveCount(1);
        await expect(page).toHaveTitle(/Elite Agro Cloud/);

        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .withRules(['page-has-heading-one', 'bypass', 'document-title', 'landmark-one-main'])
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
  for (const [theme, width] of [['light', 1366], ['dark', 1366], ['light', 390]] as const) {
    for (const route of ROUTES.filter((r) => !SKIP.has(r))) {
      test(`${route} with data (${theme}, ${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 600 ? 844 : 860 });
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

test.describe('typography', () => {
  test.use({ viewport: { width: 1366, height: 860 } });
  for (const route of ROUTES.filter((r) => !NEEDS_REAL_DATA.has(r))) {
    test(`${route} uses only the app fonts`, async ({ page }) => {
      await prepare(page, { rich: true });
      await page.goto(route);
      await settle(page);
      const stray = await page.evaluate(() => {
        const bad = new Set<string>();
        document.querySelectorAll('body *').forEach((el) => {
          if (el.closest('.leaflet-container, svg')) return;
          const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim());
          if (!hasText || !(el as HTMLElement).offsetParent) return;
          const first = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
          if (!['Inter', 'IBM Plex Sans Arabic', 'JetBrains Mono'].includes(first)) bad.add(`${first} <${el.tagName.toLowerCase()}>`);
        });
        return Array.from(bad);
      });
      expect(stray, 'every visible text uses Inter (or JetBrains Mono for codes)').toEqual([]);
    });
  }
});

test.describe('add / create forms', () => {
  // [route, role] pairs whose primary "Add / New" action opens a dialog.
  const FORMS: [string, string][] = [
    ['/admin/crop-history', 'worker'], ['/gps-tracking', 'worker'], ['/inventory', 'worker'],
    ['/ipm/pest-catalog', 'worker'], ['/ipm/product-catalog', 'worker'], ['/manage/recipes', 'worker'],
    ['/shift-schedule', 'worker'], ['/tasks', 'worker'], ['/manage/farm-areas', 'operation_manager'],
    ['/gis-map', 'operation_manager'],
  ];
  for (const width of [1366, 390]) {
    for (const [route, role] of FORMS) {
      if (route === '/gis-map' && width < 600) continue;
      test(`${route} add form (${role}, ${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 600 ? 844 : 860 });
        await page.addInitScript((r) => {
          localStorage.setItem('almaha_user', JSON.stringify({ id: 'u1', name: 'QA', role: r, organizationId: 'o1' }));
          localStorage.setItem('almaha_access_token', 'qa-token');
          localStorage.setItem('i18nextLng', 'en');
        }, role);
        await page.route(/\/api\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));
        await page.goto(route);
        await settle(page);
        // Shift schedule adds per day via an icon button; others use a labelled Add/New/Create button.
        const trigger = route === '/shift-schedule'
          ? page.getByRole('button', { name: 'Add' }).first()
          : page.getByRole('button', { name: /^(\+\s*)?(add|new|create)\b/i }).first();
        await trigger.click();
        const dialog = page.getByRole('dialog').last();
        await expect(dialog).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= width, 'dialog fits the screen').toBeTruthy();
        const axe = await new AxeBuilder({ page }).include('[role="dialog"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        const blocking = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].html.slice(0, 120)}`);
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

  test('login offers Arabic and switches the whole page to RTL', async ({ page }) => {
    await prepare(page, { auth: false });
    await page.goto('/login');
    await settle(page);
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeVisible();
    await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  });

  test('app shell navigation is translated in Arabic', async ({ page }) => {
    await prepare(page, { lang: 'ar' });
    await page.goto('/ipm/scouting-reports');
    await settle(page);
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByText('تقارير الكشف')).toBeVisible();
    const bar = page.getByRole('navigation', { name: 'Quick navigation' });
    await expect(bar.getByText('الرئيسية')).toBeVisible();
  });

  test('help notes show only an icon and open the text on click', async ({ page }) => {
    await prepare(page);
    await page.goto('/manpower-record');
    await settle(page);
    // The long Daily Activity Sheet explanation is hidden until asked for.
    await expect(page.getByText('Data entry workers and operators fill the Daily Activity Sheet')).toBeHidden();
    const icon = page.getByRole('button', { name: 'Information' }).first();
    const box = (await icon.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(32);
    await icon.click();
    // While the popup is open the rest of the page is aria-hidden (modal popover), so assert on the popup.
    await expect(page.getByRole('dialog', { name: 'Information' })).toContainText('Daily Activity Sheet');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Information' })).toBeHidden();
    await expect(icon).toHaveAttribute('aria-expanded', 'false');
    // "View only" is an eye icon with the same behaviour.
    await page.getByRole('button', { name: 'View only' }).first().click();
    await expect(page.getByRole('dialog', { name: 'View only' })).toBeVisible();
  });

  test('skip link jumps keyboard users past the navigation', async ({ page }) => {
    await prepare(page);
    await page.goto('/tasks');
    await settle(page);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await expect(page).toHaveTitle('Tasks — Elite Agro Cloud');
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
