# Design refresh — November 2026

All features, routes, roles and data flows are unchanged. Visual / UX changes only.

## Fixed
- **Broken responsive grids (50 files):** pages used the MUI v5 `<Grid item xs md>` API, which MUI v7 ignores, so cards and form columns sized to their content instead of the grid. All converted to `size={{…}}`.
- **Dark mode:** `App.css` forced light colours with `!important` on the app bar, sidebar, cards and inputs. Now everything follows the theme; the "System" theme follows OS changes live; browser chrome colour follows the mode.
- **Arabic / RTL crash:** prevented a crash of every text field in Arabic.
- **Clipped headers on phones:** page headers with action buttons (Templates, Harvest dashboard, Efficiency, Users, …) now wrap instead of pushing buttons off-screen.
- Unified colours: mixed blue / navy / green Excel-import headers, indigo accents and old greens all mapped to the brand tokens.
- Double padding in Manpower pages; GIS map full-bleed now matches the new gutter.

## New
- Unified design system (`src/theme.js`, see `DESIGN_SYSTEM.md`).
- Redesigned app shell: translucent blurred top bar, pill search, account menu, calmer sidebar with an active indicator, workspace tabs.
- Redesigned Home / area hubs, dashboard section cards, KPI cards, Daily Brief sections, and Login.
- Inter + IBM Plex Sans Arabic, loaded once with preconnect (removed the render-blocking CSS `@import`).
- Respect for `prefers-reduced-motion`; visible keyboard focus rings; 44px menu items on phones.

## Round 2
- Removed the background moon completely (component, app shell, login and auth pages).
- Icon family unified: 138 files switched to Material *Outlined* icons (semantic pairs such as star/checkbox left untouched).
- Language switcher: inline English | العربية segmented control in the account menu (no emoji flags, clear label).
- Tabs now scroll with arrows instead of being clipped on narrow screens (theme default).
- Select fields with an empty option no longer overlap their label (Organization Settings).
- Tasks board shows 3 columns from tablet width; sidebar site selector matches the season selector.

## Round 3 — built for daily staff use
- **Breadcrumb trail on every page** (Home › Area › Section › Page) generated from the navigation config (`src/config/pageMeta.js`, `components/PageContextBar.js`). Area links back to its module hub.
- **Phone bottom navigation** (Home · Modules · Search · Alerts · Menu) for one-thumb use in the field; snackbars and pinned bars are lifted above it.
- **"Continue where you left off"** on Home: the last 6 opened pages for this browser, filtered by the user's current role.
- **Fixed scroll-region heights**: pages never knew the area-tabs row was visible, so spreadsheets/maps overflowed by 44px. The shell now shares this via `AppChromeContext`; the GIS map fits the screen exactly.
- Page titles normalized to the theme weights (removed ad-hoc 700/800 weights and oversize h4 overrides in 50 pages).

## Round 4 — automated UI quality gate (Playwright + axe-core)
New suite `e2e/ui-quality.spec.ts` (`npm run test:ui-quality`, backend mocked):
50 screens × phone/tablet/desktop + Arabic/RTL + dark-mode contrast + usability flows — **172 tests, all passing on the production build.**
It fails on uncaught errors, sideways scrolling, serious/critical WCAG 2.2 AA issues, unnamed or too-small shell controls.

Fixed through it:
- **Search button never opened the command palette** (header and phone bar dispatched the shortcut on `document`, the palette listens on `window`).
- Notification bell, ~110 icon-only buttons and ~75 dropdowns had no accessible name (screen readers announced "button"/nothing).
- Scrollable tables were not reachable by keyboard (now focusable regions).
- Loading spinners/progress bars unnamed; disabled labels/helper text and sidebar section titles below 4.5:1 contrast; `text.disabled` darkened.
- Spray-calendar status colours (white on light blue/orange) failed contrast → darker equivalents.
- Pump Room banner reference code was grey-on-green (theme caption colour overrode white).
- GIS "Layers" button hidden under the zoom control; Remote Sensing map toolbar overlapped on phones; map toggles below 24px.
- Unlabelled inputs (Irrigation year, imagery date, Sentinel overlay switch, entry date-range select).

`playwright.config.ts` honours `PW_CHROMIUM_PATH` to reuse a pre-installed Chromium.

## Round 5 — dark mode everywhere + faster first load
- Quality gate extended: dark-mode contrast and Arabic/RTL (phone) on **all** screens — **265 Playwright tests, all passing** on the production build.
- **Initial JavaScript cut from 517 KB to 311 KB (gzip, −40%)**: Leaflet (+CSS) now loads with the map pages, `xlsx` only when someone exports, Sentry only when a DSN is configured.
- Excel-style entry sheets (Harvest, Irrigation) render as a light "paper" surface in dark mode (`components/SheetSurface.js`) instead of light-on-light text.
- Replaced non-existent palette shades (`primary.50`, `grey.100`, …) that rendered transparent or stayed light in dark mode (≈25 places); quiz review keeps its correct/incorrect tint.
- Dashboard tabs, spray-calendar "Clear" chip and shift-schedule day headers fixed for dark mode.

## Round 6 — real dark mode for entry sheets, empty states
- Removed the white "paper" island: every Excel-style sheet (SpreadsheetGrid, Harvest, Irrigation, RC-108, fertigation & PPP pivots) now draws with `--sheet-*` colour tokens (defined per mode in `theme.js`), so cells, gridlines, tints and selection all follow dark mode (110 hard-coded colours converted).
- Unified empty state for every table that has no rows (≈60 tables, pure CSS in `App.css`): icon, centred calm message; left-aligned on phones so it stays visible in wide tables. User Management now shows one too.
- Dark map background before tiles load.
- New gate test: **no light panels in dark mode** on any screen (any light surface over 6% of the screen fails).
- Quality gate now **313 Playwright tests — all passing** on the production build; 666 unit tests passing.

## Round 7 — checked with real-looking data
- Gate now also runs every screen **with populated data** (tables, cards, lists) in light and dark → **407 Playwright tests, all passing**; 666 unit tests passing.
- **Inventory and Scouting Reports tables were broken**: each row was wrapped in a nested `<tbody>` inside the table body, so columns did not line up with the header. Rows now render in place.
- Row expand/collapse toggles, Users actions (activate/deactivate behind disabled-state tooltips) and visibility toggles now have proper names; tooltips over disabled buttons describe instead of mislabel.
- Notifications list fixed to valid list markup; timestamps readable on unread rows.
- Amber status chips (Draft, Warning %) and filled alerts darkened to meet 4.5:1; GIS "fields lost polygon" banner's Review button now visible and the banner no longer covers the zoom control.
- Executive report ranking badges follow dark mode.

