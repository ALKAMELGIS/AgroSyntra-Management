# Spreadsheet-style tables

How the Excel-style data tables are built, and what to do when applying them to another screen.

Shipped in "Restyle IPM Product Catalog tables as spreadsheet grids" (PR #3).

## Why

The theme styles tables minimally: body cells get only a bottom border, so there are no vertical separators, and the header is `#f5f3f0`, a near-invisible warm grey with grey text. On a wide table that reads as a plain list, and these screens get scanned against printed spreadsheets, so tracking a value back to its column was slow.

Four things together produce the spreadsheet read, and the effect depends on having all four:

1. A frozen row-number gutter down the left.
2. A saturated frozen header band.
3. Gridlines on every cell.
4. Colour confined to the edges, so body cells stay free to carry semantic row state.

Point 4 is the constraint that shaped the rest. Importers tint whole rows red for validation failures, and several tables tint group headers and totals. If the table itself painted body cells, those meanings would be fighting the decoration.

## Tokens

`palette.table` in [src/theme.js](src/theme.js), defined for both modes. It is **additive** - it adds a namespace and overrides none of the existing `MuiTable*` component styles, so tables that do not opt in are untouched.

| Token | Light | Dark |
| --- | --- | --- |
| `headerBg` | `#3d7c4f` | `#3d7c4f` |
| `headerText` | `#ffffff` | `#ffffff` |
| `gutterBg` | `#e9e5e0` | `#332f2b` |
| `gutterText` | `#6b7280` | `#a8a29e` |
| `gridline` | `#dcd8d2` | `#413d38` |
| `sectionBg` | `rgba(61,124,79,0.10)` | `rgba(90,158,107,0.16)` |
| `sectionText` | `#2d6a3f` | `#7dc08d` |
| `totalBg` | `#fef3cd` | `rgba(254,243,205,0.14)` |
| `totalText` | `#7a5a00` | `#e8d9a8` |
| `selection` | `#3d7c4f` | `#5a9e6b` |
| `selectionRange` | `rgba(61,124,79,0.06)` | `rgba(90,158,107,0.08)` |
| `rowHover` | `#f0ede8` | `rgba(255,255,255,0.05)` |
| `errorBg` | `#f8d7da` | `rgba(248,215,218,0.14)` |
| `errorAccent` | `#b02a37` | `#fca5a5` |

Two notes on the values. The header stays `#3d7c4f` in dark mode rather than moving to `primary.main` (`#5a9e6b`), which is too light to carry white text. Header text is pure white in both modes: a softer `#eaf5ec` measures 4.52:1 on that green, which passes but leaves no margin.

`sectionBg`, `totalBg` and `errorBg` are consumed by tables that have group headers, totals or validation tints (Product Catalog PHI groups, Fertigation/Harvest totals, importers). They stay on the palette so the next table that needs them does not invent a new yellow.

[src/\_\_tests\_\_/theme.table.test.js](src/__tests__/theme.table.test.js) asserts the namespace survives `createTheme`. MUI is free to drop palette keys it does not recognise, and if it dropped `table` the affected screens would crash on render rather than merely lose their colour.

## Usage

[src/components/table/ExcelTable.js](src/components/table/ExcelTable.js) exports `excelTableSx` and `GutterCell`.

```jsx
<TableContainer component={Paper} variant="outlined"
  sx={{ maxHeight: 'calc(100vh - 320px)', borderRadius: 1 }}>
  <Table size="small" sx={excelTableSx}>
    <TableHead>
      <TableRow>
        <GutterCell />
        <TableCell>Product Name</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {rows.map((r, idx) => (
        <TableRow key={r.id} hover>
          <GutterCell index={idx + 1} />
          <TableCell>{r.name}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</TableContainer>
```

Add `className="col-numeric"` to numeric columns for right alignment with tabular figures, on both the head and body cells so they line up.

The `maxHeight` is required. Without a height constraint on the container the header has nothing to stick to, and the frozen header and gutter are most of the point.

## Freezing columns

On a table wide enough to scroll sideways, `freezeColumnsSx` pins the leading columns against the left edge so the ones that identify a row stay visible. Merge it after `excelTableSx` and tag the cells by position, on both the head and body rows:

```jsx
<Table stickyHeader size="small" sx={[excelTableSx, freezeColumnsSx([140, 110, 100])]}>
  ...
  <TableCell className="col-frozen-0" title={cropName}>{cropName}</TableCell>
```

When a table also has a gutter, pass `GUTTER_WIDTH` as the second argument so the frozen run starts after it. Offsets default to the left edge, which is right for Application Records, but would slide the first frozen column underneath the 44px gutter:

```jsx
<Table size="small" sx={[excelTableSx, freezeColumnsSx([150, 120], GUTTER_WIDTH)]}>
```

Four things to know before using it:

**Only one scroll container may sit between the sticky cell and the page.** Sticky positioning resolves against the nearest scrolling ancestor, so a `TableContainer` wrapped in another `overflow: auto` box sticks to the `TableContainer` - which, having no height of its own, never scrolls. The symptom is a `stickyHeader` that quietly does nothing. Put the height on the `TableContainer` and let it own both axes.

**Widths are fixed, not minimums.** Each column is offset by the sum of the widths before it, so a column that sizes to its content puts every column after it in the wrong place. Overflow is ellipsized, which is why body cells need a `title` with the full value.

**Frozen cells need an opaque background.** Sticky cells are transparent by default and the scrolling columns show straight through them.

**Frozen data columns take row state; the gutter does not.** The gutter is frame, like Excel's row-number strip, so it stays out of hover. Frozen data columns are data: if they skip hover the row lights up except its first columns, which just looks broken. Anything that paints a row - hover, selection, a highlight - has to reach them, and has to outrank the frozen background.

### The spreadsheet grid freezes by key, not position

[src/components/SpreadsheetGrid.js](src/components/SpreadsheetGrid.js) cannot use `freezeColumnsSx`. It renders a plain `<table>` with inline styles, so there is no `sx` to merge into.

It also cannot pin by position, because its columns arrive from a template's `columns_config` and differ per template: spray and drench open with Crop, Variety and Field ID, while the pesticide template has no Variety at all and calls its field `fieldName` rather than `fieldId`. So it freezes the leading run of columns whose key appears in `IDENTITY_KEYS`, stopping at the first that does not - three columns on spray and drench, two on pesticide. Offsets start at `GUTTER_W` rather than zero, since the checkbox and row-number columns are already pinned in front of them.

Everything above still applies. Widths become fixed rather than minimums; the frozen cells paint their own background, which is why odd rows resolve `'transparent'` to white before being handed to `renderCell`; and dirty, active and mixture-child states all reach the frozen columns.

## Decisions worth knowing before you change it

**Borders are separate, not collapsed.** Chrome drops collapsed borders from sticky cells, leaving a hairline gap under the header while scrolling. Hence `borderCollapse: 'separate'` plus an inset shadow for the header's column separators.

**The `!important` declarations are load-bearing.** [src/App.css](src/App.css) styles `.MuiTableCell-head` and `.MuiTableCell-body` globally with `!important`, which no amount of specificity can beat. Every `!important` in `excelTableSx` matches a property App.css forces. Delete one and that property silently reverts to the global grey - which is exactly how the header shipped grey the first time.

**The gutter pins vertical padding to 10px.** That is what App.css gives every other cell, so the gutter cannot stretch the row. Only the horizontal padding tightens, to keep the number column narrow.

**Hover and selection are painted on cells, not rows, and skip the gutter.** Sticky cells carry their own background, so a background on the `tr` would not show through them. The `:not(.table-gutter)` exclusion is what stops the frozen column from smearing during horizontal scroll. It also sidesteps a specificity fight, since the gutter simply never matches those rules.

**Stacking order is deliberate:** header `3`, gutter `2`, and the head gutter corner `4` because it is sticky on both axes at once.

**`GutterCell` replaces an existing `#` column rather than adding one.** Column counts stay the same, so existing `colSpan` values on empty-state rows keep working. If a table has no `#` column, adding the gutter means every `colSpan` in it needs incrementing.

**Drop `fontWeight: 700` from head cells** when converting one. An `sx` prop on the cell beats the mixin, so leftover per-cell header styling silently wins over the header band.

## Where it is used

Both Product Catalog sub-tabs, My Site and Browse All, in [src/pages/ipm/PesticideApplications.js](src/pages/ipm/PesticideApplications.js). On Browse All the gutter comes first and the checkbox second, and the header checkbox is forced white so it is visible on the green band.

Converting those tables also fixed a real bug. PHI of `0` rendered as an em-dash, because `p.phi_days || '—'` treats `0` as falsy - and zero is the value that matters most, since it means harvest can proceed immediately. PHI now renders as a chip: green at `0`, amber at `7` or more, neutral otherwise. Other em-dash placeholders were dropped so blank cells read as blank.

The Application Records table on the same page, which is 25 columns wide. It freezes Crop, Variety and Field ID rather than using a row-number gutter: at that width the question when scrolled right is which record you are reading, and a row number does not answer it. It has no `#` column, so a gutter would also have cost an extra column and an increment to every `colSpan`.

Converting it removed a `HorizontalScrollRegion` wrapper around the `TableContainer`. That wrapper owned the height while the `TableContainer` owned the horizontal overflow, which meant `stickyHeader` had nothing to stick to and the header scrolled away.

[src/components/SpreadsheetGrid.js](src/components/SpreadsheetGrid.js), which drives the Pesticide, Spray and Drench Application tabs, shares the green but not the code. It draws with plain inline styles rather than MUI `sx`, so its palette is a set of literals at the top of the file that mirror `palette.table` by hand. It already had gridlines, a saturated header, frozen columns on both edges and row striping; only the colours changed, from Excel blue to the green used everywhere else.

Those grids later gained frozen identity columns too, for the same reason Application Records has them: past twenty columns, a row number does not tell you which record you are reading. See the key-based mechanism above.

Its alternating row stripe is a warm neutral rather than a green, deliberately. Calculated cells in that grid are tinted green, and a green stripe running underneath them would swallow the distinction.

The Deployments, Inspection and Inventory tabs on [src/pages/ipm/BumbleBees.js](src/pages/ipm/BumbleBees.js). Deployments and Inspection freeze Field and the date after the gutter, using `freezeColumnsSx(widths, GUTTER_WIDTH)`. Inventory has a gutter and no freeze: its first column is a number, so there is nothing identifying to pin. Draft and pending rows keep their yellow and amber under hover through a `rowStateSx` mixin, the same trick Application Records uses for a highlighted row, because `excelTableSx` would otherwise grey them the moment the mouse crossed a row someone was typing into. Converting them also dropped `HorizontalScrollRegion`, so the sticky header actually sticks.

The standalone Product Catalog page at [src/pages/ipm/ProductCatalog.js](src/pages/ipm/ProductCatalog.js) (distinct from the nested catalog inside Plant Protection). Pesticide Products and the Foundation catalog freeze Product name and Active Ingredient after the gutter: those tables run to 16 and 7 columns. Biological Products is four columns, so it gets the gutter and the green band only. The PHI Table is grouped by product, so a row-number gutter would lie about what a row is; product header rows use `table.sectionBg` instead of leftover blue-grey, and the add/edit rows stay yellow under hover the same way Bumble Bee drafts do.

Pest & Disease Catalog at [src/pages/ipm/PestCatalog.js](src/pages/ipm/PestCatalog.js). The Catalog table (shared across All / Pests / Diseases / Biological Control / Other) freezes Name after the gutter. Sampling Units is four or five columns, so it gets the gutter only. Inactive catalog rows keep `opacity: 0.5`.

Field Staff at [src/pages/ipm/FieldStaffManagement.js](src/pages/ipm/FieldStaffManagement.js) is six columns, so it gets the gutter and the green band only.

PHI Audit Log at [src/pages/ipm/PhiAuditLog.js](src/pages/ipm/PhiAuditLog.js) already tried to look like Excel (dark green `#1B5E20`, Calibri, grid borders) but `App.css` greys the header the same way it did everywhere else. It now uses the shared mixin, replaces its `#` column with the gutter, and freezes Harvest Date and Field. Days-violated tints are a `cell-sev-*` mixin so hover does not grey a high-severity cell.

EC/PH Entry at [src/pages/ECPHEntry.js](src/pages/ECPHEntry.js) has two tables. The spreadsheet you type into ([src/pages/ecph/SpreadsheetEcphEntry.js](src/pages/ecph/SpreadsheetEcphEntry.js)) keeps Field sticky without a gutter, because a field spans two valve rows and a row number would count valves. Out-of-range EC/pH tints use a `cell-ecph-*` mixin so hover does not hide a warning. The All Entries table at the bottom ([src/pages/ecph/EcphEntriesTable.js](src/pages/ecph/EcphEntriesTable.js)) dropped the old lavender `#E6E0EC` sheet styles; it has two header rows, so the second sits at `top: 40` rather than stacking on the first. It freezes the checkbox plus Date, Site, Farm Area and Field.

Fertigation Entry at [src/pages/fertigation/SpreadsheetFertigationEntry.js](src/pages/fertigation/SpreadsheetFertigationEntry.js) also freezes Field without a gutter: the frozen cell carries an "override" caption, so it uses a local freeze mixin that does not ellipsize, rather than `freezeColumnsSx`. The TOTAL row is a `row-total` in the body painted with `table.totalBg`. The All Entries table ([src/pages/fertigation/FertigationEntriesTable.js](src/pages/fertigation/FertigationEntriesTable.js)) freezes Date and Field. [src/components/entries/entrySheetStyles.js](src/components/entries/entrySheetStyles.js) is unused now.

Harvest Entry at [src/pages/HarvestEntry.js](src/pages/HarvestEntry.js). Field and Open Field freeze Date; the qty total sits in thead row 2 at `top: 40` in `table.totalBg`, the same two-row trick as EC/PH All Entries. The Add Row stays `#F1F8E9` under hover via `row-draft`. Summary, Daily Worksheet and Weekly Summary take the green band; Daily also freezes Date. The forage pivot (`PivotHarvestTab`, IMS RC-130) is a printed form with sage/peach/blue fills and is left alone.

Pump Room at [src/pages/PumpRoom.js](src/pages/PumpRoom.js). Electricity, Water and Fogger all render through `PumpUsageTab`, so one restyle covers every tab. Sr No becomes the gutter; Meter ID, Usage Area and Date freeze after it, because extra pumps push the usage columns off-screen. The Month banner is thead row 1 and the column names sit at `top: 40`. Totals use `row-total`. Click-to-edit, import and the month sheet tabs are unchanged.

Crop Rotation at [src/pages/admin/CropHistory.js](src/pages/admin/CropHistory.js). The always-on Crop Rotation history freezes Field. Planting & Transplant replaces `#` with the gutter and freezes Date/Field/Segment (or Sowing batch/Date/Field when nursery sowing is on); dirty rows stay yellow and nursery rows stay a light green under hover. The optional tabs that appear after you enable a template under Templates → Planting & Transplant are the same mixin: Open Field Seeding ([src/pages/admin/OpenFieldPlanting.js](src/pages/admin/OpenFieldPlanting.js)), Germination Record (two-row counting header, Variety frozen, germ-% tints as `cell-germ-*`), Sowing Record RC-241 (two-row media group, Date/Crop/Variety frozen), and Plantation Opening/Closing (local grid in [src/pages/admin/PlantationWorkbook.js](src/pages/admin/PlantationWorkbook.js), Requestor group on row 1). The sample grids on [src/pages/TemplatePreview.js](src/pages/TemplatePreview.js) and the live preview in [src/pages/TemplateEditor.js](src/pages/TemplateEditor.js) use the same green band, so a newly added planting template looks like the rest. Custom planting templates still do not become live data-entry tabs on Crop Rotation.

Manpower Record at [src/pages/ManpowerRecord.js](src/pages/ManpowerRecord.js). Records and Daily Manpower Report share `ManpowerRecordsGrid`: a gutter, two-row header (activity groups on row 1, block fields at `top: 40`), and Date/ID/Name/Category frozen after the gutter. Even/odd activity fills were dropped so hover still paints sticky cells; a thicker right edge still marks the end of each activity block. Workers replaces `#` with the gutter and freezes Employee ID and Name; the bulk-upload preview uses the same mixin. Approvals restyles the nested activity table in [src/components/manpower/ManpowerApprovalsPanel.js](src/components/manpower/ManpowerApprovalsPanel.js). Filters, edit, import and approval actions are unchanged.

Daily Brief at [src/pages/DailyBrief.js](src/pages/DailyBrief.js) stays a morning dashboard, not a wide sheet. Rainbow left-border cards are gone; each block uses the same green header band as Pump Room. PHI, change requests, work orders, system alerts, yesterday's harvest and pest alerts use `excelTableSx` plus a gutter. At-a-glance chips and weather tiles sit in that chrome. Row clicks and empty-state alerts are unchanged.

Management pages under Settings: Zones & Sites ([src/pages/CountriesSitesManagement.js](src/pages/CountriesSitesManagement.js)) freezes Zone Name and restyles the nested Sites table; Farm Areas & Crops ([src/pages/FarmAreasCropsManagement.js](src/pages/FarmAreasCropsManagement.js)) freezes Farm Area Name and Crop Name (expand stays, dripper/plant inputs are not frozen); Field Types & Names ([src/pages/FieldTypesNamesManagement.js](src/pages/FieldTypesNamesManagement.js)) freezes Field Name; Valves Config ([src/pages/ValvesConfiguration.js](src/pages/ValvesConfiguration.js)) is gutter only because number/name are inputs; Recipes ([src/pages/RecipesManagement.js](src/pages/RecipesManagement.js)) freezes recipe Name and restyles the fertilizer dialog grid; Agronomic Reference ([src/pages/AgronomicReference.js](src/pages/AgronomicReference.js)) uses a green band per crop; API Integrations ([src/pages/admin/ApiIntegrations.js](src/pages/admin/ApiIntegrations.js)) freezes Name and restyles the sync-history and assigned-fields dialogs. Filters, expand/collapse and save are unchanged.

## Not in scope

Workers Count and Work Hours on Manpower Record (`WorkersCountPivotTable`, `WorkersCountCropSummaryPair`, `WorkHoursPivotTable`) keep their printed IMS look: sage row headers and orange column headers and totals. The harvest forage pivot in `HarvestEntry.js` is the same kind of form and is also left alone. Inventory and Yield Predictions are left as they are.

This is not a global theme change. Tables elsewhere in the app keep the existing minimal styling until they opt in.

## Known issue: tables in dark mode

Table styling currently has three competing owners: [src/App.css](src/App.css) with `!important`, the `MuiTableHead` and `MuiTableCell` overrides in [src/theme.js](src/theme.js), and component `sx`. The first two are near-duplicates.

`App.css` hardcodes light values (`--bg-muted: #f5f3f0`) and has no dark-mode handling, so its `!important` beats the theme's dark `#262320` and **every table header in the app stays light grey in dark mode**.

The fix is to delete the duplicated table block from `App.css` and let `theme.js` own it. That is not free: `App.css` forces `10px` cell padding where the theme specifies `12px`, so every table in the app would gain about 4px of row height. Worth doing deliberately, as its own change.
