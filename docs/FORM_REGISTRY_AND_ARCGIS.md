# Persistent Form Identity, Power BI and ArcGIS link

Migrations `174_form_registry.sql` and `175_gis_link_keys.sql`, services
`formRegistry.service.ts`, `arcgisLink.service.ts`, routes `/api/v1/forms` and
`/api/v1/gis/arcgis/*`, and the **GIS configuration** tab of **Settings → Zones & Sites** (`/manage/countries?tab=gis`, CEO and operations manager). It is not a separate menu option; the old `/admin/integrations/arcgis` link redirects there.

Everything is additive. No existing table is rewritten and no save / edit path
changed. ArcGIS is only read.

> **Database:** AgroCloud runs on **PostgreSQL 16 + PostGIS**, not SQLite. This
> layer makes PostgreSQL the single source for forms, Power BI and GIS. A SQLite
> copy is not needed to reach that goal. If an offline file is wanted later, a
> GeoPackage export (a SQLite file that QGIS / ArcGIS Pro open directly) can be
> generated from the `bi` views.

## 1. Form identity

| | Rule |
|---|---|
| `FORM_ID` | UUID v5 of `FORM_KEY` with a fixed namespace (`form_id_for()`). The same in every environment, after a restore or a restart. A CHECK constraint enforces it. |
| `FORM_KEY` | Immutable machine key, e.g. `ipm.pesticide_application`. |
| `FORM_PATH` | Permanent path, e.g. `ipm/pesticide-applications/application`. The screen route is stored separately in `ui_route` because routes change (e.g. `/manpower/record` → `/manpower-record`). |
| Changes | A trigger refuses edits to `form_id`, `form_key` or `form_path`. A trigger also refuses deletes; set `status = 'retired'` instead. |
| Templates | `form_templates.form_id` links each template to its form. Built-in templates and their organisation copies share the built-in form. A template that staff create becomes its own form (`template.<template id>`) automatically, through an insert trigger. |
| Duplicates | `uq_form_templates_system_slug` stops a built-in template from existing twice. The old `UNIQUE(organization_id, slug)` did not cover `NULL` organisations. |

There are 30 system forms in all (`SELECT * FROM bi.forms`).
`form_registry_tables` says where each form's data lives. It records the table's role (records / lines / photos), its parent key, its date column, its attachment entity, and its template column. For example, `pesticide_applications` holds the records of 4 forms (application, spray, drench, pivot RC-109); each row belongs to the form of its `template_id`.

## 2. Read models for Power BI (`bi` schema, views only, no copied data)

| View | Grain | Use |
|---|---|---|
| `bi.forms` | form | FORM_ID, key, path, titles (en/ar), category |
| `bi.form_fields` | form × column | every field of every form table |
| `bi.form_records` | record | **form_id**, record_id, source_table, organization, site, field, record_date, created_at, updated_at |
| `bi.form_record_values` | record × field | long table: form_id, record_id, field_key, value_type, value_text |
| `bi.form_lines` | child row | lines and photos of a record (JSON) with the record's form_id |
| `bi.form_attachments` | attachment | files of records and lines, with form_id |
| `bi.dim_location` | field | zone › site › farm area › field, field type, centroid, **gis_zone_id, gis_farm_code, gis_link_key** |
| `bi.gis_feature_forms` | feature × form | record counts and dates per synced ArcGIS feature |
| `bi.gis_key_forms` | ZONE_ID+Farm_Code × form | the same, keyed by the business key |
| `bi.gis_link_issues` | issue | duplicate or missing keys, unlinked features, fields linked twice |
| `bi.form_template_duplicates` | slug | built-in templates stored twice |

`bi.rebuild_views()` regenerates the record, value, line and attachment views from
`form_registry_tables`. Adding a form therefore needs one registry row and one call.

**Power BI model:** `form_records` is the fact table. Relate it to `forms` on
`form_id`, to `dim_location` on `field_id`, and to `form_record_values` on
`record_id` (one-to-many). Use `gis_key_forms.gis_link_key` (`ZONE|FARM_CODE`) to
join with an ArcGIS export.

### Connecting
**Option A — database (Import or DirectQuery).** Create a read-only login once, as the database owner:
```sql
CREATE ROLE powerbi_reader LOGIN PASSWORD '<strong password>';
GRANT USAGE ON SCHEMA bi TO powerbi_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA bi TO powerbi_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA bi GRANT SELECT ON TABLES TO powerbi_reader;
-- The views read public tables as their owner; the reader needs no access to public.
```
In Power BI, choose **Get data → PostgreSQL database** and connect through the server's public host and port. Filter on `organization_id` for each organisation.

**Option B — API (Web connector, works through HTTPS only).** Create a key in **Settings → API keys** and send it as the header `x-api-key`.

| Call | Purpose |
|---|---|
| `GET /api/v1/forms?counts=1` | forms with record counts |
| `GET /api/v1/forms/{FORM_ID or FORM_KEY}` (or `?path={FORM_PATH}`) | definition: tables, fields, template columns |
| `GET /api/v1/forms/{ref}/records?updated_since=…&limit=1000&cursor=…` | records with values, keyset-paged; `nextCursor` is returned for incremental refresh |
| `GET /api/v1/forms/{ref}/records/{recordId}` or `GET /api/v1/forms/records/{recordId}` | full record: values, lines, photos, attachments, comments, location, linked GIS features |
| `GET /api/v1/forms/{ref}/export?format=csv\|ndjson` | whole form as a file |

The API is open to these roles: ceo, operation_manager, farm_manager, agronomist and pest_agronomist. Every call is limited to the caller's organisation.