## Round 8 — phone data checks and add/create forms
- Every screen checked with populated data on phone (390 px) too; executive-report KPI cards rebuilt (accent dot, readable value in both modes, theme borders) and old light borders (`#e2e8f0`) replaced across dashboards.
- New gate: the main **Add / New / Create** forms (crop rotation, equipment, inventory, pest, product, recipe, shift, task, crop, GIS layer) open, fit the screen on phone and desktop, and pass accessibility checks.
- Product-catalog and other dialogs: 3–4 fields per row on phones → one or two per row (`size={{ xs: 12, sm: 4 }}`).
- Recipe fertiliser grid inputs (64) now have names.

## Round 9 — Arabic for staff
- **Whole app shell in Arabic** (`src/i18n/shellLabels.js`): area tabs, sidebar sections and pages, hubs and greeting, breadcrumbs, phone bar, search, account menu, command palette (search works with Arabic or English names), roles.
- **Login page translated** and gets an English/العربية switch before sign-in.
- Gate: **475 Playwright tests, all passing** on the production build; 666 unit tests passing.

## Round 10 — one font everywhere
- Removed every other font from the UI: the Excel-style sheets (Harvest, Irrigation, fertigation/PPP pivots, manpower pivots, entry sheet styles) used Calibri/Segoe UI, work orders and print views used Arial/system fonts, and 17 code/ID fields used the browser's default monospace. All now use the app font (Inter + IBM Plex Sans Arabic) via `var(--font-sans)`, and codes use `var(--font-mono)` (JetBrains Mono).
- Native buttons/inputs/selects inherit the page font.
- Excel *exports* keep Calibri on purpose (the font Excel users expect in the file).
- New gate test: **every visible text on every screen uses Inter / IBM Plex Sans Arabic / JetBrains Mono**.
- Gate: **523 Playwright tests, all passing** on the production build; 666 unit tests passing.

## Round 11 — compact info notes
- New `components/InfoNote.js`: long explanatory banners ("View only — …", "Data entry workers fill the Daily Activity Sheet…", import hints, etc.) now take **one slim line** with a small icon; when the text does not fit, a **More / المزيد** toggle expands it in place (keyboard and screen-reader friendly, `aria-expanded`).
- Applied in 66 files (all "View only" banners via `ReadOnlyBanner`, page help texts, importer hints). Warnings, errors and banners with actions (e.g. draft Restore/Discard) stay full alerts on purpose.
- Gate: **524 Playwright tests, all passing** (new test: long notes stay one line and expand on demand); 666 unit tests passing.

## Round 12 — help texts become an ⓘ icon
- `InfoNote` now defaults to **icon-only**: long help/explanation texts and every **View only** banner show just a small icon (ⓘ, or 👁 for view-only); tapping/clicking it (or Enter/Space) opens the text in a small popup; Esc or clicking outside closes it. Accessible names "Information"/"معلومات" and "View only"/"للعرض فقط".
- Status messages that must be seen at a glance stay visible as one slim line (`<InfoNote mode="line">`): empty states ("No fields in this farm area"), import results ("12 of 15 columns mapped", "3 rows skipped"), "select a site first", warnings like "Entry exists — saving will update it", and notes inside confirm dialogs.
- 40 notes became icons, 95 stay as one line.
- Gate: **524 Playwright tests passing** (help-note test updated: text hidden until the icon is clicked); 666 unit tests passing.

## Round 13 — page structure & navigation (UI UX Pro Max: navigation / accessibility)
- **Browser tab names the page**: "Scouting Reports — Elite Agro Cloud" (Arabic when the app is in Arabic) instead of the same title on every tab — staff with several tabs open can tell them apart.
- **Exactly one page heading (h1) on every screen**: pages without a visible title get a screen-reader-only heading from the navigation config.
- **"Skip to content" link** (first Tab press) jumps keyboard users past the top bar and sidebar.
- **Page changes are announced** to screen readers (polite live region).
- Gate: every screen also checked for one h1, a descriptive document title, a main landmark and a bypass mechanism → **525 Playwright tests, all passing**; 666 unit tests passing.

## Round 14 — feedback toasts (UI UX Pro Max: feedback)
- **Bug fixed in the global notification system** (used by ~80 screens): when two messages fired together (e.g. an error then "Saved"), one could replace the other, because the queue updated state from inside another state update with a stale "open" flag. Messages are now queued strictly in order; duplicate messages already waiting are collapsed. Covered by a new unit test.
- **Readable timing**: success 4 s, info 5 s, warning 7 s, error 9 s; the timer pauses while hovered or focused; every toast has a close button.
- **New toast look**: light surface card with a tinted status icon, calm in both light and dark mode (instead of solid red/green/amber blocks).
- **Placement**: bottom inline-end corner (mirrors in Arabic), full width above the phone navigation bar on phones.
- Errors are announced assertively, others politely, to screen readers.
- Gate: **526 Playwright tests, all passing** (new: toast appears above the phone bar and closes); **667 unit tests** passing.

## Round 15 — page content in Arabic for staff
- Until now only the app shell (menus, breadcrumb, phone bar) switched to Arabic; page content (buttons, column headers, field labels, filters, status chips, empty states, report KPIs, toast messages) stayed English.
- New `i18n/pageLabels.js`: about 800 Arabic interface strings plus patterns for counted and sentence text ("12 rows", "Field saved successfully!", "Failed to load fields", report interpretation lines).
- New `i18n/autoTranslate.js`: in Arabic, exact known interface strings are replaced on screen (text, placeholders, aria-labels, tooltips) as pages render; switching back to English restores every original string. Names, numbers and anything staff typed are never translated; inputs, code and `data-no-translate` areas are skipped.
- Sweep across all 50 routes in Arabic: English interface strings dropped from **448 to ~100**; what remains is data (field/user names, dates, codes), units, and a few long help paragraphs.
- Bugs found by the sweep and fixed: Product Catalog showed "undefinedd" / "undefined days" when a product had no PHI (now "-"); Inventory showed "NaN" for missing stock, cost and minimum values (now "—"); the Inventory stock chip said "OK" (now "In Stock" / "متوفر"), and item counts were split into two text parts.
- Gate: **523 Playwright tests, all passing**, including a new test that switches to Arabic on a data-entry screen, checks the labels, then switches back and checks English is restored. Unit tests: 7 new for the translator (**674 total, all passing**).

