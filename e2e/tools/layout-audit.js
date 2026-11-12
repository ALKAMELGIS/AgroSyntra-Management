// Layout audit: every page × 7 screen sizes. Measures what the UI review asks for:
//  - tables: clipped (wider than their box with no horizontal scroll), header not
//    sticky while the body scrolls, empty header columns, header text wrapping
//  - nested vertical scrollbars (a scroll box inside another scroll box)
//  - horizontal page overflow, content hidden under fixed bars
//  - wasted width (content column much narrower than the window on big screens)
// Usage: BASE_URL=http://localhost:3055/index.html# node e2e/tools/layout-audit.js [--routes /a,/b]
//   live API: LIVE=1 SESSION_FILE=login.json ACTIVE_SITE=<uuid> BASE_URL=http://localhost:3000
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://localhost:3055/index.html#';
const onlyIdx = process.argv.indexOf('--routes');
const VIEWS = {
  'large 1920': { width: 1920, height: 1080 },
  'desktop 1440': { width: 1440, height: 900 },
  'laptop 1280': { width: 1280, height: 720 },
  'tablet-l 1180': { width: 1180, height: 820, hasTouch: true },
  'tablet-p 820': { width: 820, height: 1180, hasTouch: true },
  'phone-l 844': { width: 844, height: 390, isMobile: true, hasTouch: true },
  'phone-p 390': { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const pickViews = process.env.VIEWS ? process.env.VIEWS.split(',') : Object.keys(VIEWS);
const LANG = process.env.LANG2 || 'en';
const SESSION = process.env.LIVE ? (() => { const d = JSON.parse(fs.readFileSync(process.env.SESSION_FILE, 'utf8')).data; return { user: d.user, accessToken: d.accessToken, refreshToken: d.refreshToken, site: process.env.ACTIVE_SITE }; })() : null;

const ROUTES = onlyIdx > 0 ? process.argv[onlyIdx + 1].split(',') : `/ /dashboard /summary /daily-brief /assistant /notifications /tasks /inventory /gis-map /gps-tracking /remote-sensing
/weather-log /weather-log/map /harvest/entry /harvest/dashboard /harvest/reports /fertigation/entry /fertigation/dashboard /fertigation/reports
/irrigation/entry /irrigation/dashboard /ecph-entry /ecph/reports /pump-room /fertigation-harvest /efficiency-dashboard /yield-predictions
/manpower-record /manpower-cost /manpower-activity-sheet /shift-schedule
/ipm/biological-control /ipm/biological-control-record /ipm/bumble-bees /ipm/field-staff /ipm/pest-catalog /ipm/pesticide-applications
/ipm/phi-audit-log /ipm/product-catalog /ipm/scouting-reports /ipm/spray-calendar
/audit/batch-trace /audit/change-requests /audit/ipm-change-requests
/manage/countries /manage/farm-areas /manage/field-types /manage/recipes /manage/seasons /manage/valves
/admin/users /admin/organization /admin/api-keys /admin/api-integrations /admin/audit /admin/backup /admin/crop-history /admin/enrollment
/admin/feature-flags /admin/health /admin/import /admin/integrations/john-deere /admin/platform /admin/recovery /admin/webhooks
/agronomic-reference /report-builder /templates /templates/new /internship /hub/operations /hub/ipm /hub/reports /hub/workforce`.split(/\s+/).filter(Boolean);

function measure() {
  const vw = innerWidth; const vh = innerHeight;
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const scrollsY = (el) => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2; };
  const scrollsX = (el) => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowX); };
  const name = (el) => (el.closest('[aria-label]')?.getAttribute('aria-label') || el.closest('section,[role=region]')?.querySelector('h1,h2,h3')?.innerText || el.className?.toString().split(' ').find((c) => /^Mui[A-Z]/.test(c)) || el.tagName).slice(0, 40);
  const out = { overflowX: document.documentElement.scrollWidth - vw, tables: [], nested: [], emptyHead: [], wrapHead: 0, clipped: [], used: 0 };
  const main = document.querySelector('main') || document.body;
  // width actually used by content on big screens
  const mr = main.getBoundingClientRect();
  let maxRight = 0; let minLeft = vw;
  main.querySelectorAll(':scope > * , :scope > * > *').forEach((c) => { if (!vis(c)) return; const r = c.getBoundingClientRect(); maxRight = Math.max(maxRight, r.right); minLeft = Math.min(minLeft, r.left); });
  out.used = Math.round(((maxRight - minLeft) / Math.max(1, mr.width)) * 100);
  for (const t of document.querySelectorAll('table')) {
    if (!vis(t) || t.closest('.leaflet-container')) continue;
    const box = t.parentElement;
    let scroller = null;
    for (let a = t.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) || /(auto|scroll)/.test(s.overflowY)) { scroller = a; break; } }
    const tr = t.getBoundingClientRect();
    const sr = (scroller || main).getBoundingClientRect();
    const head = t.querySelector('thead');
    const info = { name: name(t), w: Math.round(tr.width), boxW: Math.round(sr.width), rows: t.querySelectorAll('tbody tr').length };
    if (scroller) {
      const sx = getComputedStyle(scroller).overflowX;
      if (tr.width > sr.width + 2 && !/(auto|scroll)/.test(sx)) info.clipped = true;
      info.vScroll = scrollsY(scroller);
      if (info.vScroll && head) {
        const hs = getComputedStyle(head); const th = head.querySelector('th'); const ths = th && getComputedStyle(th);
        info.sticky = hs.position === 'sticky' || (ths && ths.position === 'sticky');
      }
      info.hScroll = scroller.scrollWidth > scroller.clientWidth + 2 && scrollsX(scroller);
    } else if (tr.right > vw + 2) info.clipped = true;
    if (!scroller && tr.height > vh && head) info.longNoBox = true;
    if (head) {
      const ths = [...head.querySelectorAll('th')].filter(vis);
      const empty = ths.filter((h) => !h.innerText.trim() && !h.querySelector('input,button,svg') && h.getBoundingClientRect().width > 44);
      if (empty.length) out.emptyHead.push(`${info.name}: ${empty.length} empty header cell(s), ${empty.map((h) => Math.round(h.getBoundingClientRect().width)).join('/')}px`);
      out.wrapHead += ths.filter((h) => { const lh = parseFloat(getComputedStyle(h).lineHeight) || 16; return h.innerText.trim() && h.scrollHeight > lh * 2.6 && h.getBoundingClientRect().height > 50; }).length;
    }
    out.tables.push(info);
  }
  // nested vertical scroll areas (scroll box inside scroll box), ignoring the app's main region
  const scrollers = [...document.querySelectorAll('body *')].filter((el) => vis(el) && scrollsY(el) && el.clientHeight > 80 && !el.closest('.leaflet-container,[role=listbox],.MuiAutocomplete-popper'));
  for (const s of scrollers) { const outer = scrollers.find((o) => o !== s && o.contains(s) && o.tagName !== 'MAIN' && !o.matches('[data-app-scroll], main')); if (outer && !outer.contains(document.querySelector('nav[aria-label="Main"]'))) out.nested.push(`${name(s)} inside ${name(outer)}`); }
  out.nested = [...new Set(out.nested)].slice(0, 4);
  // text cut off with no ellipsis inside buttons / chips / headers
  for (const el of document.querySelectorAll('main button, main .MuiChip-label, main th, main .MuiTab-root')) {
    if (!vis(el)) continue; const s = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 3 && s.textOverflow !== 'ellipsis' && /hidden|clip/.test(s.overflowX) && el.innerText.trim()) out.clipped.push(`${el.tagName.toLowerCase()} "${el.innerText.trim().slice(0, 30)}"`);
  }
  out.clipped = out.clipped.slice(0, 5);
  // where the data starts (first table / grid / list), as % of the screen height
  const firstData = [...document.querySelectorAll('main table, main [role=grid], main .MuiList-root, main .recharts-wrapper')].find(vis);
  if (firstData) out.dataTopPct = Math.round((firstData.getBoundingClientRect().top / vh) * 100);
  return out;
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW });
  const jobs = []; for (const v of pickViews) for (const r of ROUTES) jobs.push([v, r]);
  const res = []; let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const [v, route] = jobs[i++];
      const ctx = await b.newContext({ viewport: { width: VIEWS[v].width, height: VIEWS[v].height }, isMobile: !!VIEWS[v].isMobile, hasTouch: !!VIEWS[v].hasTouch });
      const p = await ctx.newPage();
      await p.addInitScript(([L, s]) => { try { localStorage.setItem('i18nextLng', L); if (s && !sessionStorage.getItem('seeded')) { localStorage.setItem('almaha_user', JSON.stringify(s.user)); localStorage.setItem('almaha_access_token', s.accessToken); localStorage.setItem('almaha_refresh_token', s.refreshToken); if (s.site) localStorage.setItem('almaha_active_site', s.site); sessionStorage.setItem('seeded', '1'); } } catch {} }, [LANG, SESSION]);
      try { await p.goto(BASE + route, { waitUntil: 'load', timeout: 30000 }); await p.waitForTimeout(2200); res.push({ v, route, ...(await p.evaluate(measure)) }); } catch (e) { res.push({ v, route, fatal: e.message.slice(0, 120) }); }
      await ctx.close(); process.stdout.write('.');
    }
  };
  await Promise.all(Array.from({ length: +(process.env.W || 6) }, worker));
  await b.close();
  const out = process.env.OUT || 'test-results/layout-audit.json';
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  const n = (f) => res.filter(f).length;
  console.log(`\n${res.length} page views → ${out}`);
  console.log(`horizontal page overflow: ${n((r) => r.overflowX > 1)}`);
  console.log(`tables clipped: ${n((r) => r.tables?.some((t) => t.clipped))} · long tables with no scroll box: ${n((r) => r.tables?.some((t) => t.longNoBox))} · scrolling tables w/o sticky header: ${n((r) => r.tables?.some((t) => t.vScroll && !t.sticky))}`);
  console.log(`phone: data starts below 60% of the screen: ${n((r) => /phone/.test(r.v) && r.dataTopPct > 60)}`);
  console.log(`empty header columns: ${n((r) => r.emptyHead?.length)} · nested scrollbars: ${n((r) => r.nested?.length)} · clipped labels: ${n((r) => r.clipped?.length)}`);
})();
