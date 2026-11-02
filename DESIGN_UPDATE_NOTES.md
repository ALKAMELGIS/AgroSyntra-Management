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
