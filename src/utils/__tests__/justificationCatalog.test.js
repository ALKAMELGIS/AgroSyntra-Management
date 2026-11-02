import {
  applyJustificationColumnOptions,
  catalogJustificationLabel,
  justificationOptionsFromCatalog,
  parseJustificationInput,
  resolveJustificationLabel,
  rewriteJustificationValue,
  uniqueUnknownJustifications,
} from '../justificationCatalog';

const catalog = [
  { id: 'thrips', name: 'Thrips', category: 'pest' },
  { id: 'whitefly', name: 'Whitefly', category: 'pest' },
  { id: 'mite', name: 'Spider Mite', category: 'pest' },
  { id: 'mildew', name: 'Powdery Mildew', category: 'disease' },
  { id: 'fungi', name: 'Fungi', category: 'disease' },
  { name: 'Preventative', category: 'preventative' },
  { name: 'Copper drench', category: 'preventative' },
  { name: 'Swriski', category: 'biological_control' },
];

describe('catalogJustificationLabel', () => {
  it('prefixes pest and disease names', () => {
    expect(catalogJustificationLabel({ name: 'Thrips', category: 'pest' })).toBe('Pest : Thrips');
    expect(catalogJustificationLabel({ name: 'Fungi', category: 'disease' })).toBe('Disease : Fungi');
  });

  it('uses a bare Preventative label for the seeded row', () => {
    expect(catalogJustificationLabel({ name: 'Preventative', category: 'preventative' })).toBe('Preventative');
    expect(catalogJustificationLabel({ name: 'Preventive', category: 'preventative' })).toBe('Preventative');
  });

  it('prefixes extra preventative names', () => {
    expect(catalogJustificationLabel({ name: 'Copper drench', category: 'preventative' }))
      .toBe('Preventative : Copper drench');
  });
});

describe('justificationOptionsFromCatalog', () => {
  it('lists pest, disease, then preventative and skips biological control', () => {
    expect(justificationOptionsFromCatalog(catalog)).toEqual([
      'Pest : Spider Mite',
      'Pest : Thrips',
      'Pest : Whitefly',
      'Disease : Fungi',
      'Disease : Powdery Mildew',
      'Preventative',
      'Preventative : Copper drench',
    ]);
  });
});

describe('resolveJustificationLabel', () => {
  it('matches a bare Excel name to the catalog prefix', () => {
    expect(resolveJustificationLabel('Thrips', catalog)).toMatchObject({
      status: 'matched',
      label: 'Pest : Thrips',
    });
    expect(resolveJustificationLabel('fungi', catalog)).toMatchObject({
      status: 'matched',
      label: 'Disease : Fungi',
    });
  });

  it('matches a prefixed value case-insensitively', () => {
    expect(resolveJustificationLabel('pest : thrips', catalog)).toMatchObject({
      status: 'matched',
      label: 'Pest : Thrips',
    });
  });

  it('maps Preventive / Preventative spellings without asking', () => {
    expect(resolveJustificationLabel('Preventive', catalog)).toMatchObject({
      status: 'matched',
      label: 'Preventative',
    });
    expect(resolveJustificationLabel('Preventative', catalog)).toMatchObject({
      status: 'matched',
      label: 'Preventative',
    });
    expect(resolveJustificationLabel('preventive :', catalog)).toMatchObject({
      status: 'matched',
      label: 'Preventative',
    });
  });

  it('maps Preventive even when the seed row is missing', () => {
    expect(resolveJustificationLabel('Preventive', [])).toMatchObject({
      status: 'matched',
      label: 'Preventative',
    });
  });

  it('marks unknown names for classification', () => {
    expect(resolveJustificationLabel('Mystery Mite', catalog)).toMatchObject({
      status: 'unknown',
      bareName: 'Mystery Mite',
      categoryHint: null,
    });
    expect(resolveJustificationLabel('Pest : Mystery Mite', catalog)).toMatchObject({
      status: 'unknown',
      bareName: 'Mystery Mite',
      categoryHint: 'pest',
    });
  });

  it('matches punctuation extras and unique close typos to the catalog name', () => {
    expect(resolveJustificationLabel('spider mite (', catalog)).toMatchObject({
      status: 'matched',
      label: 'Pest : Spider Mite',
      entry: expect.objectContaining({ id: 'mite' }),
    });
    expect(resolveJustificationLabel('spider met', catalog)).toMatchObject({
      status: 'matched',
      label: 'Pest : Spider Mite',
    });
  });

  it('uses a Match-existing pick instead of the Excel spelling', () => {
    expect(resolveJustificationLabel('Phytium', catalog, {
      phytium: { matchId: 'mildew' },
    })).toMatchObject({
      status: 'matched',
      label: 'Disease : Powdery Mildew',
    });
  });
});

describe('uniqueUnknownJustifications', () => {
  it('dedupes unknown names and skips catalog matches', () => {
    expect(uniqueUnknownJustifications(
      ['Thrips', 'Mystery Mite', 'mystery mite', 'Pest : New Bug', 'Preventive', 'spider mite (', 'spider met', ''],
      catalog,
    )).toEqual([
      { bareName: 'Mystery Mite', categoryHint: null },
      { bareName: 'New Bug', categoryHint: 'pest' },
    ]);
  });
});

describe('rewriteJustificationValue', () => {
  it('rewrites a bare name to the catalog label', () => {
    expect(rewriteJustificationValue('Thrips', catalog)).toBe('Pest : Thrips');
    expect(rewriteJustificationValue('', catalog)).toBe('');
  });
});

describe('parseJustificationInput', () => {
  it('strips known prefixes', () => {
    expect(parseJustificationInput('Disease : Botrytis')).toEqual({
      bareName: 'Botrytis',
      categoryHint: 'disease',
    });
  });
});

describe('applyJustificationColumnOptions', () => {
  it('overrides the justification dropdown options', () => {
    const columns = [
      { key: 'fieldId', options: 'A,B' },
      { key: 'justification', options: 'Pest : Old' },
    ];
    expect(applyJustificationColumnOptions(columns, 'Pest : Thrips,Preventative')).toEqual([
      { key: 'fieldId', options: 'A,B' },
      { key: 'justification', options: 'Pest : Thrips,Preventative' },
    ]);
  });
});
