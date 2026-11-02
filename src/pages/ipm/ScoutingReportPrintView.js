import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
import api from '../../utils/api';

/**
 * Printable paper-form recreation of a scouting report.
 *
 * Design decisions:
 *   - This is a dedicated route (/ipm/scouting-reports/:id/print) so the
 *     print dialog doesn't have to fight the app chrome's CSS. Users open
 *     it in a new tab; "Save as PDF" is the OS/browser's job.
 *   - Zero PDF dependencies. The file size cost of jsPDF / @react-pdf
 *     isn't worth it for a prototype that prints a handful of pages per
 *     day. Browser Save-as-PDF produces a clean A4 document with a nice
 *     fidelity-to-code ratio.
 *   - The layout is built from plain HTML tables + a scoped <style> tag
 *     with `@media print` rules — MUI is only used for the pre-print
 *     chrome (loading spinner, "Print now" button). This keeps print
 *     output predictable regardless of the active MUI theme.
 *   - Numeric cells that are null render as a single thin dash rather
 *     than blank, so a reviewer can tell "measured and was 0/empty" from
 *     "not measured at all" without having to check the raw data.
 */

import { SCOUTING_SAMPLE_INDICES } from '../../utils/scoutingObsRows';

const INSECT_ROWS = [
  { abbr: 'MA', label: 'Mite adult' },
  { abbr: 'ML', label: 'Mite larva' },
  { abbr: 'ME', label: 'Mite egg' },
  { abbr: 'WA', label: 'Whitefly adult' },
  { abbr: 'WE', label: 'Whitefly egg' },
  { abbr: 'TA', label: 'Tuta absoluta' },
  { abbr: 'A',  label: 'Aphids' },
  { abbr: 'T',  label: 'Thrips' },
  { abbr: 'L',  label: 'Leaf miner' },
  { abbr: 'W',  label: 'Worm' },
];

const DISEASE_ROWS = [
  { abbr: 'EB', label: 'Early blight' },
  { abbr: 'LB', label: 'Late blight' },
  { abbr: 'BL', label: 'Bacterial blight' },
  { abbr: 'B',  label: 'Botrytis' },
  { abbr: 'DW', label: 'Downy mildew' },
  { abbr: 'An', label: 'Anthracnose' },
  { abbr: 'P',  label: 'Phytium' },
  { abbr: 'F',  label: 'Fusarium' },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const asText = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

const fmtDate = (v) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return String(v);
  }
};

const joinMulti = (v) => {
  if (!v) return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return String(v);
};

const obsPestName = (o) => o.pestName ?? o.pest_name;
const obsSamplingUnit = (o) => o.samplingUnit ?? o.sampling_unit;
const obsSamplingMethod = (o) => o.samplingMethod ?? o.sampling_method;
const obsCount = (o, n) => o[`count${n}`] ?? o[`count_${n}`];

const growthField = (g, camel, snake) => g?.[camel] ?? g?.[snake];

const trapCardNumber = (card, idx) => card.cardNumber ?? card.card_number ?? idx + 1;
const trapInsectType = (card) => card.insectType ?? card.insect_type;
const trapLocation = (card) => card.trapLocation ?? card.trap_location;

const emptySampleCells = () =>
  SCOUTING_SAMPLE_INDICES.map((n) => <td key={n} className="num">—</td>);

function renderObservationCells(o, { showTotalAvg = true, showPercent = true, showPercentLabel = true } = {}) {
  return (
    <>
      <td>{asText(obsPestName(o))}</td>
      <td>{asText(obsSamplingUnit(o))}</td>
      <td>{asText(obsSamplingMethod(o))}</td>
      {SCOUTING_SAMPLE_INDICES.map((n) => (
        <td key={n} className="num">{asText(obsCount(o, n))}</td>
      ))}
      {showTotalAvg && (
        <>
          <td className="num">{asText(o.total)}</td>
          <td className="num">{asText(o.average)}</td>
        </>
      )}
      {showPercent && (
        <td className="num">{showPercentLabel ? asText(o.percent) : ''}</td>
      )}
    </>
  );
}

