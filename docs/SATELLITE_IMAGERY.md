# Satellite imagery on GIS Map (Sentinel-2)

Remote-sensing tools sit in a second icon bar on the **opposite edge of GIS Map**: the right side in English, the left side in Arabic. Each icon opens its own docked panel. The imagery is Sentinel-2 L2A, served by Sentinel Hub or Copernicus Data Space.

## Setup (CEO)
**Settings → API Keys → Satellite imagery**

1. Paste the **Configuration ID** (instance ID) from your Sentinel Hub or Copernicus Data Space dashboard. An optional name helps you recognise it later, for example "Public Data (featured collections)".
2. **Test** checks the ID against the chosen service (and the other service if the first fails) and lists the layers it found.
3. **Save** works only after a successful check. It stores:
   - the ID, **encrypted** (`system_settings.sentinelhub_instance_id`);
   - the service that answered;
   - the layer used as the data source.

The ID is never sent to the browser. Settings shows only a masked form, and map tiles go through the server.

If nothing is saved, the server falls back to `SENTINELHUB_INSTANCE_ID` / `SENTINELHUB_WMS_URL` in `backend/.env`.

## Tools (icon bar)
| Icon | Tool | What it does |
|---|---|---|
| Satellite | **Index layers** | Gallery grouped as All · Vegetation · Water & moisture · Soil · Band combinations, plus Show on map, opacity, formula and legend. |
| Eye | **Show / hide** | Turns the satellite image on or off. |
| Calendar | **Imagery date & scenes** | Start and end dates, a cloud-cover filter (≤ %), and **Search scenes**, which lists each acquisition date with its cloud % and tile count. Pick a scene, or use the best image of the period. |
| Pentagon | **Area of interest** | Set the AOI by drawing on the map, uploading GeoJSON / KML, picking a field from the visible GIS layers, or going to coordinates. Shows the area in ha. **Clip image to AOI (mask)**, zoom and clear. |
| Compare | **Change detection** | Date B shown on the other side of a draggable swipe handle. The handle also moves with the arrow keys. |
| Chart | **Time series** | Mean index over the AOI for every clear scene in the period, with a min–max band and CSV export. |
| Info | **Metadata** | Satellite, service, layer, formula, date, cloud filter, resolution, revisit and AOI. |
| Download | **Download image** | PNG of the AOI (or the current view) for the chosen index and date. |

A small legend appears on the map while an index is shown.

## Indices
Each index is computed by AgroCloud's own script on the server, so it works with any configuration ID. The browser can only pick from this list.

| Key | Formula | Use |
|---|---|---|
| NDVI | (B08 − B04) / (B08 + B04) | vegetation health |
| SAVI | 1.5 × (B08 − B04) / (B08 + B04 + 0.5) | young crops / bright soil |
| NDWI | (B03 − B08) / (B03 + B08) | open water |
| NDMI | (B08 − B11) / (B08 + B11) | canopy moisture |
| NDII | (B08 − B11) / (B08 + B11) | infrared water content (same Sentinel-2 bands as NDMI) |
| MSI | B11 / B08 | moisture stress |
| BSI | ((B11 + B04) − (B08 + B02)) / ((B11 + B04) + (B08 + B02)) | bare soil |
| TRUE_COLOR / FALSE_COLOR / SWIR | band combinations | visual reading |

## Server (backend)
- `GET /api/v1/satellite/wms?k=…` — the tile proxy.
  - No sign-in header, because map tiles are plain images. Instead it needs a signed **tile key** (`GET /satellite/tile-key`, valid 12 h, HMAC with the server secret).
  - Only plain GetMap parameters are passed on: layer, bbox, size ≤ 1024, EPSG:3857 / 4326, date, cloud.
  - `INDEX` selects one of the scripts above.
  - `GEOMETRY` must be a numbers-only WKT polygon; it clips the image to the AOI.
- `GET /satellite/status`, `/indices`, `/layers`, `/scenes` (WFS, Sentinel-2 L2A), `POST /satellite/stats` (FIS time series): all require sign-in.
- `POST /satellite/token` and the other satellite routes now **require sign-in**. Before, `/satellite/token` could be reached without it.
- Settings: `GET|PUT|DELETE /settings/sentinelhub` and `POST /settings/sentinelhub/test` (CEO).

## Limits
- **Time series** uses the Sentinel Hub statistics service (FIS). Copernicus Data Space configurations do not offer it, and the panel says so.
- **Not built yet:**
  - **Clusterization** (raster → zones) needs the Processing API, with an OAuth client ID and secret.
  - **Notifications** for new scenes need a scheduled job.
- These tools could not be tested against the live service from the development environment (no internet access there). They were tested with recorded service answers, and need one check on the real system after saving the ID.
