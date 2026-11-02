import { stampOrgIfNullSql } from '../gisOrgStamp';

describe('stampOrgIfNullSql', () => {
  it('updates countries, sites, and fields without overwriting an existing org', () => {
    expect(stampOrgIfNullSql('countries')).toContain('UPDATE countries SET organization_id = $2');
    expect(stampOrgIfNullSql('sites')).toContain('UPDATE sites SET organization_id = $2');
    expect(stampOrgIfNullSql('fields')).toContain('UPDATE fields SET organization_id = $2');
    expect(stampOrgIfNullSql('countries')).toContain('organization_id IS NULL');
    expect(stampOrgIfNullSql('sites')).toContain('organization_id IS NULL');
    expect(stampOrgIfNullSql('fields')).toContain('organization_id IS NULL');
  });
});