## Round 16 — using the empty space
- **One page width for the whole app.** Pages were capped at six different widths (800–1600 px, MUI `md`/`lg`/`xl`), so on large screens reports such as Fertigation / EC-pH Reports, Organization Settings, API Keys, Webhooks or Zones & Sites used about half the screen. Data and report pages now fill the content area up to `PAGE_MAX_WIDTH` (1760 px, in `theme.js`); reading pages (notifications, training lessons, backup form) keep a narrower width on purpose. Containers no longer add side padding on top of the main area's own padding.
- **Tables fit more columns.** Column titles now wrap onto a second line instead of forcing a wide column (both the spreadsheet-style tables and regular tables). The Product Catalog shows 10 columns on a 1440 px screen instead of 7; empty, checkbox, row-number and frozen columns keep their sizes.
- **Daily Brief** rebuilt for the space: the five "at a glance" numbers are large tappable tiles in one row (tinted and clickable when non-zero), and the sections sit in a two-column grid on desktop instead of a long single column. The weather card shows its "no data" note instead of an empty box.
- **Harvest Dashboard**: the chart and its three-column table sit side by side on wide screens (table scrolls with a sticky header), stacked on tablets and phones.
- Gate: **523 Playwright tests, all passing** on every screen at phone / tablet / desktop (no overflow, accessibility, Arabic, dark mode); **674 unit tests** passing.

## Round 17 — Arabic font: IBM Plex Sans Arabic
- In Arabic, **IBM Plex Sans Arabic now leads for every text on screen** — Arabic words, numbers, dates and Latin words such as "EC/pH" or "API" — so a mixed line uses one typeface. Before, Inter led and Arabic only fell back to Plex, so numbers and Latin words inside Arabic lines appeared in a different font.
- How: `FONT_SANS_AR` in `theme.js` (theme typography in RTL) and `--font-sans` switched on `html[lang="ar"]`, so every component that reads the variable (entry sheets, pivot tables, maps, native inputs) follows. English is unchanged (Inter).
- All four weights used (400 / 500 / 600 / 700) are loaded; a test checks they are available.
- Gate: the font check now runs on every screen in **both languages** — English must be Inter, Arabic must be IBM Plex Sans Arabic (JetBrains Mono only for codes).
- Gate: **572 Playwright tests, all passing** (49 new font checks); **674 unit tests** passing.

## Round 18 — review fixes (everything except dates)
- **Sidebar**: long names (common in Arabic, e.g. «سجل تدقيق فترة ما قبل الحصاد») wrap to a second line instead of being cut off with "…".
- **One page title on every screen** — new `components/PageTitle.js`: a real `<h1>`, 1.375 rem on phones / 1.625 rem from tablets, semibold, **no decorative icon**. Applied to 60+ pages that used five different sizes (19–34 px), icons on some titles only, and seven different left offsets because some pages added their own padding inside the already-padded main area (removed). Spreadsheet entry screens (Harvest / Irrigation entry, Biological Control) keep the breadcrumb as their visible title so the sheet keeps its full height.
- **Charts**: default Recharts purple and Material blue/orange replaced by the app palette; white slice/tile separators and the white "lower bound" band now use the card surface colour (no white blocks in dark mode); radar/polar grid and axis lines themed. PHI Audit Log severity colours follow the theme.
- **Arabic**: weather help paragraphs, the Remote Sensing empty-state sentence, count labels and units (م³ / كجم / طن / هكتار) translated. Staff data is now protected: inside table bodies only buttons, status chips, empty-state rows and a short list of status words are translated — names typed by staff always stay as typed.
- **Required fields** (all forms): one marking method — the `required` setting (25 labels used a typed " *" or "(required)" and were converted); the asterisk is in the error colour; a required field left empty is outlined in red with a "Required / هذا الحقل مطلوب" note; when a save is refused for missing fields, every empty required field in that dialog is marked and focus jumps to the first one. Done once in CSS + `utils/requiredFields.js`, so every form gets it.
- **Robustness bugs found by testing with empty / partial data** (each one blanked or froze a whole screen):
  - Summary & Contents crashed when the saved content lacked a list → falls back to defaults.
  - System Health crashed when a check (database / Redis) was missing → shows "Unhealthy" / "—".
  - PHI Audit Log crashed on a row without severity → shows "—".
  - Pesticide Applications, Scouting Reports and other season-based screens **loaded forever** when the organisation had no sites yet (or the site list failed): the site context waited for at least one site. It now finishes once the site list has loaded, and the pages show their "select / add a site" state.
- Screens that now load for the first time in tests exposed three more issues, fixed: the orange text colour `#e65100` (3.45:1, below the 4.5:1 minimum) → `#a84b07` (5.7:1) in 12 files; 25 row / select-all checkboxes had no accessible name → "Select row" / "Select all rows" (تحديد الصف / تحديد كل الصفوف); a plain `monospace` font on Summary → JetBrains Mono.
- The screen-reader fallback heading now watches the page continuously, so a page whose own title appears after its data loads never ends up with two h1 headings.
- Pesticide Applications (which now loads in tests) had ~35 untranslated labels — tabs, filters, columns, dialog fields — now in Arabic.
- Gate: Summary and System Health are no longer exempt — every screen must render without errors with empty and with sample data. New tests: required-field feedback, table data not translated, units, empty-site loading.
- Totals: **589 Playwright tests, all passing** (phone / tablet / desktop, Arabic, dark mode, accessibility, fonts, forms); **677 unit tests** passing.

## Round 19 — clean & compact, no overlaps, faster
- **One frame per group.** An audit of every screen found 50 nested frames on 12 screens (a page-wide card around the whole page, a section card inside it, and a framed table or small cards inside that). Removed:
  - the legacy page-wide wrapper card (`Paper elevation={3}` with 32 px padding) on 18 pages — reports, management pages, entry pages, notifications, report builder, audit log, weather;
  - User Management: card › padding › framed table → one card with the table edge to edge;
  - a framed table inside a card or panel now uses that card as its only frame (CSS rule in App.css; dialogs keep framed tables).
  Remaining: the field tiles inside the Farm Monitor card (a group of items, by design).
