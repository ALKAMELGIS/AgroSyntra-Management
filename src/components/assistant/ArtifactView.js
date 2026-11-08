import { useMemo, useState } from 'react';
import {
  Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import ExportButton from '../ExportButton';
import { CHART_COLORS } from '../dashboard/dashboardChartTheme';
import { excelTableSx } from '../table/ExcelTable';

const FN_AR = { sum: 'مجموع', avg: 'متوسط', min: 'أدنى', max: 'أعلى', count: 'عدد', count_distinct: 'عدد مختلف' };
const DIM_AR = { zone: 'المنطقة', site: 'الموقع', farm_area: 'منطقة المزرعة', field: 'الحقل', field_type: 'نوع الحقل', day: 'اليوم', week: 'الأسبوع', month: 'الشهر', year: 'السنة', record_date: 'التاريخ', records: 'عدد السجلات', record_id: 'رقم السجل' };
const FN_EN = { sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max', count: 'Count', count_distinct: 'Distinct' };

/** Column keys from the database made readable ("sum_total_quantity" → "Sum · total quantity"). */
export function columnLabel(key, ar) {
  if (ar && DIM_AR[key]) return DIM_AR[key];
  const m = String(key).match(/^(sum|avg|min|max|count_distinct|count)_(.+)$/);
  if (m) return `${(ar ? FN_AR : FN_EN)[m[1]]} · ${m[2].replace(/_/g, ' ')}`;
  return String(key).replace(/_/g, ' ');
}

const fmt = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

async function exportExcel(artifact, ar) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AgroCloud';
  const ws = wb.addWorksheet('Report', { views: [{ rightToLeft: ar, state: 'frozen', ySplit: 3 }] });
  const cols = artifact.columns;
  ws.mergeCells(1, 1, 1, Math.max(cols.length, 1));
  ws.getCell(1, 1).value = artifact.title;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF165C3A' } };
  ws.getCell(2, 1).value = `${artifact.form ? `${ar ? artifact.form.title_ar || artifact.form.title_en : artifact.form.title_en} · FORM_ID ${artifact.form.form_id} · ` : ''}${new Date().toISOString().slice(0, 10)}`;
  ws.getCell(2, 1).font = { size: 9, color: { argb: 'FF6B7280' } };
  const header = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = columnLabel(c, ar);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D5A3C' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  artifact.rows.forEach((r) => ws.addRow(cols.map((c) => (typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : r[c]))));
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
  cols.forEach((c, i) => {
    const longest = Math.max(columnLabel(c, ar).length, ...artifact.rows.slice(0, 300).map((r) => fmt(r[c]).length));
    ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 48);
  });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${artifact.title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80) || 'report'}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Printable report in the app font (handles Arabic); the browser saves it as PDF. */
function exportPdf(artifact, ar) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const head = artifact.columns.map((c) => `<th>${esc(columnLabel(c, ar))}</th>`).join('');
  const body = artifact.rows.map((r) => `<tr>${artifact.columns.map((c) => `<td>${esc(fmt(r[c]))}</td>`).join('')}</tr>`).join('');
  const meta = `${artifact.form ? `${esc(ar ? artifact.form.title_ar || artifact.form.title_en : artifact.form.title_en)} · FORM_ID ${esc(artifact.form.form_id)} · ` : ''}${new Date().toISOString().slice(0, 10)} · ${artifact.rows.length} ${ar ? 'صف' : 'rows'}`;
  w.document.write(`<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(artifact.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Inter:wght@400;600;700&display=swap">
<style>body{font-family:${ar ? "'IBM Plex Sans Arabic'," : ''}Inter,system-ui,sans-serif;margin:24px;color:#1b1f1c}
h1{font-size:18px;margin:0 0 4px;color:#165c3a}.meta{font-size:11px;color:#6b7280;margin-bottom:14px}
table{border-collapse:collapse;width:100%;font-size:11px}th{background:#1d5a3c;color:#fff;font-weight:600;text-align:start;padding:6px 8px}
td{border-bottom:1px solid #dde2dc;padding:5px 8px;font-variant-numeric:tabular-nums}tr:nth-child(even) td{background:#f6f8f5}
.brand{font-size:11px;color:#165c3a;font-weight:700;margin-bottom:12px}@page{margin:14mm}</style></head>
<body><div class="brand">AgroCloud</div><h1>${esc(artifact.title)}</h1><div class="meta">${meta}</div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<script>document.fonts&&document.fonts.ready?document.fonts.ready.then(()=>setTimeout(()=>window.print(),150)):setTimeout(()=>window.print(),600)</script></body></html>`);
  w.document.close();
}

export default function ArtifactView({ artifact }) {
  const theme = useTheme();
  const ar = theme.direction === 'rtl';
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? artifact.rows : artifact.rows.slice(0, 25);
  const chart = artifact.chart;
  const chartData = useMemo(() => (chart ? artifact.rows.slice(0, 60).map((r) => ({ ...r, [chart.x]: fmt(r[chart.x]) })) : []), [artifact, chart]);

  return (
    <Paper variant="outlined" sx={{ mt: 1.25, borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{artifact.title}</Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            <bdi>{`${artifact.rows.length}${artifact.total > artifact.rows.length ? ` / ${artifact.total}` : ''}`}</bdi>
            {artifact.form && <span translate="no">{` · ${ar ? artifact.form.title_ar || artifact.form.title_en : artifact.form.title_en}`}</span>}
          </Typography>
        </Box>
        <ExportButton size="small" label="Export to Excel" onClick={() => exportExcel(artifact, ar)} />
        <ExportButton size="small" format="pdf" label="Export to PDF" onClick={() => exportPdf(artifact, ar)} />
      </Box>

      {chart && chartData.length > 0 && (
        <Box dir="ltr" sx={{ height: 220, px: 1, pb: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chart.type === 'pie' ? (
              <PieChart>
                <Pie data={chartData} dataKey={chart.y[0]} nameKey={chart.x} outerRadius={80} label>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke={theme.palette.background.paper} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            ) : chart.type === 'line' ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis dataKey={chart.x} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip />
                {chart.y.length > 1 && <Legend formatter={(v) => columnLabel(v, ar)} />}
                {chart.y.map((y, i) => <Line key={y} dataKey={y} name={y} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />)}
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                <XAxis dataKey={chart.x} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip />
                {chart.y.length > 1 && <Legend formatter={(v) => columnLabel(v, ar)} />}
                {chart.y.map((y, i) => <Bar key={y} dataKey={y} name={y} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />)}
              </BarChart>
            )}
          </ResponsiveContainer>
        </Box>
      )}

      <TableContainer sx={{ maxHeight: 320, borderTop: 1, borderColor: 'divider' }}>
        <Table size="small" stickyHeader sx={excelTableSx} aria-label={artifact.title}>
          <TableHead>
            <TableRow>
              {artifact.columns.map((c) => <TableCell key={c} sx={{ minWidth: 80 }}>{columnLabel(c, ar)}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <TableRow key={i}>
                {artifact.columns.map((c) => (
                  <TableCell key={c} className={typeof r[c] === 'number' ? 'col-numeric' : undefined} sx={{ whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }} translate="no">
                    {fmt(r[c])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {artifact.rows.length > 25 && (
        <Button size="small" onClick={() => setShowAll((v) => !v)} sx={{ m: 0.5 }}>
          {showAll ? 'Show less' : `Show all (${artifact.rows.length})`}
        </Button>
      )}
    </Paper>
  );
}
