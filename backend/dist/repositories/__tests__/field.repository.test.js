"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../db/client', () => ({
    dbPool: {
        query: jest.fn(),
        connect: jest.fn(),
    },
}));
const client_1 = require("../../db/client");
const field_repository_1 = require("../field.repository");
const query = client_1.dbPool.query;
const connect = client_1.dbPool.connect;
describe('FieldRepository.create', () => {
    it('stamps organization_id on insert', async () => {
        query.mockResolvedValue({ rows: [{ postgis: '3' }] });
        const clientQuery = jest.fn(async (sql, params) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK')
                return { rows: [] };
            return {
                rows: [{
                        id: 'field-1',
                        farm_area_id: 'area-1',
                        field_type_id: null,
                        name: 'GH-01',
                        current_crop_id: null,
                        variety_id: null,
                        valve_count: 0,
                        area: null,
                        latitude: null,
                        longitude: null,
                        polygon_geojson: null,
                        created_at: '2026-01-01',
                        updated_at: '2026-01-01',
                        deleted_at: null,
                        organization_id: params?.[10],
                    }],
            };
        });
        connect.mockResolvedValue({
            query: clientQuery,
            release: jest.fn(),
        });
        const repo = new field_repository_1.FieldRepository();
        await repo.create({
            farmAreaId: 'area-1',
            name: 'GH-01',
            organizationId: 'org-1',
        });
        const insert = clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO fields'));
        expect(insert).toBeDefined();
        expect(String(insert[0])).toMatch(/organization_id/);
        expect(insert[1]).toEqual([
            'area-1',
            null,
            'GH-01',
            null,
            0,
            null,
            null,
            null,
            null,
            null,
            'org-1',
        ]);
    });
});
