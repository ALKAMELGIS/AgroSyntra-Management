import { SEASON_CLOSED_REASON } from '../../services/seasons.service';
import { CROP_HISTORY_LIST_SQL } from '../cropHistoryListSql';

describe('CROP_HISTORY_LIST_SQL', () => {
  it('scopes cycles to field + crop + the rotation row season', () => {
    expect(CROP_HISTORY_LIST_SQL).toContain('pr.crop_id IS NOT DISTINCT FROM ch.crop_id');
    expect(CROP_HISTORY_LIST_SQL).toContain('pr.season_id IS NOT DISTINCT FROM ch.season_id');
    expect(CROP_HISTORY_LIST_SQL).toContain('ofp.crop_id IS NOT DISTINCT FROM ch.crop_id');
    expect(CROP_HISTORY_LIST_SQL).toContain('ofp.season_id IS NOT DISTINCT FROM ch.season_id');
    expect(CROP_HISTORY_LIST_SQL).toContain('MAX(cyc.cycle_number)');
  });

  it('pairs latest uproot date and reason and prefers a user reason', () => {
    expect(CROP_HISTORY_LIST_SQL).toContain('ORDER BY');
    expect(CROP_HISTORY_LIST_SQL).toContain(`u.uproot_reason = '${SEASON_CLOSED_REASON}'`);
    expect(CROP_HISTORY_LIST_SQL).toContain('u.uprooted_at DESC');
    expect(CROP_HISTORY_LIST_SQL).toContain('LIMIT 1');
    expect(CROP_HISTORY_LIST_SQL).toContain('p.crop_history_id = ch.id');
    expect(CROP_HISTORY_LIST_SQL).toContain('p.uprooted_at::date >= ch.start_date');
    expect(CROP_HISTORY_LIST_SQL).toContain('migrated_to_planting_record_id IS NULL');
    expect(CROP_HISTORY_LIST_SQL).not.toContain("status = 'active'");
    expect(CROP_HISTORY_LIST_SQL).not.toContain('field_type');
  });
});
