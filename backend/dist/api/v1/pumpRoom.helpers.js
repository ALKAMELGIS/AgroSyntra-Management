"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.normalizePumps = normalizePumps;
exports.pumpsToLegacyColumns = pumpsToLegacyColumns;
exports.formatRow = formatRow;
exports.parsePumpsInput = parsePumpsInput;
exports.updatePumpAtIndex = updatePumpAtIndex;
exports.defaultPumpLabels = defaultPumpLabels;
function normalizePumps(row) {
    const raw = row.pumps;
    if (Array.isArray(raw)) {
        return raw.map((p) => ({
            reading: p?.reading != null ? Number(p.reading) : null,
            usage: p?.usage != null ? Number(p.usage) : null,
        }));
    }
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed))
                return normalizePumps({ pumps: parsed });
        }
        catch { /* fall through */ }
    }
    const legacy = [];
    if (row.reading_1 != null || row.usage_1 != null) {
        legacy.push({
            reading: row.reading_1 != null ? Number(row.reading_1) : null,
            usage: row.usage_1 != null ? Number(row.usage_1) : null,
        });
    }
    if (row.reading_2 != null || row.usage_2 != null) {
        legacy.push({
            reading: row.reading_2 != null ? Number(row.reading_2) : null,
            usage: row.usage_2 != null ? Number(row.usage_2) : null,
        });
    }
    return legacy;
}
function pumpsToLegacyColumns(pumps) {
    return {
        reading_1: pumps[0]?.reading ?? null,
        usage_1: pumps[0]?.usage ?? null,
        reading_2: pumps[1]?.reading ?? null,
        usage_2: pumps[1]?.usage ?? null,
    };
}
function formatRow(row) {
    const pumps = normalizePumps(row);
    const legacy = pumpsToLegacyColumns(pumps);
    return { ...row, pumps, ...legacy };
}
function parsePumpsInput(body) {
    if (body.pumps && Array.isArray(body.pumps)) {
        return body.pumps.map((p) => ({
            reading: p.reading ?? null,
            usage: p.usage ?? null,
        }));
    }
    const pumps = [];
    if (body.reading1 != null || body.usage1 != null) {
        pumps.push({ reading: body.reading1 ?? null, usage: body.usage1 ?? null });
    }
    if (body.reading2 != null || body.usage2 != null) {
        pumps.push({ reading: body.reading2 ?? null, usage: body.usage2 ?? null });
    }
    return pumps;
}
function updatePumpAtIndex(existing, pumpIndex, reading) {
    const pumps = [...existing];
    while (pumps.length <= pumpIndex)
        pumps.push({ reading: null, usage: null });
    pumps[pumpIndex] = { ...pumps[pumpIndex], reading };
    return pumps;
}
function defaultPumpLabels(count) {
    return Array.from({ length: count }, (_, i) => `Pump ${i + 1}`);
}
exports.DEFAULT_CONFIG = {
    water_pump_count: 2,
    electricity_pump_count: 2,
    fogger_pump_count: 2,
    water_pump_labels: ['Pump 1', 'Pump 2'],
    electricity_pump_labels: ['Pump 1', 'Pump 2'],
    fogger_pump_labels: ['Pump 1', 'Pump 2'],
};
