/** Resolve export fill colors from MUI theme (avoids hardcoded palette drift). */

function channelToHex(channel) {
  if (channel == null || channel === '') return null;
  const s = String(channel).trim();
  if (s.startsWith('#')) return s.replace('#', '').toUpperCase().padStart(6, '0').slice(0, 6);
  return null;
}

export function getManpowerExportColors(theme) {
  const successMain = theme?.palette?.success?.main;
  const warningMain = theme?.palette?.warning?.main;
  const divider = theme?.palette?.divider;

  const rowHeaderFill = channelToHex(successMain) || '66BB6A';
  const activityHeaderFill = channelToHex(warningMain) || 'FFA726';
  const borderRgb = channelToHex(divider) || 'C8C8C8';

  return {
    rowHeaderFill,
    activityHeaderFill,
    borderRgb,
    headerFont: { bold: true, color: { rgb: 'FFFFFF' } },
    bodyBorder: {
      top: { style: 'thin', color: { rgb: borderRgb } },
      bottom: { style: 'thin', color: { rgb: borderRgb } },
      left: { style: 'thin', color: { rgb: borderRgb } },
      right: { style: 'thin', color: { rgb: borderRgb } },
    },
  };
}

export function applySheetHeaderStyles(ws, colors, headerRowIndexes = [0]) {
  if (!ws || !ws['!ref']) return;
  const range = ws['!ref'].split(':');
  const maxCol = range[1] ? range[1].replace(/\d/g, '') : 'A';

  headerRowIndexes.forEach((rowIdx) => {
    for (let c = 0; c <= 26; c += 1) {
      const col = String.fromCharCode(65 + c);
      if (col > maxCol) break;
      const ref = `${col}${rowIdx + 1}`;
      if (!ws[ref]) continue;
      ws[ref].s = {
        fill: { fgColor: { rgb: colors.rowHeaderFill } },
        font: colors.headerFont,
        border: colors.bodyBorder,
      };
    }
  });
}
