"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const seasons_service_1 = require("../../services/seasons.service");
const cropHistoryListSql_1 = require("../cropHistoryListSql");
describe('CROP_HISTORY_LIST_SQL', () => {
    it('scopes cycles to field + crop + the rotation row season', () => {
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('pr.crop_id IS NOT DISTINCT FROM ch.crop_id');
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('pr.season_id IS NOT DISTINCT FROM ch.season_id');
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('ofp.crop_id IS NOT DISTINCT FROM ch.crop_id');
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('ofp.season_id IS NOT DISTINCT FROM ch.season_id');
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('MAX(cyc.cycle_number)');
    });
    it('pairs latest uproot date and reason and prefers a user reason', () => {
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('ORDER BY');
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain(`u.uproot_reason = '${seasons_service_1.SEASON_CLOSED_REASON}'`);
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('u.uprooted_at DESC');
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('LIMIT 1');
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('p.crop_history_id = ch.id');
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('p.uprooted_at::date >= ch.start_date');
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).toContain('migrated_to_planting_record_id IS NULL');
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).not.toContain("status = 'active'");
        expect(cropHistoryListSql_1.CROP_HISTORY_LIST_SQL).not.toContain('field_type');
    });
});
