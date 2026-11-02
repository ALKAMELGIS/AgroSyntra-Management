"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIrrigationAdvice = getIrrigationAdvice;
const client_1 = require("../db/client");
/**
 * Generate irrigation advice for a field based on weather, crop, and recent data.
 */
async function getIrrigationAdvice(fieldId) {
    const reasoning = [];
    let score = 0; // positive = increase, negative = decrease
    // 1. Get field info and current crop
    const fieldResult = await client_1.dbPool.query(`SELECT f.id, f.name, c.name as crop_name
     FROM fields f
     LEFT JOIN crops c ON c.id = f.current_crop_id
     WHERE f.id = $1`, [fieldId]);
    const field = fieldResult.rows[0];
    const cropName = field?.crop_name || null;
    // 2. Get recent weather (last 3 days)
    const weatherResult = await client_1.dbPool.query(`SELECT
       AVG(max_temp) as avg_max_temp,
       AVG(avg_rh) as avg_humidity,
       SUM(COALESCE(rainfall, 0)) as total_rainfall
     FROM weather_logs
     WHERE date >= CURRENT_DATE - INTERVAL '3 days'`);
    const weather = weatherResult.rows[0] || {};
    const avgTemp = parseFloat(weather.avg_max_temp) || null;
    const avgHumidity = parseFloat(weather.avg_humidity) || null;
    const recentRainfall = parseFloat(weather.total_rainfall) || 0;
    // 3. Get recent fertigation data (last 3 days for this field)
    const fertigationResult = await client_1.dbPool.query(`SELECT AVG(daily_water) as avg_water
     FROM fertigation_entries
     WHERE field_id = $1 AND date >= CURRENT_DATE - INTERVAL '3 days'`, [fieldId]);
    const lastWaterUsage = parseFloat(fertigationResult.rows[0]?.avg_water) || 0;
    // 4. Analyze temperature
    if (avgTemp !== null) {
        if (avgTemp > 38) {
            score += 3;
            reasoning.push(`High temperature (${avgTemp.toFixed(1)}°C) — plants need more water to prevent heat stress`);
        }
        else if (avgTemp > 32) {
            score += 1;
            reasoning.push(`Warm temperature (${avgTemp.toFixed(1)}°C) — slightly increase irrigation`);
        }
        else if (avgTemp < 15) {
            score -= 2;
            reasoning.push(`Cool temperature (${avgTemp.toFixed(1)}°C) — reduced evapotranspiration, less water needed`);
        }
        else {
            reasoning.push(`Moderate temperature (${avgTemp.toFixed(1)}°C) — normal irrigation levels`);
        }
    }
    // 5. Analyze humidity
    if (avgHumidity !== null) {
        if (avgHumidity < 30) {
            score += 2;
            reasoning.push(`Low humidity (${avgHumidity.toFixed(0)}%) — higher evaporation rate`);
        }
        else if (avgHumidity > 70) {
            score -= 1;
            reasoning.push(`High humidity (${avgHumidity.toFixed(0)}%) — lower evaporation, can reduce slightly`);
        }
    }
    // 6. Analyze recent rainfall
    if (recentRainfall > 20) {
        score -= 3;
        reasoning.push(`Significant rainfall (${recentRainfall.toFixed(1)}mm in 3 days) — reduce irrigation substantially`);
    }
    else if (recentRainfall > 5) {
        score -= 1;
        reasoning.push(`Some rainfall (${recentRainfall.toFixed(1)}mm in 3 days) — adjust down slightly`);
    }
    else {
        reasoning.push(`No significant rainfall in the last 3 days`);
    }
    // 7. Determine recommendation
    let recommendation;
    if (score >= 2)
        recommendation = 'increase';
    else if (score <= -2)
        recommendation = 'decrease';
    else
        recommendation = 'maintain';
    const confidence = Math.min(100, 50 + Math.abs(score) * 10);
    return {
        recommendation,
        confidence,
        reasoning,
        suggestedWaterLiters: lastWaterUsage > 0 ? Math.round(lastWaterUsage * (1 + score * 0.1)) : undefined,
        factors: {
            temperature: avgTemp,
            humidity: avgHumidity,
            recentRainfall,
            lastWaterUsage,
            cropType: cropName,
        },
    };
}
