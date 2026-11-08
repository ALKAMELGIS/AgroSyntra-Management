# Soil properties (OpenLandMap)

Global soil maps from **OpenLandMap / OpenGeoHub** (Hengl et al.): 250 m resolution, standard depths 0, 10, 30, 60, 100 and 200 cm. They are used on GIS Map, in field profiles and by the AI assistant.

**Only for open fields and pivots** (farm plots too). They are never used for Greenhouse, Net house, Glasshouse, Shade house, Tunnel or Cravo, which grow on substrate or managed soil. The same rule applies on the map, on the server and in the assistant.

## Properties
| Key | Property | Unit | Stored value → shown |
|---|---|---|---|
| ph | Soil pH (H2O) | pH | ÷ 10 |
| organic_carbon | Organic carbon | g/kg | × 5 |
| clay | Clay | % | as is |
| sand | Sand | % | as is |
| bulk_density | Bulk density | kg/m³ | × 10 |
| water_33kpa | Water at field capacity (33 kPa) | % vol | as is |
| texture | USDA texture class | class | 1 Clay … 12 Sand |

Values are **modelled, not lab results**. Use them to compare places and plan sampling, and confirm with a lab test before fertiliser decisions.

## How values are read
The layers are Cloud-Optimized GeoTIFFs (several GB each, EPSG:4326).
- The server finds each file through its Zenodo record. The concept record always resolves to the latest version:

  | Property | Zenodo record |
  |---|---|
  | pH | 1475459 |
  | Organic carbon | 1475457 |
  | Clay | 1476854 |
  | Sand | 1476851 |
  | Bulk density | 2525665 |
  | Water at 33 kPa | 2629589 |
  | Texture class | 1475451 |

- It reads **only the bytes around the point** with HTTP range requests (`geotiff` library).
- Results are cached in memory for 7 days.
- `OPENLANDMAP_COG_BASE` can point to a mirror with the same file names, such as an internal bucket or `https://s3.openlandmap.org/arco`.

## Where it is
- **GIS Map → Soil icon** (remote sensing tool bar):
  - The icon switches the tool on directly; there is no side panel.
  - A soil bar appears at the bottom of the map, beside the legend, with depth chips, the result, CSV export and close.
  - Click an open field or pivot to see the profile by depth. A greenhouse, net house or other protected structure, or a point outside any field, gives a message instead.
- **Field profile:** `POST /api/v1/soil-grids/fields/:id/refresh` samples a point inside the field polygon and stores the values in `field_soil_properties` (migration 177). `GET /soil-grids/fields/:id` reads them back. Both check field access and field type.
- **AI assistant:** the `soil_properties` tool answers for a field (saved profile first, otherwise read at the field) or for a latitude/longitude. It answers "not applicable" for protected structures.
- **API:** `GET /soil-grids/datasets`, and `GET /soil-grids/point?lat&lon&depths` (refused inside a protected field).

## Not tested live
The development environment cannot reach Zenodo or OpenLandMap. The file lookup and the range reads were tested with a generated GeoTIFF of the same format, served over HTTP with byte ranges. Check one field on the real system.
