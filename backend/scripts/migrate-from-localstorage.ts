import fs from 'fs';
import path from 'path';
import { dbPool } from '../src/db/client';

type MigrationData = {
  masterData?: any;
  harvestData?: any[];
  fertigationData?: any[];
  ecphEntries?: any[];
  recipeDatabase?: any[];
};

function toPolygonWkt(points?: number[][]) {
  if (!points || points.length < 3) return null;
  const coords = points.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
  const first = `${points[0][1]} ${points[0][0]}`;
  return `POLYGON((${coords}, ${first}))`;
}

async function migrate(data: MigrationData) {
  const client = await dbPool.connect();
  const cropIdMap = new Map<string, string>();
  const fieldTypeIdMap = new Map<string, string>();
  const fieldIdMap = new Map<string, string>();

  try {
    await client.query('BEGIN');

    // 1) Crops
    for (const crop of data.masterData?.crops || []) {
      const name = typeof crop === 'string' ? crop : crop.name;
      const dripperCount =
        typeof crop === 'object' && crop.dripper_count !== undefined ? crop.dripper_count : null;
      const result = await client.query(
        `INSERT INTO crops (name, dripper_count)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET dripper_count = $2
         RETURNING id`,
        [name, dripperCount]
      );
      cropIdMap.set(name, result.rows[0].id);
    }

    // 2) Field types
    for (const ft of data.masterData?.fieldTypes || []) {
      const result = await client.query(
        `INSERT INTO field_types (name, naming_pattern, default_valve_count)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET naming_pattern = $2, default_valve_count = $3
         RETURNING id`,
        [ft.name, ft.namingPattern || null, ft.defaultValveCount || 0]
      );
      fieldTypeIdMap.set(ft.name, result.rows[0].id);
    }

    // 3) Countries -> Sites -> Farm Areas -> Fields
    for (const country of data.masterData?.countries || []) {
      const countryResult = await client.query(
        `INSERT INTO countries (name, code)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = $1
         RETURNING id`,
        [country.name, country.code || country.name.slice(0, 3).toUpperCase()]
      );
      const countryId = countryResult.rows[0].id;

      for (const site of country.sites || []) {
        const siteResult = await client.query(
          `INSERT INTO sites (country_id, name, location, total_area)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (country_id, name) DO UPDATE SET location = $3, total_area = $4
           RETURNING id`,
          [countryId, site.name, site.location || null, site.totalArea || null]
        );
        const siteId = siteResult.rows[0].id;

        for (const farmArea of site.farmAreas || []) {
          const faResult = await client.query(
            `INSERT INTO farm_areas (site_id, name, size, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (site_id, name) DO UPDATE SET size = $3, description = $4
             RETURNING id`,
            [siteId, farmArea.name, farmArea.size || null, farmArea.description || null]
          );
          const farmAreaId = faResult.rows[0].id;

          // Farm area crops
          if (Array.isArray(farmArea.crops)) {
            await client.query('DELETE FROM farm_area_crops WHERE farm_area_id = $1', [
              farmAreaId,
            ]);
            for (const cropName of farmArea.crops) {
              const cropId = cropIdMap.get(cropName);
              if (cropId) {
                await client.query(
                  `INSERT INTO farm_area_crops (farm_area_id, crop_id)
                   VALUES ($1, $2)
                   ON CONFLICT DO NOTHING`,
                  [farmAreaId, cropId]
                );
              }
            }
          }

          for (const field of farmArea.fields || []) {
            const fieldTypeId = field.type ? fieldTypeIdMap.get(field.type) : null;
            const cropName =
              typeof field.currentCrop === 'object'
                ? field.currentCrop.name
                : field.currentCrop || field.crop;
            const currentCropId = cropName ? cropIdMap.get(cropName) : null;
            const polygonWkt = toPolygonWkt(field.polygon);

            const fieldResult = await client.query(
              `INSERT INTO fields (
                 farm_area_id, field_type_id, name, current_crop_id,
                 valve_count, area, latitude, longitude, polygon
               )
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,ST_GeomFromText($9, 4326))
               ON CONFLICT (farm_area_id, name) DO UPDATE SET current_crop_id = $4
               RETURNING id`,
              [
                farmAreaId,
                fieldTypeId,
                field.name,
                currentCropId,
                field.valves || field.valveCount || 0,
                field.area || null,
                field.latitude || null,
                field.longitude || null,
                polygonWkt,
              ]
            );
            const fieldId = fieldResult.rows[0].id;
            if (field.id) fieldIdMap.set(String(field.id), fieldId);
            fieldIdMap.set(field.name, fieldId);
          }
        }
      }
    }

    // 4) Harvests
    for (const harvest of data.harvestData || []) {
      const fieldId = fieldIdMap.get(harvest.fieldId) || fieldIdMap.get(harvest.fieldName);
      if (!fieldId) continue;
      const harvestResult = await client.query(
        `INSERT INTO harvests (field_id, date, total_quantity, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [fieldId, harvest.date, harvest.totalQuantity || 0, harvest.notes || null]
      );
      for (const v of harvest.varieties || []) {
        await client.query(
          `INSERT INTO harvest_varieties (harvest_id, variety, quantity, grade)
           VALUES ($1, $2, $3, $4)`,
          [harvestResult.rows[0].id, v.variety, v.quantity || 0, v.grade || null]
        );
      }
    }

    // 5) Fertigation
    for (const entry of data.fertigationData || []) {
      const fieldId = fieldIdMap.get(entry.fieldId);
      if (!fieldId) continue;
      await client.query(
        `INSERT INTO fertigation_entries (
           field_id, recipe_id, date, week_number, flow_rate, frequency,
           valves_count, daily_water, fertilizers, total_fertilizer, cumulative
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          fieldId,
          null,
          entry.date,
          entry.weekNumber || entry.week || null,
          entry.flowRate || null,
          entry.frequency || null,
          entry.valvesCount || entry.valves || null,
          entry.dailyWater || entry.dailyTotalWater || null,
          entry.fertilizers || entry.actualUsage || null,
          entry.totalFertilizer || null,
          entry.cumulative || null,
        ]
      );
    }

    // 6) EC/PH entries
    for (const entry of data.ecphEntries || []) {
      const fieldId = fieldIdMap.get(entry.fieldId);
      if (!fieldId) continue;
      const ecphResult = await client.query(
        `INSERT INTO ecph_entries (
           field_id, date, time, qty_of_water, cycle,
           total_water_qty, field_total_water_based_on_drip, dripper_count
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          fieldId,
          entry.date,
          entry.time || null,
          entry.qtyOfWater || null,
          entry.cycle || null,
          entry.totalWaterQty || null,
          entry.fieldTotalWaterBasedOnDrip || null,
          entry.dripperCount || null,
        ]
      );
      const entryId = ecphResult.rows[0].id;
      for (const reading of entry.valveReadings || []) {
        await client.query(
          `INSERT INTO ecph_valve_readings (
             ecph_entry_id, valve_number, drip_volume, ec, ph,
             drain, percent_drain, total_water_based_on_drip
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            entryId,
            reading.valveNumber,
            reading.dripVolume || null,
            reading.ec || null,
            reading.ph || null,
            reading.drain || null,
            reading.percentDrain || null,
            reading.totalWaterBasedOnDrip || null,
          ]
        );
      }
    }

    // 7) Recipes
    for (const recipe of data.recipeDatabase || []) {
      const recipeResult = await client.query(
        `INSERT INTO recipes (name, description, tank_volume, cycles, element_ppm)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (name) DO UPDATE SET description = $2
         RETURNING id`,
        [
          recipe.recipeName || recipe.name,
          recipe.description || null,
          recipe.tankVolume || null,
          recipe.cycles || null,
          recipe.elementPPM || recipe.elementPpm || null,
        ]
      );
      const recipeId = recipeResult.rows[0].id;
      for (const f of recipe.fertilizers || []) {
        await client.query(
          `INSERT INTO recipe_fertilizers (
             recipe_id, name, dose, kg_per_liter, element, concentration
           )
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            recipeId,
            f.name,
            f.dose || null,
            f.kgPerLiter || null,
            f.element || null,
            f.concentration || null,
          ]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: ts-node scripts/migrate-from-localstorage.ts <path-to-json>');
  process.exit(1);
}

const absolutePath = path.resolve(filePath);
const raw = fs.readFileSync(absolutePath, 'utf-8');
const parsed = JSON.parse(raw) as MigrationData;

migrate(parsed)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
