# AgroCloud AI Assistant (AI Agent, phases 1–2 + field data)

The assistant answers questions, builds reports and explains how to use the system. Every answer comes only from AgroCloud's own database, and it never changes data.

## Where it is
- **Top bar:** the ✦ button opens the assistant beside any page.
- **Full page:** **AI Assistant** (`/assistant`), in the General section, lists your chats.
- **Model:** set in **Settings → API Keys → AI Brain** (Claude or OpenAI, model and key). The assistant uses the same setting as the training tutor; there is no separate key.

## How an answer is made
```
question ─► model ─► tools (server) ─► PostgreSQL (bi views + form tables)
                ▲                    │
                └──── tool results ◄─┘   (max 8 rounds)
answer + tables/charts + sources (FORM_ID)
```
The model never connects to the database itself. It can only call these tools:

| Tool | What it does |
|---|---|
| `list_forms` | Lists every form with its FORM_ID, screen, and the number of records the user can see. |
| `describe_form` | Lists a form's fields with their types, plus the location fields and time groupings you can filter or group by. |
| `find_locations` | Finds zones, sites, farm areas and fields by name or code, including ArcGIS ZONE_ID / Farm_Code. |
| `query_records` | Returns records of one form: date range, filters (`eq`, `ne`, `contains`, `gt`, `gte`, `lt`, `lte`, `in`, `is_empty`, `not_empty`), chosen fields, up to 1000 rows. |
| `aggregate_records` | Calculates `sum`, `avg`, `min`, `max`, `count` or `count_distinct`, grouped by zone, site, farm_area, field, field_type, day, week, month, year or any form field. |
| `get_record` | Returns one record in full: values, lines, photos, attachments, comments, location and GIS features. |
| `gis_feature_forms` | Returns the forms recorded on the field linked to an ArcGIS feature. |
| `sensor_readings` | Soil sensor readings per field (moisture %, temperature, EC, pH, depth): the raw readings, or averages and min/max grouped by field, site, zone, day, week or month. Limited to the user's sites. |
| `equipment_positions` | GPS tracking: the last known position and speed of each machine, or one machine's track on a given day. Available only to roles that can open GPS Tracking (CEO, farm manager, operations manager, agronomist, worker). |
| `soil_properties` | Soil properties from the OpenLandMap global soil maps for a field or a point: pH, organic carbon, clay, sand, bulk density, water at field capacity and texture, at standard depths. **Open fields and pivots only.** Values are modelled, not lab results. |
| `show_result` | Shows a result to the user as a table, with Excel / PDF export and an optional bar, line or pie chart. |
| `app_guide` | Lists the screens and paths, so the assistant can answer "how do I…" questions. |

## Safety
- **Same access as the user.**
  - Data is limited to the user's organisation.
  - The CEO sees every site. Everyone else sees only the sites they are assigned (the same rule as `/assignments/my-access`).
  - Records that have no site are visible only to the CEO.
- **Read only.**
  - Every query runs in `BEGIN READ ONLY` with a `statement_timeout` of 10 s.
  - There is no write tool.
- **No free SQL.**
  - Table names come from `form_registry_tables`.
  - Field names must exist in that table; secret columns are hidden.
  - Values are always sent as parameters, never pasted into the SQL.
- **No invented numbers.**
  - The system prompt forbids made-up figures.
  - When nothing is found, the assistant says there is no data.
  - Each answer lists the forms (FORM_ID) it used.
- **Limits:**
  - 60 questions per user per hour.
  - Up to 8 tool rounds per question.
  - The model sees at most 40–60 rows of a result; the user gets the full table.
- **Audit:** the tools called and their inputs are stored with each answer in `ai_messages.tool_calls`, together with the token counts.

## Reports and files
- Tables open with **Excel** (exceljs) and **PDF** buttons.
  - The Excel file has a title row, the source form and FORM_ID, a coloured header, filters and fitted widths, and runs right-to-left in Arabic.
  - The PDF is a printable report in the app font, with Arabic supported; the browser saves it as PDF.
- Charts are bar, line or pie, chosen by the assistant.

## Storage
Migration `176_ai_assistant.sql` adds two tables:
- `ai_conversations` (per user and organisation);
- `ai_messages` (text, tables shown, sources, tool calls, tokens).

No business data is copied into them.

## API
| Method and path | Purpose |
|---|---|
| `GET /api/v1/ai/status` | Whether a key is configured. |
| `GET /api/v1/ai/conversations` | The user's chats. |
| `GET /api/v1/ai/conversations/:id/messages` | Messages of one chat. |
| `DELETE /api/v1/ai/conversations/:id` | Delete a chat. |
| `POST /api/v1/ai/ask` | Body `{ conversationId?, text, lang? }`; returns `{ conversationId, message }`. |

## Next phases (planned)
- **3.** Guidance from form definitions and screen help texts.
- **4.** ~~GPS and soil sensors~~ (done: `equipment_positions`, `sensor_readings`; weather is read through the Weather Log form).
  - Still to do: satellite NDVI, which needs the Sentinel Hub key and is called from the server.
- **5.** Actions: write tools that call the existing services.
  - Each action is shown as a card the user confirms, under the user's own permissions.
  - Sensitive actions go through the change-request approval.
  - Every action is written to the audit log.

## Tests
- `aiTools.test.ts` checks that:
  - only read-only tools exist;
  - queries run read-only with a timeout and are limited to the user's sites, while the CEO is not;
  - injected field names are refused and values stay parameters;
  - tables, charts and sources are attached to the answer;
  - the system prompt rules are present.
- The agent loop was run against the real database with a stand-in model. Two forms, a chart and the stored history worked; a worker without sites saw 0 records; another organisation could not open the chat.
- End-to-end tests:
  - asking a question gives a table, a chart, Excel/PDF buttons and the source form, at 1280 px and 390 px, with the accessibility check passing;
  - the top-bar button opens the panel beside any page.
