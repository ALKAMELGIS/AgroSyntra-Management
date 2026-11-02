import {
  catalogJustificationLabel,
  compactPestCatalogName,
  expandCatalogIdsForQuery,
  findExistingCatalogEntry,
  hideCatalogStrategy,
  justificationLabelsForIds,
  normalizePestCatalogName,
  pickExistingCatalogEntry,
} from '../pestCatalogMatch';

const catalog = [
  { id: 'thrips', name: 'Thrips', category: 'pest', organization_id: 'org-1' },
  { id: 'mite', name: 'Spider Mite', category: 'pest', organization_id: 'org-1' },
  { id: 'pythium', name: 'Pythium spp.', category: 'disease', organization_id: null },
  { id: 'thrips-spot', name: 'Thrips Spot', category: 'pest', organization_id: 'org-1' },
  { id: 'combo', name: 'Red Spider Mite & Thrips ( Spot )', category: 'pest', organization_id: 'org-1' },
];

describe('normalizePestCatalogName', () => {
  it('strips punctuation so spider mite ( matches Spider Mite', () => {
    expect(normalizePestCatalogName('spider mite (')).toBe('spider mite');
    expect(normalizePestCatalogName('Spider Mite')).toBe('spider mite');
    expect(compactPestCatalogName('spider mite (')).toBe('spidermite');
  });
});

describe('findExistingCatalogEntry', () => {
  it('treats punctuation-only extras as an exact catalog hit', () => {
    expect(findExistingCatalogEntry('spider mite (', catalog)?.id).toBe('mite');
  });

  it('auto-matches a unique one-letter misspelling', () => {
    expect(findExistingCatalogEntry('spider met', catalog)?.id).toBe('mite');
  });

  it('does not auto-match Phytium to Pythium spp.', () => {
    expect(findExistingCatalogEntry('Phytium', catalog)).toBeNull();
  });

  it('does not treat a spot name as the original pest', () => {
    expect(findExistingCatalogEntry('Thrips Spot', catalog)?.id).toBe('thrips-spot');
  });

  it('prefers the org copy when several exact names exist', () => {
    const dupes = [
      { id: 'shared', name: 'Phytium', category: 'disease', organization_id: null },
      { id: 'org', name: 'Phytium', category: 'disease', organization_id: 'org-1' },
    ];
    expect(pickExistingCatalogEntry(dupes, 'org-1', 'disease')?.id).toBe('org');
  });
});

describe('hideCatalogStrategy', () => {
  it('deactivates org copies and hides shared foundation rows per farm', () => {
    expect(hideCatalogStrategy({ organization_id: 'org-1' }, 'org-1')).toBe('deactivate');
    expect(hideCatalogStrategy({ organization_id: null }, 'org-1')).toBe('org_hidden');
    expect(hideCatalogStrategy({ organization_id: 'other' }, 'org-1')).toBe('forbidden');
  });
});

describe('expandCatalogIdsForQuery', () => {
  const links = [
    { memberId: 'thrips-spot', groupId: 'thrips' },
    { memberId: 'combo', groupId: 'thrips' },
    { memberId: 'combo', groupId: 'mite' },
  ];

  it('includes spots and combos when searching for Thrips', () => {
    const ids = expandCatalogIdsForQuery('Thrips', catalog, links);
    expect(ids).toEqual(expect.arrayContaining(['thrips', 'thrips-spot', 'combo']));
  });

  it('builds justification labels for expanded ids', () => {
    expect(justificationLabelsForIds(['thrips', 'thrips-spot'], catalog)).toEqual([
      'Pest : Thrips',
      'Pest : Thrips Spot',
    ]);
  });
});

describe('catalogJustificationLabel', () => {
  it('prefixes pest names', () => {
    expect(catalogJustificationLabel({ name: 'Thrips', category: 'pest' })).toBe('Pest : Thrips');
  });
});
