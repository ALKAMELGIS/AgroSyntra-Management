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
// Every screen must render with empty or partial data (no exemptions since round 18).
const NEEDS_REAL_DATA = new Set<string>();

/**
 * Finds visible controls and text that overlap each other (in the page, not in
 * menus / dialogs / maps / charts). Parts of one control (an outlined field's
 * label and input, a badge on its icon) are not counted.
 */
const OVERLAP_PROBE = () => {
  const main = document.querySelector('main');
  if (!main) return [];
  const SKIP = '.leaflet-container, .recharts-wrapper, [role="dialog"], .MuiPopover-root, .MuiTooltip-popper, [aria-hidden="true"], .MuiBadge-badge, .MuiAvatarGroup-root';
  const UNIT = '.MuiFormControl-root, .MuiTextField-root, .MuiAutocomplete-root, .MuiChip-root, .MuiToggleButtonGroup-root, .MuiSlider-root, .MuiRating-root, .MuiTab-root, .MuiButtonBase-root, .MuiFormControlLabel-root';
  const els = Array.from(main.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], .MuiChip-root, h1, h2, h3, h4, h5, h6, p, span, td, th, label'))
    .filter((el) => {
      if (el.closest(SKIP)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight * 3) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
      for (let n = el; n && n !== main; n = n.parentElement) {
        const ns = getComputedStyle(n);
        if (ns.position === 'fixed' || ns.position === 'sticky') return false;
        if (ns.clip === 'rect(0px, 0px, 0px, 0px)' || ns.clipPath === 'inset(50%)') return false; // screen-reader only
      }
      // text elements only when they carry their own text
      if (/^(SPAN|P|TD|TH|H\d|LABEL)$/.test(el.tagName)) {
        return Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent || '').trim());
      }
      return true;
    })
    .slice(0, 700);
  const rects = els.map((el) => el.getBoundingClientRect());
  const unit = els.map((el) => el.closest(UNIT));
  const found = [];
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (unit[i] && unit[i] === unit[j]) continue;
      if (unit[i] && (unit[i].contains(b))) continue;
      if (unit[j] && (unit[j].contains(a))) continue;
      const lab = a.tagName === 'LABEL' ? a : b.tagName === 'LABEL' ? b : null;
      const other = lab === a ? b : a;
      if (lab && other.id && lab.getAttribute('for') === other.id) continue; // a label and its own field
      const A = rects[i], B = rects[j];
      const w = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      const h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (w <= 2 || h <= 2) continue;
      const smaller = Math.min(A.width * A.height, B.width * B.height);
      if ((w * h) / smaller < 0.2) continue;
      const name = (el) => `${el.tagName.toLowerCase()}"${(el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 18)}"`;
      found.push(`${name(a)} × ${name(b)}`);
      if (found.length > 10) return found;
    }
  }
  return found;
};


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

        // Nothing on the page overlaps anything else (controls, labels, text).
        expect(await page.evaluate(OVERLAP_PROBE), 'no overlapping elements').toEqual([]);

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
        expect(await page.evaluate(OVERLAP_PROBE), 'no overlapping elements with data').toEqual([]);
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
  for (const lang of ['en', 'ar'] as const) {
    // English: Inter leads; Arabic: IBM Plex Sans Arabic leads for every text (numbers and Latin too).
    const expected = lang === 'ar' ? 'IBM Plex Sans Arabic' : 'Inter';
    for (const route of ROUTES.filter((r) => !NEEDS_REAL_DATA.has(r))) {
      test(`${route} uses ${expected} (${lang})`, async ({ page }) => {
        await prepare(page, { rich: true, lang });
        await page.goto(route);
        await settle(page);
        const stray = await page.evaluate((want) => {
          const bad = new Set<string>();
          document.querySelectorAll('body *').forEach((el) => {
            if (el.closest('.leaflet-container, svg')) return;
            const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim());
            if (!hasText || !(el as HTMLElement).offsetParent) return;
            const first = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
            if (first !== want && first !== 'JetBrains Mono') bad.add(`${first} <${el.tagName.toLowerCase()}>`);
          });
          return Array.from(bad);
        }, expected);
        expect(stray, `every visible text uses ${expected} (or JetBrains Mono for codes)`).toEqual([]);
      });
    }
  }
  test('IBM Plex Sans Arabic is loaded and used for Arabic text', async ({ page }) => {
    await prepare(page, { lang: 'ar' });
    await page.goto('/');
    await settle(page);
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return ['400', '500', '600', '700'].map((w) => document.fonts.check(`${w} 16px "IBM Plex Sans Arabic"`, 'مرحبا'));
    });
    expect(loaded).toEqual([true, true, true, true]);
  });
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
    const crumbs = page.getByRole('navigation', { name: 'مسار التنقل' });
    await expect(crumbs.getByText('تقارير الكشف')).toBeVisible();
    const bar = page.getByRole('navigation', { name: 'التنقل السريع' });
    await expect(bar.getByText('الرئيسية')).toBeVisible();
  });

  test('page content (labels, buttons, headers) is translated in Arabic and restored in English', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepare(page, { rich: true });
    await page.goto('/harvest/entry');
    await settle(page);
    const main = page.locator('main');
    await expect(main.getByText('Filters', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'العربية' }).click();
    await page.keyboard.press('Escape');
    await expect(main.getByText('عوامل التصفية', { exact: true }).first()).toBeVisible();
    await expect(main.getByText('الحصاد اليومي', { exact: true }).first()).toBeVisible();
    // Common interface words no longer appear in English.
    for (const en of ['Filters', 'Daily Harvest', 'Summary', 'Field', 'Crop']) {
      await expect(main.getByText(en, { exact: true })).toHaveCount(0);
    }
    // Switching back to English restores the original wording.
    await page.getByRole('button', { name: 'قائمة الحساب' }).click();
    await page.getByRole('button', { name: 'English' }).click();
    await page.keyboard.press('Escape');
    await expect(main.getByText('Filters', { exact: true }).first()).toBeVisible();
    await expect(main.getByText('عوامل التصفية', { exact: true })).toHaveCount(0);
  });

  test('saving with empty required fields points at the fields', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      localStorage.setItem('almaha_user', JSON.stringify({ id: 'u1', name: 'QA', role: 'worker', organizationId: 'o1' }));
      localStorage.setItem('almaha_access_token', 'qa-token');
      localStorage.setItem('i18nextLng', 'en');
    });
    await page.route(/\/api\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));
    await page.goto('/tasks');
    await settle(page);
    await page.getByRole('button', { name: 'New Task' }).click();
    const dialog = page.getByRole('dialog');
    const title = dialog.getByLabel(/^Title/);
    const noteCount = () => dialog.locator('.MuiFormControl-root').evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el, '::after').content.includes('Required')).length);
    expect(await noteCount()).toBe(0); // a fresh form is calm
    await dialog.getByRole('button', { name: 'Create Task' }).click();
    // The empty required field is outlined with a note and receives focus.
    await expect(title).toBeFocused();
    await expect.poll(noteCount).toBe(1);
    await title.fill('Check drippers in GH-02');
    await expect.poll(noteCount).toBe(0);
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

  test('success toast appears above the phone navigation and can be closed', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('almaha_user', JSON.stringify({ id: 'u1', name: 'QA', role: 'worker', organizationId: 'o1' }));
      localStorage.setItem('almaha_access_token', 'qa-token');
      localStorage.setItem('i18nextLng', 'en');
    });
    await page.route(/\/api\/v1\//, (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: r.request().method() === 'GET' ? [] : { id: 't1', title: 'x' } }),
    }));
    await page.goto('/tasks');
    await settle(page);
    await page.getByRole('button', { name: /^(\+\s*)?(add|new|create)\b/i }).first().click();
    const dialog = page.getByRole('dialog').last();
    await dialog.getByRole('textbox').first().fill('Check drip lines in GH-02');
    await dialog.getByRole('button', { name: /create|save|add/i }).last().click();
    const toast = page.getByRole('status').filter({ hasText: 'Task created' });
    await expect(toast).toBeVisible();
    const t = (await toast.boundingBox())!;
    const nav = (await page.getByRole('navigation', { name: 'Quick navigation' }).boundingBox())!;
    expect(t.y + t.height).toBeLessThanOrEqual(nav.y + 1);
    await toast.getByRole('button', { name: 'Close notification' }).click();
    await expect(toast).toBeHidden();
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





