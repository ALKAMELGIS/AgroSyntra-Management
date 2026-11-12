// Exploratory sweep (observe → act → record, the ARTEMIS loop on the web):
// every page × phone / tablet / desktop × ar / en, then optionally clicks every safe button.
// Records page errors, crashes, horizontal overflow, controls with no name,
// touch targets under 32 px and text under 10.5 px on phones.
// Usage: BASE_URL=http://localhost:3000 [LIVE=1 SESSION_FILE=login.json] node e2e/tools/explore.js [--click] [--routes /a,/b]
// SESSION_FILE: the JSON body returned by POST /api/v1/auth/login.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : (process.env.BASE_URL || 'http://localhost:3000');
const CLICK = process.argv.includes('--click');
const onlyIdx = process.argv.indexOf('--routes');
const ONLY = onlyIdx > 0 ? process.argv[onlyIdx + 1].split(',') : null;
const SESSION = process.env.LIVE ? (() => { const d = JSON.parse(fs.readFileSync(process.env.SESSION_FILE, 'utf8')).data; return { user: d.user, accessToken: d.accessToken || d.tokens?.accessToken, refreshToken: d.refreshToken || d.tokens?.refreshToken, site: process.env.ACTIVE_SITE }; })() : null;
const VIEWS = (process.env.VIEWS || 'phone,tablet,desktop').split(',');
const LANGS = (process.env.LANGS || 'ar,en').split(',');
const VP = { phone: { width: 390, height: 844, isMobile: true, hasTouch: true }, tablet: { width: 820, height: 1180, hasTouch: true }, desktop: { width: 1440, height: 900 } };

const ROUTES = (ONLY || `/ /dashboard /summary /daily-brief /assistant /notifications /tasks /inventory /gis-map /gps-tracking /remote-sensing
/weather-log /weather-log/map /harvest/entry /harvest/dashboard /harvest/reports /fertigation/entry /fertigation/dashboard /fertigation/reports
/irrigation/entry /irrigation/dashboard /ecph-entry /ecph/reports /pump-room /fertigation-harvest /efficiency-dashboard /yield-predictions
/manpower-entry /manpower-record /manpower-cost /manpower-activity-sheet /shift-schedule
/ipm/biological-control /ipm/biological-control-record /ipm/bumble-bees /ipm/field-staff /ipm/pest-catalog /ipm/pesticide-applications
/ipm/phi-audit-log /ipm/product-catalog /ipm/scouting-reports /ipm/spray-calendar /team-leader/spray-calendar
/audit/batch-trace /audit/change-requests /audit/ipm-change-requests
/manage/countries /manage/farm-areas /manage/field-types /manage/recipes /manage/seasons /manage/valves
/admin/users /admin/organization /admin/api-keys /admin/api-integrations /admin/audit /admin/backup /admin/crop-history /admin/enrollment
/admin/feature-flags /admin/health /admin/import /admin/integrations/arcgis /admin/integrations/john-deere /admin/platform /admin/recovery /admin/webhooks
/agronomic-reference /report-builder /templates /templates/new /internship /internship/grades /internship/progress /internship/teacher
/hub/operations /hub/ipm /hub/field /hub/reports /hub/workforce /hub/settings /login /worker-login`.split(/\s+/)).filter(Boolean);

const SKIP_CLICK = /delete|remove|sign ?out|log ?out|حذف|إزالة|خروج|reset|restore|استعادة|revoke|disable|تعطيل|purge|wipe|print|طباعة|download|تنزيل|export|تصدير|csv|excel|pdf/i;