## 3. ArcGIS link (phase 2)

### How the layer builds AgroCloud's setup (review)
The three setup screens are **one hierarchy** filled from the structures layer (e.g. `Agro_Structures`). They are not alternatives to each other:

| ArcGIS field | AgroCloud | Screen |
|---|---|---|
| `ZONE_ID` | Zone (`countries.code`) | Zones & Sites |
| `SITE` / `Site_Code` | Site (`sites`, now with `gis_site_code`) | Zones & Sites |
| `Structure_Type` | Farm area per site + field type | Farm Areas & Crops · Field Types & Names |
| `Farm_Name` / `Farm_Code` | **Field — one per feature** | Field Types & Names |
| `GlobalID` | `fields.gis_external_id` (permanent link) | — |

The linker tries three matches, in this order:
1. **GlobalID** — it never changes in ArcGIS, even when a feature is renamed or moved.
2. **ZONE_ID + Farm_Code** — new in migration 175. These keys are stored on the field (`gis_zone_id`, `gis_farm_code`, `gis_site_code`).
3. Name similarity. This match is kept for features that do not yet carry keys.

When the keys are stamped, the business key is unique per organisation (`uq_fields_gis_zone_farm_code`). Conflicts are listed in `bi.gis_link_issues` and the migration does not fail.

### Using the screen (Zones & Sites → GIS configuration)
The tab opens with the **Relationship Class**, which describes the link the way ArcGIS does:
- Origin: the layer, with primary keys `GlobalID` and `ZONE_ID + Farm_Code`.
- Destination: AgroCloud fields, with foreign keys `gis_external_id` and `gis_zone_id + gis_farm_code`.
- Cardinality: one feature to one field, and one field to many form records (`FORM_ID`).
- Type: simple and read only.

1. **Layer link.** Paste the layer URL, ending with the layer number. Add a token only if the layer is private. The link is never hard-coded; it is stored only in the connection (`gis_layers`).
2. **Check layer** (read only). The check reports:
   - whether the layer is reachable, and its geometry;
   - the GlobalID, ZONE_ID and Farm_Code fields it found;
   - duplicate ZONE_ID + Farm_Code pairs and features with missing keys;
   - the decoded SITE and Structure_Type values;
   - how many features AgroCloud already links, by GlobalID and by key;
   - zones that exist in the layer but not in AgroCloud.
3. **Key fields.** These are picked automatically. You can change any of them if another layer names its fields differently.
4. **Save and link.**
   - Saving stores the link, the token and the key mapping.
   - Sync and link reads the features with read-only queries and links each one to its field. It then writes the keys onto the field.
   - A second run links the same features to the same fields and creates nothing new.
5. **Find a feature's forms.** Search by ZONE_ID + Farm_Code, or by GlobalID. The result shows every form on the linked field, with its FORM_ID, record counts, dates and the latest records.

The same lookup is available as an API call:
`GET /api/v1/gis/features/forms?zone_id=MH&farm_code=MH-GH-01` (or `global_id=…`, `object_id=…`, `feature_id=…`).
A whole layer's summary is at `GET /api/v1/gis/layers/{id}/form-summary`.

### Safety
- **SSRF protection.** The server only fetches public `http(s)` ArcGIS REST links. It refuses localhost, private, link-local and metadata addresses, and checks every redirect hop the same way.
- **No edits.** Only `f=json` / `f=geojson` reads are sent. There is no `applyEdits`, no add or delete, and no layer creation.
- **Tokens.** Tokens are never returned by the API and are masked in logs (`token=***`).

### Open point — SITE = 3 ("Not Applicable")
In `Agro_Structures`, `SITE` 3 means **Not Applicable**. The current sync turns it into a site literally called "Site 3". That is why "Site 3" appears under AM, BH, DB and KE. The check reports how many features are affected. The data was **not** changed. To fix it, agree on one of these:
- **(a)** Treat 3 like an empty SITE. The features then go to each zone's "Default Site", and the existing "Site 3" sites are merged into it.
- **(b)** Rename "Site 3" to "Not Applicable" in each zone.

## 4. Tests
- **Backend:** `arcgisLink.service.test.ts` has 18 tests covering:
  - key detection on the Agro_Structures shape;
  - duplicates and missing keys;
  - SITE and structure-type decoding;
  - URL safety;
  - key mapping;
  - CSV output.

  The full backend suite passes: 1700 tests.
- **Migrations:** 174 and 175 were applied with the real migration runner to a fresh PostgreSQL 16 + PostGIS database that had all 173 earlier migrations. Then:
  - Down and up again gives the same FORM_IDs, and running the file twice is idempotent.
  - The guards refuse edits to the identity columns and refuse deletes.
  - A staff-made template is registered automatically.
- **Linking:** an end-to-end run against a stubbed ArcGIS layer worked as follows:
  - Sync linked 3 features and created 2 fields.
  - The keys were stamped on the fields.
  - A second run created no new fields.
  - Feature → forms lookups work by key and by GlobalID.
  - Link issues were detected.
- **UI:** the e2e gate covers the screen (phone, tablet and desktop; Arabic; dark mode; accessibility), plus a test that checks the typed link is what the server receives.

## 5. Note found during the review
`022_multi_tenant.sql` uses `CREATE POLICY IF NOT EXISTS`, which PostgreSQL does not support. A brand-new database therefore stops at that migration. Existing databases are unaffected, because the runner's signature sync already marked it as applied. It can be fixed by wrapping the policies in `DO` blocks.