// Map screens: the map is the main workspace on every screen size.
test.describe('map screens', () => {
  const MAP_ROUTES = ['/gis-map', '/remote-sensing', '/gps-tracking'];
  for (const [w, h] of [[360, 740], [820, 1180], [1280, 800], [1920, 1080]]) {
    for (const route of MAP_ROUTES) {
      test(`${route} at ${w}px: map fills the screen, controls never overlap`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await prepare(page);
        await page.goto(route);
        await settle(page);
        const map = page.locator('.leaflet-container').first();
        await expect(map).toBeVisible();
        const r = await map.boundingBox();
        // Fills the height from where it starts to the bottom of the screen (min 360 px).
        expect(r!.y + r!.height, 'map reaches the bottom area of the screen').toBeGreaterThan(h - (w < 900 ? 64 + 60 : 60));
        expect(r!.height).toBeGreaterThanOrEqual(355);
        // The page only scrolls when a short phone can't fit the header plus the minimum map height.
        if (r!.height > 365) {
          expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight), 'page does not scroll past the map').toBeLessThanOrEqual(24);
        }
        const overlaps = await page.evaluate(() => {
          const m = document.querySelector('.leaflet-container')!; const wrap = m.parentElement!;
          const items = Array.from(wrap.querySelectorAll('.leaflet-control, .MuiPaper-root, .MuiToggleButtonGroup-root, button'))
            .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 4 && b.height > 4 && getComputedStyle(e).visibility !== 'hidden'; });
          const top = items.filter((e) => !items.some((o) => o !== e && o.contains(e)));
          const out: string[] = [];
          for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
            const a = top[i].getBoundingClientRect(), c = top[j].getBoundingClientRect();
            if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) out.push(`${top[i].textContent!.trim().slice(0, 16)} × ${top[j].textContent!.trim().slice(0, 16)}`);
          }
          return out;
        });
        expect(overlaps, 'map controls, legends and panels do not cover each other').toEqual([]);
      });
    }
  }
});