- **Spacing.** No frame on any screen has more than 24 px padding (was up to 32 px). Home / hub section gaps 36–40 → 24 px; hub tiles more compact (min height 124 → 108 px).
- **No overlapping elements.** New overlap check (controls, labels, text) runs on every screen at phone, tablet and desktop, with and without data. It found and fixed:
  - the screen-reader page heading was meant to be 1 × 1 px but `sx={{ width: 1 }}` means 100 %, so an invisible page-sized box lay over the content on 7 screens;
  - Remote Sensing: the "Start / End" date labels overlapped the "Time-Series Analysis" heading;
  - GPS Tracking (phone): the date field's label overlapped the page title when the header wrapped.
- **Faster.**
  - The side menu was built twice on every device (phone drawer + desktop panel, one hidden by CSS); now only the one for the screen is built, and the phone drawer builds when opened.
  - The Arabic page wording (~100 KB) loads only when Arabic is switched on; main bundle 337 → 320 KB gzipped.
  - "Today in Dubai" built a new date formatter on every call (11 call sites, every render); the formatter is now created once.
  - Result on a mid-range phone simulation (4× slower CPU, 4G): main-thread blocking during start-up ≈ 2.3 s → 1.5–1.65 s (English), page ready ≈ 350 ms sooner.
- **Phones: compact tables.** Table rows stay one line high and the table scrolls sideways inside its card (names used to wrap and action icons stacked, making rows ~100 px tall).
- Inventory: the category tabs, the search box and the pagination each had their own frame → plain rows above / below the one table frame; the search fills the width on phones.
- Report top-lists showed "undefined" for an item without a name → "Unnamed / بدون اسم"; the list divider was a fixed light colour (now follows dark mode).
- Gate: **589 Playwright tests, all passing** — now including the overlap check on every screen at phone / tablet / desktop with and without data; **677 unit tests** passing.

## Round 20 — full UI/UX audit: one design scale, map-first GIS screens
Audit of all 50 screens at 390 / 820 / 1280 / 1920 px (buttons, icons, type, radii, clipped text, duplicate controls), then fixes, then the same audit again:

| | Before | After |
|---|---|---|
| Button heights | 32 / 38 / 39 / 47 px | **32 / 40 / 48** (small / medium / large) |
| Icon-button sizes | 28 / 30 / 36 / 40 px | **32 / 40 / 48** (field arrows 28 by design) |
| Icon sizes | 10 values (14–24, incl. 17 / 19 / 21 / 22) | **16 / 18 / 20 / 24** |
| Font sizes | 23 values (9.6, 11.2, 11.5, 13.5, 14.4, 16.8 …) | **one scale: 11 · 12 · 13 · 14 · 15 · 16 · 18 · 20 · 22 · 24 · 26 · 30** |
| Card / panel radii | 0 / 8 / 12 / 16 / 20 / 32 px | **10 fields · 12 tiles · 16 cards · 20 dialogs** (0 for map panes) |
| Duplicate control names | per-layer GIS actions, scouting "Show details" | each names its layer / report |
| Clipped text | none found | none |

- Theme: button sizes with matching icon sizes (16 / 18 / 20), icon-button scale (32 / 40 / 48 with 18 / 20 / 24 icons), SvgIcon scale (18 / 20 / 24), toggle buttons 32 px, h5 19 → 18 px, body2 13.5 → 13 px; Autocomplete arrow / clear buttons kept small inside fields.
- 261 hand-written font sizes in 50 files mapped to the scale; on-screen text below 11 px raised to 11 px (charts, pivot headers, farm monitor). Print documents (PDF export, RC-231 work-order form) keep their print sizes.
- Radii: page and card radii normalised in 14 components (hub tiles 32 → 16, report panels 32 → 16, sidebar fields 20 → 10, toasts 24 → 12 …). Note: in `sx`, `borderRadius: 2` = 16 px (× 8).
- GIS layer list: every action names its layer ("Style Al Maha fields", "Delete layer …", "Hide layer …" with pressed state); scouting cards: "Show details: GH-01, 2026-11-03" with expanded state.

**Map screens (GIS Map, Remote Sensing, GPS Tracking, Weather Map)** — the map is the main workspace:
- New `hooks/useFillHeight`: a map fills the screen from where it starts to the bottom (above the phone nav bar, min 360 px) instead of fixed 500 px / 70vh / 75vh boxes; re-measures when banners above it appear.
  - GPS Tracking map: 500 px fixed → 819 px (tablet) / 797 px (1920 × 1080); no page scroll.
  - Remote Sensing: title, layer selector and actions on one row (the helper sentence moved behind an ⓘ), map starts 80 px higher; the analysis panel opens beside the map on desktop, closed on phones / tablets; no page scroll (was 900 px on phones).
  - GIS Map layers panel 360 → 300 px on laptops (340 on large monitors): map share on 1280 px 58 % → 64 %.
- No map control covers another: legends sit above the map credits; on phones the Remote Sensing legend moves to the top right (clear of the base-map buttons), the GIS legend steps aside while a feature's details are open, and the feature panel is full width.
- GPS equipment cards: brand colours instead of Material blue / fixed light grey (dark mode), and keyboard-operable (Enter / Space, focus ring).
- New permanent tests: 12 map checks (3 screens × 360 / 820 / 1280 / 1920 px) — map visible and filling the height, no page scroll past it, legends / controls / panels never overlap.
- Gate: **601 Playwright tests, all passing** (incl. 12 new map-screen checks and the overlap check on every screen); **677 unit tests** passing.

## Round 21 — map takes the whole workspace: docked tool bar + panel, legend, basemaps
- New `components/map/MapPanel.js` → **MapWorkspace**, used by **GIS Map** and **GPS Tracking**:

      [ tool bar | docked panel (opens / closes, pushes the map) | map ]

  - **Tool bar** (48 px, on the start edge): GIS Map → **Layers** (count) · **Legend** (count of visible layers) · **Basemaps** · **+ Add data**; GPS Tracking → **Equipment** (count) · **Basemaps** · **+ Add equipment**. Tooltips, accessible names, pressed / expanded state, a thin bar marks the open tool.
  - **Docked panel** — part of the layout, not a floating card: opening it narrows the map, closing it (button, the same icon, or Esc) gives the full width back; Leaflet re-measures automatically. On phones it covers the map area while open. The open tool is remembered per page (Layers / Equipment open the first time on screens ≥ 1280 px).
  - **Legend** follows what is switched on: one swatch per visible layer plus the PHI colours; nothing floats over the map any more (the old floating PHI legend is gone), so nothing can overlap.
  - **Basemaps**: Light map · Street map · Satellite · Topographic (new), remembered per page.
  - Zoom buttons in the opposite top corner; everything mirrors in Arabic.
