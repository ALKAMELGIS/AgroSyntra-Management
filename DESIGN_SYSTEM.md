# AgroCloud Design System — "Calm Field"

Source of truth: `src/theme.js` (MUI theme + CSS variables injected on `:root`).
`src/App.css` only holds global hooks (scrollbars, charts, Leaflet, print, mobile polish).
Guided by UI UX Pro Max (Minimalism & Swiss style, data-dense dashboards, WCAG AA),
with typography, spacing and page rhythm inspired by OneSoil (not copied).

## Colour tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| primary | `#1f7a4d` | `#4cb27e` | Actions, active nav, focus ring |
| primary.dark | `#165c3a` | `#2f8f5d` | Hover |
| secondary | `#0f6f6a` | `#45b3aa` | Secondary series / accents |
| warning / error / info | `#c4761a` / `#c23b2b` / `#2f6aa8` | `#e5a24f` / `#ef7d6d` / `#6aa6e6` | Status |
| background.default | `#f5f6f3` | `#0c100e` | Page |
| background.paper | `#ffffff` | `#141a17` | Cards, menus |
| background.muted | `#eff1ed` | `#1a211d` | Inputs bands, table heads |
| text.primary / secondary | `#121714` / `#58625c` | `#e9eee9` / `#9ba79f` | Text (≥4.5:1) |
| divider | `#e3e7e2` | `#252d28` | Hairlines |
| table.headerBg | `#1d5a3c` | `#1d5a3c` | Spreadsheet header band (white text) |

CSS variables: `--brand-green`, `--text-primary`, `--text-secondary`, `--bg-page`, `--bg-surface`,
`--bg-muted`, `--border-subtle`, `--border-hover`, `--radius-*`, `--shadow-*` — they switch with the theme.

Charts: `src/components/dashboard/dashboardChartTheme.js` → `CHART_COLORS` (calm, earthy, ordered for distinguishability).

## Typography
Inter (Latin) + IBM Plex Sans Arabic (Arabic), loaded once in `public/index.html`. **The only UI fonts** — use `var(--font-sans)` / `var(--font-mono)` (or the theme) for any inline `fontFamily`; never hard-code Calibri/Arial. Excel exports may keep Calibri.
Headings 600 weight with negative tracking; numerals are tabular.

| Variant | Desktop | Phone |
|---|---|---|
| h1 | 40px | 32px |
| h2 | 32px | 26px |
| h3 | 26px | 22px |
| h4 (page title) | 24px | 20px |
| h5 | 19px | 17px |
| h6 | 16px | 16px |
| body1 / body2 | 15px / 13.5px | — |
| caption / overline | 12px / 11px uppercase | — |

## Spacing & shape
Base unit 4px (`theme.spacing(1)`). Page gutter: 12 / 20 / 24 / 28px (phone / tablet / laptop / desktop) — `CONTENT_PADDING` in `src/hooks/useAppLayout.js`; use `contentBleed` for full-bleed children.
Radius: 6 · 8 · 12 · 16 (cards) · 20 (dialogs) · pill (buttons, chips, search).

## Components
- **Buttons**: pill shape, min-height 38px (32 small / 46 large), visible focus ring.
- **Cards / Paper**: 16px radius, hairline border, soft shadow.
- **Inputs**: 10px radius, emerald focus ring, 16px font on phones (no iOS zoom).
- **Menus / popovers / dialogs**: hairline border + soft pop shadow; dialogs go near full-width on phones.
- **Tables**: muted uppercase head, hover rows, horizontal scroll inside the container.
- **Icons**: Material *Outlined* family everywhere in navigation and hubs.
- **Layout grid**: MUI v7 `Grid` with `size={{ xs, sm, md }}` (legacy `item xs=` props are not supported in v7).

## RTL note
Do not put `::placeholder` (or other selectors the stylis prefixer expands) in theme `styleOverrides`;
it crashes the RTL emotion cache. Put such rules in `App.css`.

## Arabic page wording
- Interface words on pages are translated through `src/i18n/pageLabels.js` (keys = exact English on screen). Adding a word is one line there.
- Wrap any element that shows user data that could match an interface word (e.g. a field named "Nursery") in `data-no-translate` if it must stay as typed.
- Build counted text as one string (`${n} items`), not `{n} item{s}`, so it can be translated as a whole.

## Page width & space
- Data/report pages: `<Container maxWidth="xl">` (or `lg`) — fills the content area up to `PAGE_MAX_WIDTH` (1760 px). Reading pages: `maxWidth="md"` (1040 px).
- Don't add side padding inside pages: the main area already pads (`CONTENT_PADDING`).
- Summary numbers go in a row of tiles; independent sections go in a 2-column grid from `lg`; a chart and its short table sit side by side from `lg` (3fr / 2fr).
- Table headers wrap to two lines (min 88–96 px); keep body cells short and give long values a `title`.

## Fonts by language
- English: Inter (`FONT_SANS`). Arabic: IBM Plex Sans Arabic leads for all text, including numbers and Latin words (`FONT_SANS_AR`, switched on `html[lang="ar"]`). Codes: JetBrains Mono.
- Never hard-code a font: use `var(--font-sans)` or the theme typography.

## Page title
- Every page starts with `<PageTitle>` (h1, no icon). Actions sit at the end of the same row; a short subtitle may follow in `body2 / text.secondary`.
- Don't add padding to the page root — the main area pads.

## Required fields
- Mark with the `required` prop (TextField, or `FormControl required` for Select) — never type "*" or "(required)" into the label.
- Validate in the save handler and report with a message containing "required" / "Please fill in…"; the shared helper outlines the empty fields and focuses the first.

## Frames and density
- One frame per group: a page is not wrapped in a card; a table inside a card has no frame of its own; don't put a card inside a card unless the inner ones are repeated items (tiles).
- Frame padding ≤ 24 px (`p: 4` or less with the 4 px spacing unit); gaps between page sections 16–24 px.
- In `sx`, sizes ≤ 1 are percentages — write `'1px'` for one pixel.
- Leave at least 12 px (`rowGap: 3`) above an outlined field whose label floats on its border when a row can wrap.

## Size scale (enforced in theme.js)
- Buttons: small 32 · medium 40 · large 48 px high; their icons 16 · 18 · 20.
- Icon buttons: small 32 · medium 40 · large 48 px; icons 18 · 20 · 24.
- Icons: 16 (inside chips / small buttons) · 18 (menus, fields) · 20 (default) · 24 (large).
- Type: 11 · 12 · 13 · 14 · 15 · 16 · 18 · 20 · 22 · 24 · 26 · 30 px — use theme variants; never type sizes like 0.72rem.
- Radii: fields / buttons 10 · tiles 12 · cards 16 · dialogs 20 · chips pill.
- Repeated controls (per row / per layer) carry the item in their accessible name.

## Map screens
- Use `useFillHeight` for the map box; panels beside the map on desktop, in a drawer / below on phones.
- Legends and floating panels stay above the map credits (bottom ≥ 30 px) and never cover each other.