test.describe('map workspace (docked panel)', () => {
  test('GIS Map: tools open a docked panel beside the map; legend follows visible layers; basemaps; add data', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => localStorage.setItem('gis.workspace', ''));
    await prepare(page);
    const layers = [
      { id: 'l1', name: 'Al Maha fields', sourceType: 'file', featureCount: 4, isVisible: true, style: { color: '#1f7a4d' } },
      { id: 'l2', name: 'Drainage lines', sourceType: 'file', featureCount: 2, isVisible: false, style: { color: '#b8523a' } },
    ];
    await page.route(/\/api\/v1\/.*layer/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: layers }) }));
    await page.goto('/gis-map');
    await settle(page);
    const map = page.locator('.leaflet-container').first();
    const full = (await map.boundingBox())!.width;
    const tools = page.getByRole('navigation', { name: 'Map tools' });

    // Layers: a docked panel — the map narrows to make room, nothing floats over it.
    const layersBtn = tools.getByRole('button', { name: 'Layers' });
    await layersBtn.click();
    await expect(page.getByRole('region', { name: 'GIS Layers' })).toBeVisible();
    await expect(layersBtn).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(async () => (await map.boundingBox())!.width).toBeLessThan(full - 200);

    // Legend: only the layers that are switched on.
    await tools.getByRole('button', { name: 'Legend' }).click();
    const legend = page.getByRole('region', { name: 'Legend' });
    await expect(legend.getByText('Al Maha fields')).toBeVisible();
    await expect(legend.getByText('Drainage lines')).toHaveCount(0);

    // Basemaps: a radio list.
    await tools.getByRole('button', { name: 'Basemaps' }).click();
    const satellite = page.getByRole('radio', { name: 'Satellite' });
    await satellite.click();
    await expect(satellite).toHaveAttribute('aria-checked', 'true');

    // Esc closes the panel and the map takes the full width again.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Basemaps' })).toHaveCount(0);
    await expect.poll(async () => (await map.boundingBox())!.width).toBeGreaterThan(full - 2);

    await tools.getByRole('button', { name: 'Add data' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