- GIS Map: the persistent layers drawer and the big "Add Layer" button replaced by the tool bar + docked panel.
- **GPS Tracking fills the whole work area**: no separate title row (the page name is in the breadcrumb and read by screen readers); one slim bar above the map (what is shown · track date · refresh); edge to edge and down to the bottom of the screen like GIS Map. The map now starts 123 px higher on desktop (214 vs 337 px) and is 686 px tall on 1440 × 900 (was 500 px fixed two rounds ago).
- `useFillHeight({ bleed: true })` for full-bleed pages.
- Tests: new workspace test — Layers opens a docked panel and the map narrows; Legend lists only visible layers; Basemaps is a radio list; Esc closes and the map regains full width; Add data opens the dialog. Map overlap check ignores closed panels.
- Gate: **602 Playwright tests, all passing**; **677 unit tests** passing.

## Round 22 — John Deere Operations Center connection
- New screen **Settings → John Deere** (`/admin/integrations/john-deere`): a 5-step connection (App settings → Sign in → Organization → Fields → Sync) plus an operations table. Opens on the first unfinished step; steps are clickable once reached. Phones use a compact horizontal stepper.
- Sandbox / Production environments; redirect URI with copy button; "Share with AgroCloud" for organizations not yet shared; field links suggested by name; sync by season or date range and operation type.
- Backend: migration 173, `external/johnDeere.client.ts` (OAuth 2, Accept `application/vnd.deere.axiom.v3+json`, `nextPage` paging, 7-day windows, measurement totals, refuses non-`*.deere.com` URLs), `services/johnDeere.service.ts`, routes, encrypted secrets (`utils/secretBox.ts`). 10 unit tests.
- Holding table only — Deere data does not bypass AgroCloud's approval / PHI workflow.
- Full Arabic labels; numbers with units isolated with `<bdi>` so "42.5 ha" reads correctly in RTL.
- Fixed: "Due now" contrast on API Integrations (warning.dark). Guide: `docs/JOHN_DEERE_SETUP.md`.

## Round 23 — design review pass
- **Home / area hubs:** tiles are one compact row (icon · label · arrow), 64 px instead of 108 px — about twice as many destinations fit on screen. Section count sits beside its heading. Greeting follows the type scale (30 px max) with less air above it.
- **Page top:** less padding above the breadcrumb (lg 20 px instead of 28 px).
- **Alignment:** 14 pages had their own extra outer padding (Inventory, User Management, API Integrations, IPM records, Change Requests, …), so their titles sat 12 px inside the breadcrumb. Removed; every page now lines up with the shell.
- **Breadcrumb:** pages listed in two areas (Inventory) show the path of the area they open in (Settings › Management › Inventory).
- **View only:** the marker is a labelled pill ("View only" + eye) instead of a lone blue eye icon; the six pages that used a plain info icon for view-only now use the same pill.
- **Harvest dashboard:** KPI tiles use the shared stat card (no curved coloured edge); filters 2 per row on phones; KPIs 2 + 1 on phones; chart and table no longer stretch to equal height.
- **PHI cards (Pesticide applications):** full outline in the status colour instead of a curved side bar.
- **Charts in Arabic:** legend swatch spaced from its label.

## Round 24 — export is an icon everywhere
- New shared `components/ExportButton.js`: a 40 px square icon button (download arrow, brand green) with a small file-type tag — **XLS** / **CSV** (green) or **PDF** (red) — plus a tooltip and an accessible name ("Export to Excel" / "تصدير إلى Excel"). Print uses the printer icon. Shows a spinner while exporting; disabled state keeps its tooltip.
- Replaced 37 wide text buttons ("Export to Excel", "Export Excel", "Export", "Export CSV", "Export period as PDF/Excel", "Print / Export", …) across dashboards, reports, IPM, manpower, admin and setup pages. Confirm buttons inside export dialogs keep their text.
- Arabic labels for all export names; e2e check that export controls are ≤ 40 px, named, tagged and have a tooltip.

## Round 25 — comfortable for every user: field collector, data entry, manager
Reviewed the pesticide records screen as a user on phone (390), tablet portrait (820), tablet landscape (1180), laptop (1280) and desktop (1440).
- **New `components/table/DataSheet.js`** — one records view per device:
  - *Desktop / tablet landscape* — behaves like Excel: row numbers, frozen identifying columns, column-group band, sort and AutoFilter (value checklist with search) in every header, sticky totals row (Σ), show/hide columns (remembered per browser), click-drag / Shift+click / Shift+arrows cell selection with a Count · Sum · Average bar, Ctrl+C copies as tab-separated text that pastes straight into Excel (header row included when whole columns are selected), Ctrl+A, Esc, arrow/Enter/Tab navigation (RTL-aware).
  - *Phone / tablet portrait* — cards (1 column on phone, 2 on tablet) with the fields checked in the field (date, safe-to-harvest date, quantity, cost, justification, operator), status chip in Arabic, approve/reject buttons sized for a thumb; tapping a card opens a bottom sheet with every column grouped; a "Sort by" control and totals chips.
- **New `components/FilterBar.js`** — on a phone only the search box and a "Filters" button stay on screen; the other filters open in a bottom sheet; active filters show as removable chips. Records now start right under the search (was ~665 px down).
- Pesticide applications page uses both; phone header keeps title and icon actions on one row; "New Application" is a floating button above the bottom navigation.
- Tablet landscape (900–1199 px): the sidebar starts collapsed so tables get the width (menu button opens it).
- Touch screens: inputs ≥ 44 px, small buttons/icon buttons ≥ 40 px, larger checkboxes and chip delete targets.
- "Invalid Date" no longer appears anywhere: invalid dates render empty (valid date formats unchanged).
- Arabic: approval statuses, "% Seen", record count subtitle, scouting summary labels, all sheet controls; staff-entered values (e.g. weather "Clear") are no longer machine-translated in cards.

