"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gisOrgStamp_1 = require("../gisOrgStamp");
describe('stampOrgIfNullSql', () => {
    it('updates countries, sites, and fields without overwriting an existing org', () => {
        expect((0, gisOrgStamp_1.stampOrgIfNullSql)('countries')).toContain('UPDATE countries SET organization_id = $2');
        expect((0, gisOrgStamp_1.stampOrgIfNullSql)('sites')).toContain('UPDATE sites SET organization_id = $2');
        expect((0, gisOrgStamp_1.stampOrgIfNullSql)('fields')).toContain('UPDATE fields SET organization_id = $2');
        expect((0, gisOrgStamp_1.stampOrgIfNullSql)('countries')).toContain('organization_id IS NULL');
        expect((0, gisOrgStamp_1.stampOrgIfNullSql)('sites')).toContain('organization_id IS NULL');
        expect((0, gisOrgStamp_1.stampOrgIfNullSql)('fields')).toContain('organization_id IS NULL');
    });
});
