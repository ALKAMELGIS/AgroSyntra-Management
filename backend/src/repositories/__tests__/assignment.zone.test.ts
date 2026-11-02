/**
 * AssignmentRepository: a farm manager reaches every site inside a zone
 * assigned to them, plus sites assigned directly — never a site in a zone that
 * is not theirs. Other roles keep site-assignment-only access.
 */
jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

import { dbPool } from '../../db/client';
import { AssignmentRepository, farmManagerSiteAccessSql } from '../assignment.repository';

const repo = new AssignmentRepository();

// zone -> sites; FM is assigned zone Z1 and site S3 (in Z2) directly.
const sites: Record<string, { zone: string; org: string }> = {
  S1: { zone: 'Z1', org: 'org-1' },
  S2: { zone: 'Z2', org: 'org-1' },
  S3: { zone: 'Z2', org: 'org-1' },
  S4: { zone: 'Z1', org: 'org-2' }, // same zone id, other org: never reachable
};
const zoneAssign = new Set(['fm:Z1']);
const siteAssign = new Set(['fm:S3', 'om:S2']);

function fmCanReach(userId: string, siteId: string) {
  const s = sites[siteId];
  return siteAssign.has(`${userId}:${siteId}`) || (zoneAssign.has(`${userId}:${s.zone}`) && s.org === 'org-1');
}

const query = dbPool.query as jest.Mock;

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (sql: string, params: any[]) => {
    const t = sql.replace(/\s+/g, ' ').trim();
    if (t.startsWith('SELECT s.id FROM sites s WHERE s.organization_id = $2')) {
      const [userId, org] = params;
      return { rows: Object.keys(sites).filter((id) => sites[id].org === org && fmCanReach(userId, id)).map((id) => ({ id })) };
    }
    if (t.startsWith('SELECT 1 FROM sites s WHERE s.id = $2')) {
      const [userId, siteId, org] = params;
      return { rows: sites[siteId]?.org === org && fmCanReach(userId, siteId) ? [{ x: 1 }] : [] };
    }
    if (t.startsWith('SELECT usa.site_id FROM user_site_assignments usa JOIN sites')) {
      const [userId, org] = params;
      return { rows: Object.keys(sites).filter((id) => sites[id].org === org && siteAssign.has(`${userId}:${id}`)).map((site_id) => ({ site_id })) };
    }
    if (t.startsWith('SELECT 1 FROM user_site_assignments usa JOIN sites s')) {
      const [userId, siteId] = params;
      return { rows: siteAssign.has(`${userId}:${siteId}`) ? [{ x: 1 }] : [] };
    }
    if (t.startsWith('SELECT uza.country_id FROM user_zone_assignments uza')) {
      return { rows: [...zoneAssign].filter((k) => k.startsWith(`${params[0]}:`)).map((k) => ({ country_id: k.split(':')[1] })) };
    }
    if (t.startsWith('SELECT DISTINCT country_id FROM sites WHERE id = ANY')) {
      return { rows: Array.from(new Set((params[0] as string[]).map((id) => sites[id].zone))).map((country_id) => ({ country_id })) };
    }
    throw new Error(`Unexpected SQL: ${t.slice(0, 80)}`);
  });
});

describe('farm manager zone access', () => {
  it('lists sites in their zone plus directly assigned sites, nothing else', async () => {
    const ids = await repo.getUserAccessibleSiteIds('fm', 'farm_manager', 'org-1');
    expect(ids.sort()).toEqual(['S1', 'S3']);
  });

  it('can reach a site via their zone, not a site in a zone that is not theirs', async () => {
    expect(await repo.canUserAccessSite('fm', 'farm_manager', 'S1', 'org-1')).toBe(true);
    expect(await repo.canUserAccessSite('fm', 'farm_manager', 'S3', 'org-1')).toBe(true);
    expect(await repo.canUserAccessSite('fm', 'farm_manager', 'S2', 'org-1')).toBe(false);
    expect(await repo.canUserAccessSite('fm', 'farm_manager', 'S4', 'org-2')).toBe(false);
  });

  it('a farm manager with no assignments reaches nothing', async () => {
    expect(await repo.getUserAccessibleSiteIds('fm-none', 'farm_manager', 'org-1')).toEqual([]);
  });

  it('accessible zones include assigned zones and zones of direct sites', async () => {
    const ids = await repo.getUserAccessibleZoneIds('fm', 'farm_manager', 'org-1');
    expect(ids.sort()).toEqual(['Z1', 'Z2']);
    expect(await repo.getUserAssignedZoneIds('fm', 'farm_manager', 'org-1')).toEqual(['Z1']);
  });

  it('zone assignments do nothing for other roles', async () => {
    zoneAssign.add('om:Z1');
    try {
      expect(await repo.getUserAccessibleSiteIds('om', 'operation_manager', 'org-1')).toEqual(['S2']);
      expect(await repo.canUserAccessSite('om', 'operation_manager', 'S1', 'org-1')).toBe(false);
      expect(await repo.getUserAssignedZoneIds('om', 'operation_manager', 'org-1')).toEqual([]);
    } finally {
      zoneAssign.delete('om:Z1');
    }
  });

  it('the shared SQL checks both direct and zone assignments, scoped to the site org', () => {
    const sql = farmManagerSiteAccessSql('s', '$1');
    expect(sql).toContain('user_site_assignments');
    expect(sql).toContain('user_zone_assignments');
    expect(sql).toContain('c_fm.organization_id = s.organization_id');
    expect(sql).toContain('c_fm.deleted_at IS NULL');
  });
});
