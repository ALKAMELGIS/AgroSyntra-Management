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
    for (const mode of ['light', 'dark']) {
      const { palette } = createAppTheme(mode);
      // Light band with dark text (UI model): contrast must stay at AA.
      const lum = (hex) => {
        const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const [a, b] = [lum(palette.table.headerText), lum(palette.table.headerBg)].sort((x, y) => y - x);
      expect((a + 0.05) / (b + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
