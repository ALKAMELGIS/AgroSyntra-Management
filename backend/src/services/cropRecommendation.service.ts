import { dbPool } from '../db/client';

interface CropRecommendation {
  crop_name: string;
  crop_id: string;
  score: number;
  reasoning: string[];
}

/**
 * Rule-based crop recommendation engine.
 * Based on field's EC/pH history, weather, past yields, and rotation rules.
 */
export async function recommendCrops(fieldId: string): Promise<CropRecommendation[]> {
  // 1. Get all available crops
  const cropsResult = await dbPool.query('SELECT id, name FROM crops ORDER BY name');
  const allCrops = cropsResult.rows;

  // 2. Get field's current and past crops
  const fieldResult = await dbPool.query(
    `SELECT f.current_crop_id, c.name as current_crop_name
     FROM fields f
     LEFT JOIN crops c ON c.id = f.current_crop_id
     WHERE f.id = $1`,
    [fieldId]
  );
  const currentCropId = fieldResult.rows[0]?.current_crop_id;
  const currentCropName = fieldResult.rows[0]?.current_crop_name;

  // 3. Get average EC/pH for this field (last 60 days)
  const ecphResult = await dbPool.query(
    `SELECT AVG(vr.ec) as avg_ec, AVG(vr.ph) as avg_ph
     FROM ecph_valve_readings vr
     JOIN ecph_entries e ON e.id = vr.ecph_entry_id
     WHERE e.field_id = $1 AND e.date >= CURRENT_DATE - INTERVAL '60 days'`,
    [fieldId]
  );
  const avgEc = parseFloat(ecphResult.rows[0]?.avg_ec) || null;
  const avgPh = parseFloat(ecphResult.rows[0]?.avg_ph) || null;

  // 4. Get recent weather summary
  const weatherResult = await dbPool.query(
    `SELECT AVG(max_temp) as avg_temp, AVG(avg_rh) as avg_humidity
     FROM weather_logs WHERE date >= CURRENT_DATE - INTERVAL '14 days'`
  );
  const avgTemp = parseFloat(weatherResult.rows[0]?.avg_temp) || null;

  // 5. Get historical yield performance per crop on this field
  const yieldResult = await dbPool.query(
    `SELECT c.id as crop_id, c.name as crop_name, AVG(h.total_quantity) as avg_yield, COUNT(*) as harvest_count
     FROM harvests h
     JOIN fields f ON f.id = h.field_id
     JOIN crops c ON c.id = f.current_crop_id
     WHERE h.field_id = $1
     GROUP BY c.id, c.name`,
    [fieldId]
  );
  const yieldByCrop: Record<string, { avg: number; count: number }> = {};
  yieldResult.rows.forEach((r: any) => {
    yieldByCrop[r.crop_id] = { avg: parseFloat(r.avg_yield), count: parseInt(r.harvest_count) };
  });

  // 6. Score each crop
  const recommendations: CropRecommendation[] = allCrops.map((crop: any) => {
    let score = 50; // Base score
    const reasoning: string[] = [];

    // Crop rotation: penalize replanting the same crop
    if (crop.id === currentCropId) {
      score -= 20;
      reasoning.push(`Currently planted — crop rotation recommended`);
    } else {
      score += 5;
      reasoning.push(`Different from current crop (${currentCropName || 'none'}) — good for rotation`);
    }

    // Historical performance on this field
    const yieldData = yieldByCrop[crop.id];
    if (yieldData) {
      if (yieldData.avg > 0) {
        score += Math.min(20, yieldData.count * 5);
        reasoning.push(`Previously yielded ${yieldData.avg.toFixed(1)} avg across ${yieldData.count} harvests on this field`);
      }
    } else {
      reasoning.push(`No previous yield data on this field`);
    }

    // EC suitability (general: most crops prefer EC 1.0-3.0)
    if (avgEc !== null) {
      if (avgEc >= 1.0 && avgEc <= 2.5) {
        score += 10;
        reasoning.push(`EC level (${avgEc.toFixed(1)}) is in ideal range`);
      } else if (avgEc > 3.5) {
        score -= 10;
        reasoning.push(`EC level (${avgEc.toFixed(1)}) is high — salt-tolerant crops preferred`);
      }
    }

    // pH suitability (most crops prefer 5.5-7.0)
    if (avgPh !== null) {
      if (avgPh >= 5.5 && avgPh <= 7.0) {
        score += 10;
        reasoning.push(`pH level (${avgPh.toFixed(1)}) is in optimal range`);
      } else if (avgPh > 8.0 || avgPh < 5.0) {
        score -= 10;
        reasoning.push(`pH level (${avgPh.toFixed(1)}) is outside optimal range`);
      }
    }

    // Temperature suitability
    if (avgTemp !== null) {
      if (avgTemp > 35) {
        score += 5;
        reasoning.push(`Hot climate (${avgTemp.toFixed(0)}°C) — heat-tolerant varieties recommended`);
      } else if (avgTemp < 15) {
        score += 5;
        reasoning.push(`Cool climate (${avgTemp.toFixed(0)}°C) — cool-season crops favored`);
      }
    }

    return {
      crop_name: crop.name,
      crop_id: crop.id,
      score: Math.max(0, Math.min(100, score)),
      reasoning,
    };
  });

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations.slice(0, 5); // Top 5 recommendations
}
