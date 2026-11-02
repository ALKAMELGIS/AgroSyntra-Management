import { siteContextLoaded } from '../siteContextLoaded';

const SITE = { id: 'site-1', name: 'MH – Site 1' };

describe('siteContextLoaded', () => {
  it('keeps CEO waiting until org default is done and sites exist', () => {
    expect(siteContextLoaded({
      orgDefaultLoaded: false,
      accessLoaded: true,
      allSites: [SITE],
      assignedSiteIds: null,
    })).toBe(false);

    expect(siteContextLoaded({
      orgDefaultLoaded: true,
      accessLoaded: true,
      allSites: [],
      assignedSiteIds: null,
    })).toBe(false);

    expect(siteContextLoaded({
      orgDefaultLoaded: true,
      accessLoaded: true,
      allSites: [SITE],
      assignedSiteIds: null,
    })).toBe(true);
  });

  it('loads OM once access is done and assigned sites are in master data, even without org default', () => {
    expect(siteContextLoaded({
      orgDefaultLoaded: false,
      accessLoaded: false,
      allSites: [SITE],
      assignedSiteIds: ['site-1'],
    })).toBe(false);

    expect(siteContextLoaded({
      orgDefaultLoaded: false,
      accessLoaded: true,
      allSites: [],
      assignedSiteIds: ['site-1'],
    })).toBe(false);

    expect(siteContextLoaded({
      orgDefaultLoaded: false,
      accessLoaded: true,
      allSites: [SITE],
      assignedSiteIds: ['site-1'],
    })).toBe(true);
  });

  it('treats a site-scoped user with no assignments as loaded without waiting for sites', () => {
    expect(siteContextLoaded({
      orgDefaultLoaded: true,
      accessLoaded: true,
      allSites: [],
      assignedSiteIds: [],
    })).toBe(true);
  });
});