## Round 26 — Persistent Form Identity, Power BI layer and ArcGIS link
- **Form identity (migration 174):** `form_registry` (30 system forms) with permanent `FORM_ID` (UUID v5 of the form key, same in every environment), `FORM_KEY`, `FORM_PATH`; edits/deletes of identity refused by trigger; templates linked (`form_templates.form_id`), staff-made templates registered automatically; duplicate built-in templates prevented.
- **Power BI read models:** schema `bi` (views only): forms, form_fields, form_records, form_record_values, form_lines, form_attachments, dim_location, gis_feature_forms, gis_key_forms, gis_link_issues.
- **Unified API** `/api/v1/forms`: list, definition (by FORM_ID / key / path), keyset-paged records with `updated_since`, full record (values, lines, photos, attachments, comments, location, GIS features), CSV/NDJSON export; session or API key.
- **ArcGIS link (migration 175 + Settings → ArcGIS Link):** user enters the layer link (nothing hard-coded) and optional token; read-only inspection (keys found, duplicates, missing keys, SITE / structure-type values, what already links, zones missing); editable key mapping; save + sync + link by GlobalID then ZONE_ID + Farm_Code (stored on fields); feature → forms lookup by keys or GlobalID; link issues list. SSRF guard on layer URLs, tokens masked in logs.
- Review finding left for a decision: `SITE = 3` ("Not Applicable") currently becomes a site named "Site 3".
- Details: `docs/FORM_REGISTRY_AND_ARCGIS.md`.

## Round 27 — GIS configuration inside Settings (no extra menu option)
- Removed the separate "ArcGIS Link" menu item, hub tile and API Integrations button. The configuration is now a **GIS configuration** tab in **Settings → Zones & Sites**, shown to the CEO and operations manager. The old link redirects to it.
- The tab opens with a **Relationship Class** card: origin layer and keys (GlobalID · ZONE_ID + Farm_Code), destination (fields → form records), foreign keys on the field, cardinality (1 feature : 1 field : M form records), and read-only type. The saved connection opens automatically, and the layer link, check, key fields, sync and feature → forms lookup follow below.
- Zones & Sites: the wide "Export to Excel" button became the standard export icon.

## Round 28 — GIS configuration made simple
- The tab is now three numbered steps with a tick when each is done: **Layer** (link + token + Check) · **Keys** (the three required keys; optional ones under "More fields") · **Link** (Save, Sync and link, result numbers). Long help texts were removed.
- Check results are short coloured chips (features, duplicate keys, missing keys, SITE Not Applicable, new zones, read only); clicking the duplicate chip lists them.
- Relationship Class is one line (layer ─1:1 GlobalID─ field ─1:M field_id─ FORM_ID) with the ArcGIS properties behind "Properties". The saved connection opens automatically.
- Feature forms search kept as a compact card.

