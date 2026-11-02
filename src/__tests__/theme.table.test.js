import { createAppTheme } from '../theme';

// createTheme is free to drop palette keys it does not recognise. If it ever
// drops `table`, every spreadsheet-style table crashes on render rather than
// just losing its colours, so assert the tokens survive in both modes.
describe('table palette tokens', () => {
  const TOKENS = [
    'headerBg', 'headerText', 'gutterBg', 'gutterText', 'gridline',
    'sectionBg', 'sectionText', 'totalBg', 'totalText',
    'selection', 'selectionRange', 'rowHover', 'errorBg', 'errorAccent',
  ];

  it.each(['light', 'dark'])('survives createTheme in %s mode', (mode) => {
    const { palette } = createAppTheme(mode);
    expect(palette.table).toBeDefined();
    for (const token of TOKENS) {
      expect(typeof palette.table[token]).toBe('string');
    }
  });

  it('keeps header text readable on the header band in both modes', () => {
    // Header text is the one pairing that sits on a saturated fill, so it is the
    // only one where a token swap could silently break contrast.
    for (const mode of ['light', 'dark']) {
      const { palette } = createAppTheme(mode);
      expect(palette.table.headerText).toBe('#ffffff');
      expect(palette.table.headerBg).toBe('#3d7c4f');
    }
  });
});
