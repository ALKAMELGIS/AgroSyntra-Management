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
