# Uproot & Planting Seasons — implementation plan and handoff

Status as of 8 Sep 2026. Steps 1–2 are merged to `main`. Step 3 is PR #11
(`feat/seasons`). Step 4 (End season + Reset removal) is on `feat/end-season`.
Remaining: auditor reopen, module date windows.

---

## 1. What we are building and why

Two separate actions, often confused:

**Uproot** — one field, or some of its segments, inside the same season. Sweetcorn
cycle 1 (Sep–Nov) is harvested, the plants are pulled, the ground is free, and
cycle 2 can be seeded in January or even the same day. Three cycles run inside a
single season. Uproot does not start a new year and does not delete anything: the
finished cycle keeps its row, its harvests, its sprays, its manpower. It only
stops counting as occupancy.

**End season** — the whole site year, e.g. Sep 2025 – Jul 2026. That year's IPM,
fertigation, irrigation, manpower, harvest, EC&pH and weather stay attached to
that season. The next season starts empty. Past seasons stay selectable and
read-only. If an operation manager ends a season by mistake mid-year, they request
a reopen and an auditor approves it.

Seasons are per site, not per organisation: sites close in June or July depending
on the crop.

### Architectural decision: a season is a named date range

Do **not** put `season_id` on 25–30 operational tables. Every module already
filters by `organization_id` + `site_id` + a date range, so selecting a season
just injects that range.

`season_id` goes only on the three tables where a row is genuinely a season fact
and can sit near a boundary date:

- `open_field_planting`
- `planting_records`
- `crop_history`

Harvest, IPM, manpower, fertigation, irrigation, EC&pH and weather stay
field + segment + date. That is enough to separate cycle 1 from cycle 2.

### Hard rule: never reuse the reset endpoints

`DELETE /crop-history/reset`, `DELETE /planting-records/reset` and
`DELETE /open-field-planting/reset` **delete planting history**. End season must
close and archive. These three endpoints get removed in the same PR that adds
End season — see step 4.

---

## 2. Done — merged to `main`

| PR | Commit | What landed |
|----|--------|-------------|
| #4 | `0669857e` | Canonical segment token parser |
| #6 | `bb665976` | Uproot backend: migration 144, shared field/crop sync, service, endpoints |
| #2 | `3a177e4d` | Workers Count `pivot_column` mapping, migration 143 (unrelated to this feature) |
| #5 | `a091fae8` | CI repair (unrelated) |

### 2.1 Segment tokenizer — `backend/src/utils/plantingSegmentTokens.ts`

The write path's source of truth for segment strings. Segments are free text on
the planting tables (`"V1,V2,V3"`, `"Bay 10 & Bay 11"`, `"ALL"`), so anything that
splits or rewrites them has to round-trip safely.

```ts
canonicalizeSegmentToken(raw)                  // "bay 10" -> "B10", "valve 2" -> "V2"
parseSegmentTokens(segment)                    // "V1, V2 & V3" -> ["V1","V2","V3"]
serializeSegmentTokens(tokens)                 // ["V1","V3"] -> "V1,V3"
splitSegmentTokens(segment, remove, { universe })  // -> { removed, remaining }
ALL_SEGMENTS = 'ALL'
class AmbiguousSegmentSplitError
```

`splitSegmentTokens` throws `AmbiguousSegmentSplitError` when it is asked to
partially uproot a row whose segment is `ALL` and no `universe` was supplied —
because "everything except V1" is unanswerable without knowing what everything is.

Tests: `backend/src/utils/__tests__/plantingSegmentTokens.test.ts`.

The old frontend helper `src/utils/plantingSegment.js` is still used for read-side
display and option building (SegmentSelector, scouting, pivot tabs). It is lossy
and must **not** be used for writes. Leave it where it is.

### 2.2 Migration 144 — `backend/src/db/migrations/144_planting_uproot_lifecycle.sql`

Adds to **both** `open_field_planting` and `planting_records`:

```sql
status        VARCHAR(20) NOT NULL DEFAULT 'active'   -- 'active' | 'uprooted'
uprooted_at   DATE
uprooted_by   UUID REFERENCES users(id)
uproot_reason TEXT
```

Plus a `CHECK` that `(status = 'uprooted') = (uprooted_at IS NOT NULL)`, and a
partial index on `(field_id) WHERE status = 'active'` for occupancy lookups.

Note: every pre-existing row defaults to `active`. This matters — see 2.5.

`season_id` and `cycle_number` are **not** in 144. They belong to the seasons
migration in step 3.

### 2.3 Shared field/crop sync — `backend/src/utils/fieldCropSync.ts`

