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