## Round 29 — fewer words, "?" for explanations, compact sidebar
- New `components/HelpTip.js`: a small "?" that opens a short explanation. `PageTitle` takes `help`; the explanation paragraphs under 17 page titles moved behind it (weather entry, field staff, PHI audit log, backup, John Deere, audit log, crop rotation, historical import, recovery, irrigation dashboard, change requests, batch trace, manpower cost / record / activity sheet, fertigation–harvest correlation, agronomic reference). Icon-only info notes now show "?" too.
- GIS configuration: tighter spacing; each step and the Relationship Class have a "?" with one sentence; properties open from a small chevron.
- Sidebar, following the reference dashboard sidebar (ported to the app's MUI design system — the project is React JS + MUI, not shadcn/Tailwind/TypeScript): a Search row with the Ctrl K hint at the top, collapsible section groups (remembered per browser; the group of the open page always stays open), compact 34 px rows with 13 px text, and Sign out at the bottom.

## Round 30 — AI Assistant (AI Agent, phases 1–2)
- New **AI Assistant**:
  - The ✦ button in the top bar opens it as a side panel beside any page.
  - The full page `/assistant` (General section) lists your chats.
- **Answers come only from the system database.** Server-side tools read `bi` views and form tables (FORM_ID), and every answer lists the forms it used.
- **Same access as the user.** Answers are limited to the organisation and the user's assigned sites (the CEO sees all), and queries run read-only.
- **Results.** Tables use the Excel style, with optional bar, line or pie charts and Excel (RTL) / PDF export. The assistant also answers "how do I…" questions about screens.
- **Model.** Uses Settings → API Keys → AI Brain (Claude or OpenAI). There is no separate key.
- Migration `176_ai_assistant.sql`; API `/api/v1/ai/*`; docs `docs/AI_ASSISTANT.md`.
- **Assistant page design:**
  - One workspace card fills the screen. The title is small (15 px) and shares a row with the "?" help icon and New chat.
  - On desktop, a narrow chat-history rail sits beside a wide chat. The conversation sits in a centred reading column with a larger message box.
  - The empty state shows "How can I help?" and four suggestion cards with icons.
  - On tablet and phone, the chat uses the full width and the history opens from a clock icon. The phone page runs edge to edge.
  - Chart axes are kept LTR, so numbers are no longer clipped in Arabic.
- **Home and area hubs:** the date, greeting and subtitle block was removed, so the tiles start at the top. Section spacing is tighter. A screen-reader-only h1 keeps one heading per page.
- **Sidebar:** the Site and Season selectors have more room around their labels.
- **Overview menu:** a "?" icon in the top bar opens Summary & Contents and Daily Brief. Both were removed from the side menu.
- **Site picker:** opens directly under its field and uses the Farm Monitor style:
  - a green header with one connected zone group (All | AD | AF | …);
  - site cards below, with a ✓ on the chosen site;
  - search when there are many sites.
- **Dashboard:** the same site and season selectors sit in the dashboard header and share the sidebar selection, so changing either updates both and the data.
  - Choosing All Sites now clears the site filter (before, the previous site stayed).
  - A field picked under the previous site is cleared.

## Round 31 — Remote sensing on GIS Map, field data for the assistant
- **GIS Map** has a second icon bar on the opposite edge (right in English, left in Arabic) with satellite tools, each opening its own docked panel:
  - index layers with a gallery, groups, opacity, formula and legend;
  - show / hide;
  - imagery dates with a cloud filter and scene search;
  - AOI: draw, upload GeoJSON / KML, pick a field, go to coordinates, clip / mask;
  - change detection with a swipe handle;
  - time series with a min–max band and CSV export;
  - metadata;
  - PNG download.
- **Indices** (server scripts): NDVI, SAVI, NDWI, NDMI, NDII, MSI, BSI, true colour, colour infrared and SWIR.
- **Settings → API Keys → Satellite imagery:**
  - the configuration ID is tested, stored encrypted and used only by the server;
  - tiles go through a server proxy with a signed key.
- **Security:** the satellite routes now require sign-in (`/satellite/token` was reachable without it).
- **AI assistant:** new read-only tools for soil sensors (`sensor_readings`) and equipment GPS (`equipment_positions`), with readable column names.
- Docs: `docs/SATELLITE_IMAGERY.md`.
- **Soil (OpenLandMap)**, see `docs/SOIL_DATA.md`:
  - GIS Map soil icon switches the tool on directly (no side panel); a soil bar opens at the bottom of the map beside the legend.
  - Index legend (NDVI etc.) is vertical in the map's top-left corner, below the zoom buttons / warning banner; the bottom docks start to its right so nothing overlaps.
  - Open fields and pivots only; greenhouse, net house, glasshouse, tunnel and Cravo are refused, on the map, on the server and by the assistant.
  - Saved field soil profiles (migration 177); assistant tool `soil_properties`.
- **Time series** moved from the side panel to a wide panel across the bottom of the map (LandViewer style):
  - index and period (3 months to 2 years, or the imagery dates);
  - Apply;
  - min–max band and mean;
  - Figure (PNG) and Table (CSV) export.
- Fixed: the soil panel could crash on an unexpected response; field clicks now reach the soil tool, and field popups stay closed while it is on.

## Round 32 — full review: behaviour, saving, touch, RTL/LTR

How it was checked: an exploratory sweep (`e2e/tools/explore.js`, the ARTEMIS observe → act → record loop run in a browser) over every page × phone / tablet / desktop × Arabic / English, about 600 button clicks, plus scripted flows against the real API and database (not only mock data). Guidelines: UI UX Pro Max (touch ≥ 44 px, no horizontal scroll, labels, contrast) and Anthropic's webapp-testing skill.

Bugs fixed (found by running them, confirmed in the database):
- **Field boundaries never showed** on Remote Sensing and Weather Map: the API returns GeoJSON, the pages only read `[lat, lng]` arrays. New `utils/polygonRing.js` reads every stored shape.
- **Drawing lost its points** when the page re-rendered mid-drawing (the draw handler restarted on every render).
- **Edit did not edit the shape**, and field type / valve count in the dialog were never saved. Now: *Edit boundary* (drag corners, click a middle handle to add one, Save / Cancel bar), *Details* saves type and valves; crop is read-only there (changed in Crop History).
- **Templates (form builder):** Arabic labels gave every column the key `_` (data of different columns overwrote each other), sections were lost when an existing template was opened for editing, and empty labels / dropdowns without options / calculated columns without a formula could be saved. Now unique keys, sections kept, clear messages.
- **Inventory:** stock, minimum and cost entered in *Add Item* were saved as 0 (API schema stripped them). Deactivate used the browser's native confirm and reported success even when it failed.
- **Shift Schedule:** creating a shift always failed (schema expected `shift_date`, the page sends `date`; `shift_type` was dropped).
- **Soil sensor readings (API):** every POST lost the field and the readings (snake_case body passed to a camelCase service).
- **Inventory opening stock was counted twice** once the value reached the server (12 became 24): the item is now created at 0 and the opening amount booked once as a ledger line.
- Crashes on partial data: Users → Permissions, Labour cost → Dashboard, Agronomic thresholds, Biological Control (product list).
- Zoom-to-fields (Remote Sensing home button, Weather Map) also reads GeoJSON boundaries.
- GIS Map: Esc closes the feature card; property values of any type render safely; "1 feature" grammar.

Touch and layout:
- Invisible 44 × 44 px hit areas on touch screens for breadcrumb links, help (?) icons, "View only" / "More" chips (`utils/touchTarget.js`); layout unchanged on desktop.
- Map zoom buttons 40 px on touch; Excel-style sheet tabs in Harvest / Irrigation 36 px on touch.
- Export file tag text 8 → 9 px.
- Arabic labels for the template editor and the boundary tools.
- **Confirmations:** the browser's own `window.confirm` (English-only, unstyled, awkward on phones) is replaced in 47 places by one in-app dialog (`confirmAction()` + `<ConfirmHost />` in `ConfirmDialog.js`): button wording follows the question (Delete / Remove / Deactivate / Yes, cancel), red for destructive actions, Arabic texts for the common questions. 4 calls inside non-async code still use the browser dialog.
- Icon-only buttons named for screen readers (webhooks expand, save/export/clear filters/use my location in tables and forms).

## Round 33 — saving data: every entry form checked against the database

Each form was filled and saved in a browser against the real API, and the stored row was read back from PostgreSQL: EC/PH, Weather Log, Irrigation, Harvest, Pesticide Application, Fertigation, Scouting, Inventory, Recipes, Templates, Shifts, Soil readings, field boundaries.

Fixed:
- **Weather Log could never be saved**: the form required `date` and `site`, which live outside the form, so validation always failed.
- **Save looked dead when a field was missing** on every Formik form (EC/PH, Weather, Fertigation, Sites, Farm areas, Field types, Remote Sensing): new `FormikSubmitFeedback` says what is missing and moves to the first field. EC/PH Time now starts at the current time.
- **Dates one day early** on servers set to UTC+4 (e.g. Dubai): PostgreSQL DATE columns are now returned as plain `YYYY-MM-DD` (`db/client.ts`) instead of local-midnight timestamps.
- **Harvest:** the only save control for a new row was a 14 px tick at the far end of a wide table. Now *Save row / Cancel* under the sheet, and Enter saves. A field with nothing planted shows "No crop planted" and explains what to do.
- **Fertigation totals row** was shifted one column (the sum sat under Frequency).
- Fertigation / Irrigation with "All Sites" said "No fields configured"; they now ask to choose a site.
- **Daily Brief weather** never loaded (asked by site; the API only took coordinates). The API now accepts `site_id` and uses the average position of the site's fields.
- EC/PH labels showed raw codes (`M³`) instead of `M³` / `×`.
- Scouting count grid: every sample cell, segment and count-basis select is named for screen readers.
- The last 4 browser confirm dialogs (in code that ran inside state updates) use the in-app dialog; a failed delete keeps the row.
- Templates saved before round 32 with a shared key: a warning on open, unique keys on save, existing data stays with the first column.

Tools:
- Outside production the API logs any submitted field that validation threw away (`[validate] body fields dropped by schema`) — the cause of the inventory / shift / soil bugs in round 32.
- `e2e/tools/explore.js` also checks that every table row has the same column count as its header; `ACTIVE_SITE` picks the site for live runs.

## Round 34 — tables, scrolling, space and screen sizes (all pages)

Measured with `e2e/tools/layout-audit.js`: every page × 7 screen sizes (1920 large, 1440 desktop, 1280 laptop, tablet landscape 1180, tablet portrait 820, phone landscape 844×390, phone portrait 390), on the real API with realistic volumes (300+ irrigation rows, 120 inventory items, 70+ harvests). Result: 518 page views, no horizontal page overflow, no clipped tables, every scrolling table keeps its header, no nested scrollbars.

System-wide (theme + shared sheet styles, so every page gets it):
- **Pinned table headers**: the whole header block sticks to the top of its scroll box (multi-row headers stay together; per-cell offsets broke when a title wrapped).
- **Table boxes scroll both ways inside themselves** and are never taller than the screen minus the app bars (`--table-max-height` to change); short tables show no scrollbar.
- **Full-page sheets fill the screen** (`FitTableContainer` / `useFitHeight`): Harvest, Irrigation, Fertigation and EC/PH spreadsheets, Labour records, Pesticide applications, Bumble bees, Crop rotation & planting, Plantation workbook, Nursery / Germination, Product & Pest catalog, PHI log, Work orders, Field staff — replacing fixed 480 / 520 / 68vh heights.
- **One-line titles and compact one-line rows in sheets**; columns size to content and the table scrolls sideways instead of wrapping into tall rows.
- **Slim scrollbars**: 6 px rounded thumb, transparent track and corner, darker on hover, hairline on touch screens, smooth page scrolling (off with reduced motion).
- **Less wasted space**: removed double padding on 19 pages; tighter dialog padding on phones.

Fixed from the screenshots:
- Irrigation (RC-108): fixed columns now span both header rows (titles centred, no empty cells under them); the actions column is labelled and narrow; wider Operator / Authorized columns; Arabic titles.
- Harvest: the TOTAL row covered the second line of wrapped titles ("Start Time" showed as "Time") — titles are one line and TOTAL sits in the frozen Date column (visible when scrolling sideways); the checkbox no longer spills into the TOTAL row ("..").
- Harvest on phones: filters fold into one "Filters" button (bottom sheet + chips), so the sheet starts at the top.
- Empty header cells named (Inventory, Summary).
- Spray calendar: today's column is dark green with white text (light green + grey text was 1.8:1 contrast).

## Round 35 — compact, ordered entry forms and one colour system

An advisor team (forms layout, colour consistency, responsive/usability on phone, tablet and desktop in English and Arabic) audited every data-entry page; the fixes below follow their ranked findings.

Shared form building blocks (`src/components/form/FormLayout.js`):
- `FormSection` (quiet outlined panel, one title line, optional action on the right), `FormStack`, `FormGrid` (CSS grid with a fixed column count per screen size: fields fill whole rows, no lonely field with 75% empty space), `GroupLabel`, `HintLabel` (the explanation moves from an always-visible helper line into a hover/focus hint on the label), `calcFieldSx` (read-only calculated fields: muted fill, tabular figures), `FormActions` (Clear / Save, full width on phones).
- Order everywhere: **when → where → conditions → measurements → calculated → actions**.

System-wide (theme):
- Inputs are the dense size by default (≈38 px on desktop, 44 px touch targets on touch screens); Autocomplete and FormControl follow.
- Adornment icons are small and muted; "— optional —" empty options are quiet grey text, not italics.
- Helper text sits closer to its field. Blank `' '` helper lines that reserved space under every field (labour sheets) are gone.
- Panel padding on 29 pages: 12 px phone / 16 px desktop (was 12–16 px everywhere, 24 px with `p:4`).
- Sentence case for section and overline labels (sidebar groups, dashboard stat titles, map panels): no more uppercase tracked labels; table header cells in the default style too.
- Sheet/table colours come from `--sheet-header`, `--sheet-header-strong`, `--sheet-accent`, `--sheet-ink-2/3` instead of five different header greens, navy banners and four greys (124 literals in 25 files). Chart, map and report colours were left alone on purpose.
- Weather and soil cards: no pastel gradients, glass blur or lifting shadows; flat-UI status colours replaced by the theme's error / warning / success / info.
- Pesticide costing KPIs: one neutral row (cost in the accent) instead of four differently coloured cards.

Pages:
- **EC/PH entry** (phone height 2572 → ~1800 px): Reading (date, time, site, farm area, field, weather, irrigation status), Valve 1 (valve, cycle, qty, total, then EC/pH, then drip & drainage, then total from drip), Valve 2 behind "Add second valve", Field summary with the actions. Ranges are placeholders (0.0 – 5.0), formulas are hints. Crop line is quiet text instead of white text on blue.
- **Fertigation entry**: Where and when (date + zone/site/farm area/field in one row), Water (qty, frequency, valves, fertigation water calculated), Recipe (recipe, tank volume, cycles, element ppm). Calculated amounts table and a 4-figure summary. Fix: the view-only lock on Save was overridden by a duplicate `disabled` prop.
- **Weather & soil entry**: the form is first (was below four explanation cards); conditions in one row (Max °C / Min °C / Avg °C / RH / rainfall / notes; short labels no longer clipped on phones). OpenWeatherMap status, fields with coordinates (Fetch per field) and the long explanation (collapsed) in one panel; current weather and soil cards in a two-column grid.
- **EC/PH entries table**: fixed columns span both header rows; second-row titles stay on one line (header 107 → ~76 px).
- **Farm areas & crops dialogs**: name + size on one row; dripper / plants / drip-test counts on one row with hints.
- **Dialog section titles** (pesticide application, etc.): neutral 600 weight instead of green 700.
- Arabic for every new label.