`syncFieldCrop` was copy-pasted into four route files
(`cropHistory`, `openFieldPlanting`, `plantingRecord`, `plantationWorkbook`) and
all four had the same bug: when a field had no active rotation left, they never
cleared `fields.current_crop_id`, so an uprooted field still showed its old crop
forever.

Now one module, one fixed implementation, imported by all four:

```ts
syncFieldCrop(fieldId, client?)                              // clears crop + variety when bare
autoClosePrevious(fieldId, newStartDate, excludeId?, client?)
closeCropHistoryForUproot(fieldId, uprootDate, client?)
```

Each takes an optional client so it can run inside the caller's transaction.

Tests: `backend/src/utils/__tests__/fieldCropSync.test.ts`.

### 2.4 Uproot service — `backend/src/services/plantingUproot.service.ts`

```ts
uprootPlanting(input, db): Promise<UprootSummary>
listActiveOccupancy(table, fieldId, db?): Promise<OccupancyRow[]>
occupiedSegments(table, fieldId, onDate, db?): Promise<string[]>
conflictingSegments(requested, occupied): string[]
uprootSchema  // zod
```

Works against either table via `PlantingTable = 'open_field_planting' | 'planting_records'`.

**Row splitting rule.** When only part of a row's segments are uprooted, the
**original row keeps the remaining segments and stays active**, and a **new copy**
is created holding the removed segments with the `uprooted_at` stamp. Historical
attribution stays on the row the harvests already point at.

**Segment universe rule.** To expand `ALL` for a partial uproot, the universe is
the union of tokens on the field's active planting rows and its `valves` rows.
It is read from real data and never invented. If there is no data to derive it
from, the service throws `AmbiguousSegmentSplitError` and the endpoint returns a
readable 400 rather than guessing.

**Transaction.** `uprootPlanting` expects to be called inside the caller's
`BEGIN`/`COMMIT`; the routes own the client.

Tests: `backend/src/services/__tests__/plantingUproot.service.test.ts`, using a
`makeDb` mock that asserts on the SQL and parameters.

### 2.5 Endpoints

Both mounted on **both** routers — `backend/src/api/v1/openFieldPlanting.routes.ts`
and `backend/src/api/v1/plantingRecord.routes.ts`. Open field, greenhouse and
nethouse all behave identically, which is why the service is shared.

```
POST /api/v1/open-field-planting/uproot
POST /api/v1/planting-records/uproot
```

Roles: `ceo`, `farm_manager`, `operation_manager`, `agronomist`.

Request:
```json
{
  "fieldId": "uuid",
  "segments": "ALL",              // or ["V1","V2"]
  "uprootDate": "2026-01-15",
  "reason": "cycle 1 finished"    // optional
}
```

Response `data`:
```ts
{
  rowsUprooted: number,        // rows moved wholly to uprooted
  rowsSplit: number,           // rows partially uprooted, remainder still growing
  segmentsUprooted: string[],
  segmentsRemaining: string[], // still growing on this field
  segmentsNotFound: string[],  // requested but nothing was growing there
  fieldCleared: boolean        // field is now bare, crop + variety cleared
}
```

```
GET /api/v1/open-field-planting/occupancy?field_id=uuid
GET /api/v1/planting-records/occupancy?field_id=uuid
```

Response `data`: `{ fieldId, occupied: string[], rows: OccupancyRow[] }` where

```ts
OccupancyRow = { id, segment, segmentTokens, cropId, cropName, varietyName, occupancyStart }
```

**Deliberate gap — seeding is now hard-blocked.** Migration 144 defaults every
historical row to `active`, which is why the 409 waited for seasons (step 3).
Writes to open-field and planting-record create/bulk now 409 with
`SEGMENTS_OCCUPIED` when the chosen segments overlap occupancy in the current
season. Operators uproot first. Same-day uproot then seed is allowed.

---

## 3. Remaining work, in order