async function audit(p, view) {
  return p.evaluate((view) => {
    const vw = innerWidth;
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
    const desc = (el) => { const t = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40); return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(c => /^Mui[A-Z][a-zA-Z]+-root$/.test(c)).join('.') : ''}"${t}"`; };
    const out = { overflowX: document.documentElement.scrollWidth - vw, crash: /Something went wrong|حدث خطأ غير متوقع/.test(document.body.innerText), h1: document.querySelectorAll('h1').length };
    // elements sticking out of the viewport horizontally (not inside a horizontal scroller)
    const inScroller = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(s.overflowX) && a.scrollWidth > a.clientWidth + 1) return true; if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && a !== document.body && a !== document.documentElement) { const r = a.getBoundingClientRect(); if (r.right <= vw + 1 && r.left >= -1) return true; } } return false; };
    const out_of = [];
    document.querySelectorAll('main *').forEach((el) => { if (out_of.length > 4) return; const r = el.getBoundingClientRect(); if (r.width && (r.right > vw + 2 || r.left < -2) && vis(el) && !inScroller(el) && !el.closest('.leaflet-container')) out_of.push(desc(el) + ` [${Math.round(r.left)}..${Math.round(r.right)}]`); });
    out.offscreen = out_of;
    const ctrls = [...document.querySelectorAll('button, a[href], [role=button], input:not([type=hidden]), select, [role=tab], [role=combobox], [role=checkbox], [role=switch]')].filter(vis);
    out.unnamed = ctrls.filter((el) => { if (el.tagName === 'INPUT' && (el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.placeholder || el.title)) return false; if (/^(checkbox|radio)$/.test(el.type) ) return false; const n = (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText || el.innerText || el.getAttribute('title') || el.value || '').trim(); return !n && !el.closest('.leaflet-control-attribution'); }).slice(0, 6).map(desc);
    // Table rows (totals especially) whose column count differs from the header.
    const width = (tr) => [...tr.children].reduce((n, c) => n + (+c.getAttribute('colspan') || 1), 0);
    out.tableMismatch = [...document.querySelectorAll('table')].filter(vis).flatMap((t) => {
      const head = [...t.querySelectorAll('thead tr')].pop(); if (!head) return [];
      const hw = width(head);
      return [...t.querySelectorAll('tbody tr, tfoot tr')].filter((tr) => tr.children.length > 1 && width(tr) !== hw && !tr.querySelector('td[colspan="' + hw + '"]'))
        .slice(0, 2).map((tr) => `header ${hw} vs row ${width(tr)}: "${tr.innerText.replace(/\s+/g, ' ').slice(0, 40)}"`);
    }).slice(0, 4);
    if (view === 'phone') {
      out.small = ctrls.filter((el) => { if (el.closest('.leaflet-control-attribution, [role=grid] [role=row], table, .MuiPaginationItem-root, .MuiTablePagination-root, .MuiPickersLayout-root, .MuiBreadcrumbs-root')) return false; if (el.tagName === 'INPUT' && /^(checkbox|radio)$/.test(el.type)) return false; if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return false; const r = el.getBoundingClientRect(); return r.height < 32 || r.width < 32; }).slice(0, 6).map((el) => { const r = el.getBoundingClientRect(); return desc(el) + ` ${Math.round(r.width)}x${Math.round(r.height)}`; });
      out.tinyText = [...document.querySelectorAll('main *')].filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2) && vis(el) && parseFloat(getComputedStyle(el).fontSize) < 10.5).slice(0, 4).map((el) => desc(el) + ' ' + getComputedStyle(el).fontSize);
    }
    return out;
  }, view);
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW });
  const results = [];
  const jobs = [];
  for (const lang of LANGS) for (const view of VIEWS) for (const route of ROUTES) jobs.push({ lang, view, route });
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const { lang, view, route } = jobs[i++];
      const ctx = await b.newContext({ viewport: { width: VP[view].width, height: VP[view].height }, isMobile: !!VP[view].isMobile, hasTouch: !!VP[view].hasTouch });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 160)));
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|socket|net::|favicon|ERR_|404|401|500|503|websocket|manifest/i.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 160)); });
      await p.addInitScript(([L, sess]) => { try { localStorage.setItem('i18nextLng', L); if (sess && !sessionStorage.getItem('seeded')) { localStorage.setItem('almaha_user', JSON.stringify(sess.user)); localStorage.setItem('almaha_access_token', sess.accessToken); localStorage.setItem('almaha_refresh_token', sess.refreshToken); if (sess.site) localStorage.setItem('almaha_active_site', sess.site); sessionStorage.setItem('seeded', '1'); } } catch {} }, [lang, SESSION]);
      try {
        await p.goto(BASE + route, { waitUntil: 'load', timeout: 30000 });
        await p.waitForTimeout(1800);
        const a = await audit(p, view);
        let clicks = 0; const clickErrs = [];
        if (CLICK) {
          const n = await p.locator('main button:visible, main [role=tab]:visible').count();
          for (let k = 0; k < Math.min(n, 40); k++) {
            const el = p.locator('main button:visible, main [role=tab]:visible').nth(k);
            let name = ''; try { name = ((await el.getAttribute('aria-label', { timeout: 500 })) || (await el.innerText({ timeout: 500 })) || '').trim(); } catch { continue; }
            if (SKIP_CLICK.test(name) || (await el.isDisabled().catch(() => true))) continue;
            const before = errs.length;
            try { await el.click({ timeout: 1500 }); clicks++; } catch { continue; }
            await p.waitForTimeout(350);
            const crash = await p.evaluate(() => /Something went wrong|حدث خطأ غير متوقع/.test(document.body.innerText));
            if (errs.length > before || crash) clickErrs.push(`click "${name.slice(0, 30)}" → ${crash ? 'CRASH ' : ''}${errs.slice(before).join(' | ').slice(0, 200)}`);
            await p.keyboard.press('Escape').catch(() => {});
            if (!p.url().endsWith(route)) { await p.goto(BASE + route).catch(() => {}); await p.waitForTimeout(1200); }
            if (crash) { await p.goto(BASE + route).catch(() => {}); await p.waitForTimeout(1200); }
          }
        }
        if (a.crash) a.crashText = await p.evaluate(() => document.querySelector('main')?.innerText.slice(0, 200));
        results.push({ lang, view, route, ...a, errs: [...new Set(errs)].slice(0, 5), clicks, clickErrs });
      } catch (e) { results.push({ lang, view, route, fatal: e.message.slice(0, 160) }); }
      await ctx.close();
      process.stdout.write('.');
    }
  };
  await Promise.all(Array.from({ length: +(process.env.W || 6) }, worker));
  await b.close();
  const out = process.env.OUT || 'test-results/explore.json';
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  // summary
  const bad = results.filter((r) => r.tableMismatch?.length || r.fatal || r.crash || r.overflowX > 1 || r.errs?.length || r.offscreen?.length || r.unnamed?.length || r.small?.length || r.tinyText?.length || r.clickErrs?.length || r.h1 === 0);
  console.log(`\n${results.length} runs, ${bad.length} with findings → ${out}`);
})();
