"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../db/client', () => ({
    dbPool: { query: jest.fn() },
}));
const client_1 = require("../../db/client");
const gisLayer_service_1 = require("../gisLayer.service");
const query = client_1.dbPool.query;
function emptyCache() {
    return {
        countries: new Map(),
        sites: new Map(),
        farmAreas: new Map(),
        fieldTypes: new Map(),
        fields: new Map(),
    };
}
const ORG = 'org-1';
const GIS_PROPS = {
    ZONE_ID: 'MH',
    SITE: '1',
    Structure_Type: 'Greenhouse',
    Farm_Name: 'GH-01',
};
beforeEach(() => {
    query.mockReset();
});
function dispatch(handlers) {
    query.mockImplementation(async (sql, params = []) => {
        const text = sql.replace(/\s+/g, ' ');
        for (const [needle, handler] of Object.entries(handlers)) {
            if (text.includes(needle))
                return handler(sql, params);
        }
        return { rows: [] };
    });
}
describe('ensureHierarchy', () => {
    it('stamps organization_id on new countries and sites', async () => {
        const inserts = [];
        dispatch({
            'INSERT INTO countries': (sql, params) => {
                inserts.push({ sql, params });
                return { rows: [{ id: 'country-1' }] };
            },
            'INSERT INTO sites': (sql, params) => {
                inserts.push({ sql, params });
                return { rows: [{ id: 'site-1' }] };
            },
            'INSERT INTO farm_areas': (_sql, _params) => ({ rows: [{ id: 'area-1' }] }),
            'INSERT INTO field_types': (_sql, _params) => ({ rows: [{ id: 'type-1' }] }),
        });
        const result = await (0, gisLayer_service_1.ensureHierarchy)(GIS_PROPS, emptyCache(), ORG);
        expect(result).toEqual({ farmAreaId: 'area-1', fieldTypeId: 'type-1' });
        const country = inserts.find((c) => c.sql.includes('INSERT INTO countries'));
        const site = inserts.find((c) => c.sql.includes('INSERT INTO sites'));
        expect(country?.sql).toMatch(/organization_id/);
        expect(country?.params).toEqual(['MH', 'MH', ORG]);
        expect(site?.sql).toMatch(/organization_id/);
        expect(site?.params).toEqual(['country-1', 'Site 1', ORG]);
    });
    it('heals NULL organization_id on existing countries and sites', async () => {
        const heals = [];
        dispatch({
            'FROM countries': () => ({ rows: [{ id: 'country-1', deleted_at: null }] }),
            'FROM sites': () => ({ rows: [{ id: 'site-1', deleted_at: null }] }),
            'FROM farm_areas': () => ({ rows: [{ id: 'area-1', deleted_at: null }] }),
            'FROM field_types': () => ({ rows: [{ id: 'type-1' }] }),
            'SET organization_id = $2': (sql, params) => {
                heals.push({ sql, params });
                return { rows: [] };
            },
        });
        await (0, gisLayer_service_1.ensureHierarchy)(GIS_PROPS, emptyCache(), ORG);
        expect(heals.some((h) => h.sql.includes('UPDATE countries') && h.params[0] === 'country-1' && h.params[1] === ORG)).toBe(true);
        expect(heals.some((h) => h.sql.includes('UPDATE sites') && h.params[0] === 'site-1' && h.params[1] === ORG)).toBe(true);
    });
});
describe('findOrCreateField', () => {
    it('inserts organization_id on a new GIS field', async () => {
        let fieldInsert;
        dispatch({
            'INSERT INTO countries': () => ({ rows: [{ id: 'country-1' }] }),
            'INSERT INTO sites': () => ({ rows: [{ id: 'site-1' }] }),
            'INSERT INTO farm_areas': () => ({ rows: [{ id: 'area-1' }] }),
            'INSERT INTO field_types': () => ({ rows: [{ id: 'type-1' }] }),
            'INSERT INTO fields': (sql, params) => {
                fieldInsert = { sql, params };
                return { rows: [{ id: 'field-1' }] };
            },
        });
        const created = await (0, gisLayer_service_1.findOrCreateField)(GIS_PROPS, emptyCache(), ORG);
        expect(created).toEqual({ fieldId: 'field-1', farmAreaId: 'area-1' });
        expect(fieldInsert?.sql).toMatch(/organization_id/);
        expect(fieldInsert?.params).toEqual(['area-1', 'type-1', 'GH-01', null, ORG]);
    });
});