Each step is one PR. Steps 1–4 are done (1–2 on `main`, 3 on `feat/seasons` /
PR #11, 4 on `feat/end-season`). Next is auditor reopen.

### Step 1 — Uproot UI

Backend is finished; this is wiring only.

Screens:
- `src/pages/admin/OpenFieldPlanting.js` (~597 lines) — open field seeding
  spreadsheet, embedded as a tab of CropHistory.
- `src/pages/admin/CropHistory.js` (~1858 lines), the **Planting & Transplant**
  tab around L1331–1753 — greenhouse/nethouse. There is no separate
  `PlantingRecords.js`; it lives inside this file.

Build:

1. An **Active occupancy** panel above each existing spreadsheet: one line per
   field, showing crop, variety, occupied segments, and an **Uproot** button. Fed
   by `GET …/occupancy?field_id=`.
2. An **Uproot dialog**: field name, date (default today), reason, and a segment
   picker. Reuse `src/components/SegmentSelector.js` — it already has an
   "All (Entire Field)" checkbox that emits the string `'ALL'`, which is exactly
   what `uprootSchema` accepts. Offer only segments returned by `occupancy`;
   uprooting bare ground should not be possible.
3. On success show the summary in plain words, e.g. "3 of 6 segments uprooted;
   V3 still has sweetcorn", from `segmentsUprooted` / `segmentsRemaining` /
   `fieldCleared`. Surface `segmentsNotFound` as a warning, not an error.
4. Handle the 400 from `AmbiguousSegmentSplitError` with its message shown as-is —
   it tells the user the field has no segment definitions to split against.
5. On the seeding form, call `occupancy` when a field is chosen and warn (do not
   block) if the chosen segments overlap `occupied`.

Done when: an operator can finish sweetcorn cycle 1, uproot half the field, seed
cycle 2 on the free half the same day, and see both cycles in the spreadsheet.

### Step 2 — Harvest → planting link

Today `harvests` has no link to the planting row it came from, so once a field
runs two cycles of the same crop there is no reliable way to say which cycle a
harvest belongs to. `harvests` columns of interest: `field_id`, `date` (not
`harvest_date`), `segment_id` (varchar, not `segment`), `crop_id`, `variety_id`,
`organization_id`. There is no `site_id` — site comes through
`fields → farm_areas.site_id`.

Files: `backend/src/db/migrations/145_*.sql`,
`backend/src/repositories/harvest.repository.ts`,
`backend/src/services/harvest.service.ts`, `backend/src/api/v1/harvests.routes.ts`.

1. Add nullable `open_field_planting_id` and `planting_record_id` FKs to `harvests`.
2. On write, resolve the planting row from field + segment + date: the active row
   whose occupancy window contains the harvest date.
3. **Same-day uproot and replant must attribute to the outgoing cycle.** If a
   field is uprooted and reseeded on 15 Jan, a harvest dated 15 Jan belongs to the
   cycle that ended, not the one that started. Resolution must prefer the row
   whose `uprooted_at` equals the harvest date over the row whose seeding date
   equals it.
4. Backfill existing harvests with the same resolution, leaving nulls where it is
   genuinely ambiguous rather than guessing.

Done when: two cycles of the same crop on the same field report separate yields.

### Step 3 — Seasons table and context

Migration `146_*.sql` (check the next free number first — see §4).

```
seasons
  organization_id, site_id
  name                      -- '2025-2026'
  start_date
  planned_end_date
  end_date                  -- NULL while open, set on close
  status                    -- 'open' | 'closed' | 'reopen_pending'
  closed_at, closed_by, reopened_at, reopened_by
```

- Partial unique index: one `open` season per site.
- Service rejects overlapping date ranges within a site.
- Backfill: one open season per existing site, wide enough to cover existing data
  so nothing is orphaned.
- Add `season_id` to `open_field_planting`, `planting_records`, `crop_history` and
  backfill from dates. Add `cycle_number` to the two planting tables, computed at
  insert per `(field_id, segment, crop_id, season_id)`.
- CRUD endpoints for seasons.
- `src/contexts/ActiveSeasonContext.js` modelled on
  `src/contexts/ActiveSiteContext.js`: provider + `useActiveSeason()` hook,
  `localStorage` key per site (site context uses `almaha_active_site`), defaults to
  the open season, resets when `activeSiteId` changes, exposes an `isLoaded` gate.
- Season picker next to the site selector in `src/components/Sidebar.js`.

Once seasons exist, add the hard seeding guard that was deferred in 2.5:
`conflictingSegments` is already written and tested, it just needs to become a
409 on the seeding write paths, scoped to the current season.

Done on `feat/seasons` (migration 146). Next free migration after this lands is
**147**.

### Step 4 — End season, and delete the reset endpoints

Done on `feat/end-season`. `POST /api/v1/seasons/:id/close` with typed
`END SEASON`, reason `'Season closed'` on remaining uproots, next season opened,
reset endpoints and Reset buttons removed. Closed seasons show a read-only banner;
writes dated inside a closed season 403 with `SEASON_CLOSED`.

`POST /api/v1/seasons/:id/close` — roles `ceo`, `farm_manager`,
`operation_manager`. Type-to-confirm `END SEASON` in the UI, audit-logged.

One transaction:
1. Refuse if already closed.
2. Uproot every remaining active planting for the site with
   `uproot_reason = 'Season closed'` — reuse `uprootPlanting`, do not write a
   second implementation. The exact reason string is what makes reopen reversible.
3. Close every open `crop_history` row for the site's fields.
4. Clear `fields.current_crop_id` / `variety_id` via `syncFieldCrop`.
5. Set `status = 'closed'`, `end_date`, `closed_at`, `closed_by`.
6. Create the next season as `open`.
7. Return counts. **No DELETE anywhere.**

A closed season is view-only: read-only banner in the UI, 403 on writes whose date
falls inside it.

In the same PR, remove the three destructive reset endpoints and their buttons:

| Endpoint | Route file | Frontend button | Handler |
|----------|-----------|-----------------|---------|
| `DELETE /crop-history/reset` | `cropHistory.routes.ts:172` | `CropHistory.js:1135` | `handleResetRotation` L668 |
| `DELETE /planting-records/reset` | `plantingRecord.routes.ts:370` | `CropHistory.js:1357` | `handleResetPlanting` L652 |
| `DELETE /open-field-planting/reset` | `openFieldPlanting.routes.ts:321` | `OpenFieldPlanting.js:392` | `handleReset` L311 |

There are no other frontend callers.

### Step 5 — Auditor reopen

Mirror the existing IPM change-request pattern:
`backend/src/db/migrations/106_auditor_ipm_change_requests.sql` and
`backend/src/utils/changeRequestAccess.ts`.

- `season_reopen_requests`: season_id, reason, requested_by, status, auditor
  decision fields.
- OM submits, auditor approves or rejects.
- On approve: season returns to `open`; **undo only the uproots whose reason is
  `'Season closed'`**, never a user's own cycle uproot; restore
  `fields.current_crop_id` from what is active again; discard the accidental
  next-season stub if it has no plantings.

### Step 6 — Season date window across modules

Thread the active season's `start_date`/`end_date` into the list endpoints as the
default range, keeping the user free to narrow inside it. Most modules already
take the params, so this is mostly frontend defaults.

| Module | Endpoint | Params it already accepts |
|--------|----------|---------------------------|
| IPM sprays | `/ipm/pesticide-applications` | `start_date`, `end_date` |
| IPM bio | `/ipm/bio-releases` | `start_date`, `end_date` |
| IPM overview | `/ipm/field-overview` | `date_from`, `date_to` (different names) |
| Scouting | `/scouting/reports` | `start_date`, `end_date` |
| Fertigation | `/fertigation/` | `start_date`, `end_date` |
| Irrigation drip | `/irrigation-drip/` | `start_date`, `end_date` |
| Irrigation RC-133 | `/irrigation/records-by-site` | `start_date`, `end_date` |
| Manpower | `/manpower/records` | `start_date`, `end_date` |
| Harvest | `/harvests/` | `start_date`, `end_date` |
| EC&pH | `/ecph/` | `start_date`, `end_date` |
| Weather logs | `/weather-logs/` | `start_date`, `end_date` |

No date range today, so they need one added or need to be left out of scope:
`/ipm/bumble-bees` and its inspections/inventory routes, and
`/irrigation/records` (keys off `month_sheet_id` only).

Reports and exports come after the list pages.

---

## 4. Conventions whoever picks this up must follow

**Migration numbering.** `main` has up to `145`. Seasons is `146`. A local
untracked `142_backfill_spray_template_id.sql` exists on this machine and is not
pushed. Check `backend/src/db/migrations/` before claiming a number, and never
renumber a migration that has already been merged.

**`backend/dist` is tracked in git.** It is not gitignored, and deployment may run
it directly. Any backend change needs `npm run build` in `backend/` and the
resulting `dist` files committed alongside the source. When there is unrelated
uncommitted work in the tree, stage only the `dist` files matching your change —
a blanket `git add backend/dist` drags someone else's work into the commit.

**Railway deploys from `main` only.** Pushing a feature branch deploys nothing.

**Migrations run on deploy**, so a merge to `main` with a bad migration takes
production with it.

**Shell is PowerShell.** `&&` chaining does not work the way it does in bash; use
`;` or separate calls. Multi-line commit messages go through a file with
`git commit -F`.

**Uproot never deletes.** Not harvests, not IPM, not manpower, not fertigation,
not EC/pH, not irrigation. Anything that frees land does it by flipping `status`.

---

## 5. Out of scope

- Rewriting the Plantation Opening/Closing workbook (RC-001 / SAGE) as End season.
- `season_id` on every operational table; the date window is enough until seasons
  have proven themselves in use.