export default function ScoutingReportPrintView() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/scouting/reports/${id}`);
      setReport(res.data?.data || res.data);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-open the print dialog once the report is loaded, but only once.
  // Using requestAnimationFrame + a small delay gives the browser time to
  // lay out the tables and load fonts so the first print preview is
  // faithful. Users can also close the dialog and re-trigger via the
  // "Print / Save PDF" button if the timing feels off on a slow device.
  useEffect(() => {
    if (!report) return;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* user cancelled or browser blocked */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [report]);

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Preparing report…</Typography>
      </Box>
    );
  }

  if (error || !report) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error || 'Report not found.'}</Typography>
      </Box>
    );
  }

  // Index observations by abbreviation so we always render every paper
  // row in order — even ones the scout didn't fill in. An empty row is
  // still meaningful (it proves the scout checked and found nothing).
  const obsByAbbr = new Map();
  const obsByName = new Map();
  for (const o of report.observations || []) {
    const name = obsPestName(o);
    const m = /\(([A-Z]+)\)/.exec(name || '');
    if (m) obsByAbbr.set(m[1], o);
    if (name) {
      obsByName.set(name, o);
      obsByName.set(name.toLowerCase(), o);
    }
  }

  const findObs = (row) =>
    obsByAbbr.get(row.abbr)
    || obsByName.get(row.label)
    || obsByName.get(row.label.toLowerCase())
    || null;

  const insectObservations = (report.observations || []).filter((o) => o.category === 'insect');
  const diseaseObservations = (report.observations || []).filter((o) => o.category === 'disease');

  const isFirstPestRow = (list, index) => {
    const name = obsPestName(list[index]);
    const m = /\(([A-Z]+)\)/.exec(name || '');
    const key = m?.[1] || name;
    for (let i = 0; i < index; i += 1) {
      const prev = obsPestName(list[i]);
      const pm = /\(([A-Z]+)\)/.exec(prev || '');
      const pkey = pm?.[1] || prev;
      if (pkey === key) return false;
    }
    return true;
  };

  const growth = report.growth_stage || {};
  const traps = report.trap_cards || [];

  return (
    <Box className="print-root">
      <style>{`
        @page { size: A4; margin: 10mm; }

        .no-print { display: block; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          /* Hide the surrounding app chrome (header / sidebar /
             breadcrumbs) so only the paper form prints. The print
             view is mounted inside the normal app layout — stripping
             chrome via @media print is simpler than hoisting this
             route outside of AppLayout. */
          .MuiAppBar-root,
          .MuiDrawer-root,
          .MuiBreadcrumbs-root {
            display: none !important;
          }
          /* Remove the layout padding / top offset so the page starts
             at the top of the sheet. */
          body > div,
          main,
          [role="main"] {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-height: 0 !important;
          }
          .print-root { padding: 0 !important; background: white !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; page-break-after: always; }
          .print-page:last-child { page-break-after: auto; }
        }

        .print-root {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #000;
          background: #f5f5f5;
          padding: 16px;
        }
        .print-page {
          background: white;
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto 12px auto;
          padding: 12mm 10mm;
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
          box-sizing: border-box;
          font-size: 10.5pt;
        }
        .print-page h1 {
          text-align: center;
          font-size: 14pt;
          margin: 0 0 2px 0;
          text-transform: uppercase;
        }
        .print-page h2 {
          font-size: 11pt;
          margin: 12px 0 4px 0;
          border-bottom: 1px solid #000;
          padding-bottom: 2px;
        }
        .doc-ref {
          text-align: center;
          font-size: 8.5pt;
          color: #444;
          margin-bottom: 8px;
        }
        table.form {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 6px;
        }
        table.form th, table.form td {
          border: 1px solid #555;
          padding: 3px 5px;
          font-size: 9.5pt;
          vertical-align: top;
        }
        table.form th {
          background: #eee;
          font-weight: 600;
          text-align: left;
        }
        table.form td.num {
          text-align: center;
          min-width: 30px;
        }
        table.header-grid td { border: none; padding: 2px 6px; }
        table.header-grid td.label { font-weight: 600; white-space: nowrap; }

        .signatures {
          display: flex;
          gap: 20px;
          margin-top: 24px;
        }
        .sig-box {
          flex: 1;
          border-top: 1px solid #000;
          padding-top: 4px;
          font-size: 9pt;
          text-align: center;
        }
        .footnote {
          font-size: 8pt;
          color: #555;
          margin-top: 6px;
        }
      `}</style>

      <Box className="no-print" sx={{ textAlign: 'center', mb: 2 }}>
        <Button variant="contained" onClick={() => window.print()} sx={{ mr: 1 }}>
          Print / Save as PDF
        </Button>
        <Button variant="outlined" onClick={() => window.close()}>Close</Button>
        <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
          The print dialog should open automatically. Choose "Save as PDF"
          as the destination to export. If it didn't open, click the button.
        </Typography>
      </Box>

      <Box className="print-page">
        <h1>Scouting Report — Covered</h1>
        <div className="doc-ref">Ref: EAG/AFO/IWS/RC-105</div>

        <table className="form header-grid">
          <tbody>
            <tr>
              <td className="label">Field:</td>
              <td>{asText(report.field_name)}</td>
              <td className="label">Date:</td>
              <td>{fmtDate(report.report_date)}</td>
              <td className="label">Time:</td>
              <td>{asText(report.report_time)}</td>
            </tr>
            <tr>
              <td className="label">Scout:</td>
              <td>{asText(report.scout_name)}</td>
              <td className="label">Status:</td>
              <td>{asText(report.status)}</td>
              <td className="label">Severity:</td>
              <td>{asText(report.severity)}</td>
            </tr>
            <tr>
              <td className="label">Crop:</td>
              <td>{asText(report.crop_name)}</td>
              <td className="label">Variety:</td>
              <td>{asText(report.variety)}</td>
              <td className="label">Area / Variety:</td>
              <td>{asText(report.area_variety)}</td>
            </tr>
            <tr>
              <td className="label">Density / area:</td>
              <td>{asText(report.density_per_area)}</td>
              <td className="label">Crop height:</td>
              <td>{asText(report.crop_height)}</td>
              <td className="label">Soil condition:</td>
              <td>{asText(report.soil_condition)}</td>
            </tr>
            <tr>
              <td className="label">Weather:</td>
              <td>{asText(report.weather)}</td>
              <td className="label">Wind:</td>
              <td>{asText(report.wind)}</td>
              <td className="label">GPS:</td>
              <td>
                {report.gps_lat != null && report.gps_lng != null
                  ? `${report.gps_lat}, ${report.gps_lng}`
                  : '—'}
              </td>
            </tr>
          </tbody>
        </table>

        <h2>Location within field</h2>
        <table className="form header-grid">
          <tbody>
            <tr>
              <td className="label">Bed:</td>
              <td>{joinMulti(report.bed_code)}</td>
              <td className="label">Column:</td>
              <td>{joinMulti(report.column_code)}</td>
            </tr>
            <tr>
              <td className="label">Bay:</td>
              <td>{joinMulti(report.bay_code)}</td>
              <td className="label">Valve:</td>
              <td>{joinMulti(report.valve_code)}</td>
            </tr>
            <tr>
              <td className="label">Side:</td>
              <td colSpan={3}>{asText(report.side)}</td>
            </tr>
          </tbody>
        </table>

        <h2>Insects</h2>
        <table className="form">
          <thead>
            <tr>
              <th>Pest</th>
              <th>Segment</th>
              <th>Basis</th>
              {SCOUTING_SAMPLE_INDICES.map((n) => (
                <th key={n} className="num">S{n}</th>
              ))}
              <th className="num">Total</th>
              <th className="num">Avg</th>
              <th className="num">Infestation %</th>
            </tr>
          </thead>
          <tbody>
            {insectObservations.length > 0
              ? insectObservations.map((o, i) => (
                <tr key={o.id || `insect-${i}`}>
                  {renderObservationCells(o, {
                    showTotalAvg: true,
                    showPercent: true,
                    showPercentLabel: isFirstPestRow(insectObservations, i),
                  })}
                </tr>
              ))
              : INSECT_ROWS.map((row) => {
                const o = findObs(row);
                return (
                  <tr key={row.abbr}>
                    {o ? (
                      renderObservationCells(o, { showTotalAvg: true, showPercent: true })
                    ) : (
                      <>
                        <td>{row.label} ({row.abbr})</td>
                        <td>—</td>
                        <td>—</td>
                        {emptySampleCells()}
                        <td className="num">—</td>
                        <td className="num">—</td>
                        <td className="num">—</td>
                      </>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>

        <h2>Diseases</h2>
        <table className="form">
          <thead>
            <tr>
              <th>Disease</th>
              <th>Segment</th>
              <th>Basis</th>
              {SCOUTING_SAMPLE_INDICES.map((n) => (
                <th key={n} className="num">S{n}</th>
              ))}
              <th className="num">Infestation %</th>
            </tr>
          </thead>
          <tbody>
            {diseaseObservations.length > 0
              ? diseaseObservations.map((o, i) => (
                <tr key={o.id || `disease-${i}`}>
                  {renderObservationCells(o, {
                    showTotalAvg: false,
                    showPercent: true,
                    showPercentLabel: isFirstPestRow(diseaseObservations, i),
                  })}
                </tr>
              ))
              : DISEASE_ROWS.map((row) => {
                const o = findObs(row);
                return (
                  <tr key={row.abbr}>
                    {o ? (
                      renderObservationCells(o, { showTotalAvg: false, showPercent: true })
                    ) : (
                      <>
                        <td>{row.label} ({row.abbr})</td>
                        <td>—</td>
                        <td>—</td>
                        {emptySampleCells()}
                        <td className="num">—</td>
                      </>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>

        <h2>Growth stage</h2>
        <table className="form header-grid">
          <tbody>
            <tr>
              <td className="label">Number of trusses:</td>
              <td>{asText(growthField(growth, 'numberOfTrusses', 'number_of_trusses'))}</td>
              <td className="label">Number of stems:</td>
              <td>{asText(growthField(growth, 'numberOfStems', 'number_of_stems'))}</td>
            </tr>
            <tr>
              <td className="label">Stem thickness:</td>
              <td>{asText(growthField(growth, 'stemThickness', 'stem_thickness'))}</td>
              <td className="label">Avg fruit weight:</td>
              <td>{asText(growthField(growth, 'avgFruitWeight', 'avg_fruit_weight'))}</td>
            </tr>
            <tr>
              <td className="label">Fruits per plant:</td>
              <td colSpan={3}>{asText(growthField(growth, 'fruitsPerPlant', 'fruits_per_plant'))}</td>
            </tr>
          </tbody>
        </table>

        <h2>Insect trap cards</h2>
        <table className="form">
          <thead>
            <tr>
              <th>#</th>
              <th>Insect</th>
              <th>Location</th>
              {DAY_LABELS.map((d) => (
                <th key={d} className="num">{d}</th>
              ))}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {traps.length === 0 ? (
              <tr>
                <td colSpan={3 + DAY_LABELS.length + 1} style={{ textAlign: 'center', color: '#777' }}>
                  No trap cards recorded.
                </td>
              </tr>
            ) : (
              traps.map((card, idx) => (
                <tr key={idx}>
                  <td className="num">{trapCardNumber(card, idx)}</td>
                  <td>{asText(trapInsectType(card))}</td>
                  <td>{asText(trapLocation(card))}</td>
                  {DAY_KEYS.map((d) => (
                    <td key={d} className="num">{asText(card[d])}</td>
                  ))}
                  <td className="num">{asText(card.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <h2>Comments / notes</h2>
        <Box
          sx={{
            border: '1px solid #555',
            minHeight: 60,
            padding: '4px 6px',
            whiteSpace: 'pre-wrap',
            fontSize: '10pt',
          }}
        >
          {report.comments || report.notes || '—'}
        </Box>

        <div className="signatures">
          <div className="sig-box">Scout signature</div>
          <div className="sig-box">Agronomist signature</div>
          <div className="sig-box">Manager signature</div>
        </div>

        <div className="footnote">
          Generated from Al Maha Farm IPM — report id {report.id}.
          Printed {new Date().toLocaleString()}.
        </div>
      </Box>
    </Box>
  );
}
