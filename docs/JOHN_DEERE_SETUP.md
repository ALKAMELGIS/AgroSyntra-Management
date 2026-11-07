# John Deere Operations Center — setup guide

AgroCloud reads **field operations** (seeding, application, harvest, tillage, carting) from
John Deere Operations Center through the official Field Operations API
(<https://developer.deere.com/dev-docs/field-operations>). Screen: **Settings → John Deere**
(`/admin/integrations/john-deere`, CEO and Operations Manager).

## 1. Create the app on developer.deere.com
1. Sign in at <https://developer.deere.com> → *My Applications* → **Create application**.
2. Add the **Redirect URI** shown on AgroCloud's *App settings* step (copy button), e.g.
   `https://api.your-farm.com/api/v1/integrations/john-deere/callback`. It must match exactly.
3. Request access to the **Field Operations / Agronomic data** APIs (scope `ag1`).
4. Copy the **Client ID** and **Client secret**.

New apps start in **Sandbox** (`sandboxapi.deere.com`): one test account, up to 5 organizations,
<150k calls/month. After John Deere approves the app, switch AgroCloud to **Production**
(`partnerapi.deere.com`) — this asks for sign-in again.

## 2. Connect in AgroCloud (5 steps)
| Step | What happens |
|---|---|
| App settings | Environment + Client ID/secret + redirect URI. The secret is stored encrypted (AES-256-GCM) and never returned. |
| Sign in | OAuth 2 with John Deere (`openid profile offline_access ag1`). Tokens are encrypted and refreshed automatically. |
| Organization | Organizations that are not yet shared show **Share with AgroCloud** (Deere's connections page) — approve there, come back, choose the organization. |
| Fields | Each Deere field is linked to an AgroCloud field; same names are suggested. Only linked fields sync. |
| Sync | Crop season and/or date range + operation types. Long ranges are split into Deere's 7-day windows; pages follow `nextPage`. |

## 3. Where the data goes
Rows are kept in `john_deere_field_operations` (area, yield, moisture, rates with units, products,
varieties, raw payload) and shown in *Operations from John Deere*. They are **not** written into
AgroCloud's own harvest / application records, which keep their approval and PHI checks.

## Server configuration
- `SECRET_BOX_KEY` — encryption key for stored secrets (falls back to `JWT_SECRET`; changing it means signing in again).
- `JOHN_DEERE_REDIRECT_URI` — default callback address when the API is not under `APP_URL`.
- Migration `173_john_deere_integration.sql`.

## API (backend `/api/v1/integrations/john-deere`)
`GET /status` · `PUT /settings` · `POST /authorize` · `GET /callback` (public) · `GET /organizations` ·
`PUT /organization` · `GET /fields` · `PUT /field-mapping` · `POST /sync` · `GET /operations` · `POST /disconnect`
