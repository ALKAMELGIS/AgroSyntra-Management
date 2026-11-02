import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Button } from '@mui/material';
import { Print as PrintIcon } from '@mui/icons-material';
import api from '../../utils/api';
import { rowLabels } from '../../utils/mixtureGroups';

const borderStyle = '1px solid #333';
const cellPad = '4px 6px';
const headerBg = '#d9e2d5';
const fontSize = '9px';

export default function WorkOrderPrintView() {
  const { id } = useParams();
  const [wo, setWo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/ipm/work-orders/${id}`).then((res) => {
      setWo(res.data?.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>;
  if (!wo) return <Typography sx={{ textAlign: 'center', py: 8 }}>Work order not found</Typography>;

  const items = wo.items || [];
  const emptyRows = Math.max(0, 10 - items.length);
  // Same numbering as the screen: mixtures do not use up a row number.
  const labels = rowLabels(items, (item) => item.is_mixture_child, 'Mix');
  const anyAdded = items.some((item) => item.added_by_operator);

  return (
    <>
      {/* Print button - hidden on print */}
      <Box sx={{ textAlign: 'center', py: 2 }} className="no-print">
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
          Print Work Order
        </Button>
      </Box>

      <Box sx={{
        maxWidth: 1100, mx: 'auto', p: 3, fontFamily: '"Arial", "Helvetica", sans-serif',
        '@media print': { p: 0, maxWidth: '100%' },
      }}>
        {/* ─── Header ─────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, border: borderStyle }}>
          <Box sx={{ p: 1, flex: 1, borderRight: borderStyle }}>
            <Typography sx={{ fontSize: '14px', fontWeight: 900, letterSpacing: 0.5 }}>
              ELITE AGRO UAE LLC
            </Typography>
          </Box>
          <Box sx={{ p: 1, flex: 2, borderRight: borderStyle, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '13px', fontWeight: 800, letterSpacing: 1 }}>
              WORK ORDER - SPRAYING OPERATION
            </Typography>
          </Box>
          <Box sx={{ p: 1, flex: 1, textAlign: 'right' }}>
            <Typography sx={{ fontSize: '8px', color: '#555' }}>EAG/AFO/IMS/RC-231</Typography>
            <Typography sx={{ fontSize: '8px', color: '#555' }}>Issue 03, 17-Sept-2020, Rev00</Typography>
          </Box>
        </Box>

        {/* ─── Meta Row ───────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', border: borderStyle, borderTop: 'none', mb: 1 }}>
          <Cell label="Work Order Number" value={`${wo.work_order_number}`} flex={1} />
          <Cell label="Date" value={wo.date_issued ? new Date(wo.date_issued).toLocaleDateString('en-GB') : '-'} flex={1} />
          <Cell label="Operation Site/Farm" value={wo.site_name || '-'} flex={2} />
        </Box>

        {/* ─── Main Table ─────────────────────────────────────────── */}
        <Box sx={{ border: borderStyle, borderTop: 'none' }}>
          {/* Sub-header: Authorization of application */}
          <Box sx={{ bgcolor: headerBg, borderBottom: borderStyle, p: '3px 6px' }}>
            <Typography sx={{ fontSize: '9px', fontWeight: 700 }}>
              Work order - Authorization of application
            </Typography>
          </Box>

          {/* Table header */}
          <Box sx={{ display: 'flex', bgcolor: headerBg, borderBottom: borderStyle }}>
            <HCell text="S.No." w={40} />
            <HCell text="Field ID (GH/NH/OF)" w={90} />
            <HCell text="Segment (Valve/Bay)" w={90} />
            <HCell text="Pesticide (PPP)" w={100} />
            <HCell text="Rate" w={60} />
            <HCell text="Date of application" w={85} />
            <HCell text="Justification" w={85} />
            <HCell text="PHI" w={35} />
            <HCell text="Start Time" w={55} last={false} />
            <HCell text="End Time" w={55} />
            <HCell text="Total Qty of Product Used (ml)" w={70} />
            <HCell text="Total Qty Water Used (L)" w={70} />
            <HCell text="Actual" w={50} />
            <HCell text="Machinery (Ref No.)" w={60} />
            <HCell text="Quality Check (Y)" w={50} />
            <HCell text="Completed by (Supervisor Names)" w={80} noBorder />
          </Box>

          {/* Data rows */}
          {items.map((item, idx) => (
            <Box key={item.id} sx={{ display: 'flex', borderBottom: borderStyle }}>
              <DCell text={`${labels[idx]}${item.added_by_operator ? ' *' : ''}`} w={40} />
              <DCell text={item.field_name || ''} w={90} />
              <DCell text={item.segment || ''} w={90} />
              <DCell text={item.product_name || ''} w={100} />
              <DCell text={item.rate || ''} w={60} />
              <DCell text={item.date_of_application ? new Date(item.date_of_application).toLocaleDateString('en-GB') : ''} w={85} />
              <DCell text={idx === 0 ? (wo.justification || '') : '"'} w={85} />
              <DCell text={item.phi_days != null ? String(item.phi_days) : ''} w={35} />
              <DCell text={item.start_time ? item.start_time.slice(0, 5) : ''} w={55} />
              <DCell text={item.end_time ? item.end_time.slice(0, 5) : ''} w={55} />
              <DCell text={item.total_product_qty != null ? String(item.total_product_qty) : ''} w={70} />
              <DCell text={item.total_water_qty != null ? String(item.total_water_qty) : ''} w={70} />
              <DCell text={item.actual_qty != null ? String(item.actual_qty) : ''} w={50} />
              <DCell text={item.machinery_ref || ''} w={60} />
              <DCell text={item.quality_check ? '\u2713' : ''} w={50} />
              <DCell text={item.completed_by_name || ''} w={80} noBorder />
            </Box>
          ))}
          {/* Empty rows to fill the template */}
          {Array.from({ length: emptyRows }).map((_, idx) => (
            <Box key={`empty-${idx}`} sx={{ display: 'flex', borderBottom: borderStyle, minHeight: 20 }}>
              <DCell text="" w={40} /><DCell text="" w={90} /><DCell text="" w={90} />
              <DCell text="" w={100} /><DCell text="" w={60} /><DCell text="" w={85} />
              <DCell text="" w={85} /><DCell text="" w={35} /><DCell text="" w={55} />
              <DCell text="" w={55} /><DCell text="" w={70} /><DCell text="" w={70} />
              <DCell text="" w={50} /><DCell text="" w={60} /><DCell text="" w={50} />
              <DCell text="" w={80} noBorder />
            </Box>
          ))}
          {anyAdded && (
            <Box sx={{ p: '2px 6px' }}>
              <Typography sx={{ fontSize: '7px', fontStyle: 'italic' }}>
                * Row added by the operator while completing the order.
              </Typography>
            </Box>
          )}
        </Box>

        {/* ─── Bottom Section: Instructions + Authorization ────────── */}
        <Box sx={{ display: 'flex', border: borderStyle, borderTop: 'none', minHeight: 200 }}>
          {/* Left: Important Instructions */}
          <Box sx={{ flex: 1, borderRight: borderStyle, p: 1 }}>
            <Typography sx={{ fontSize: '9px', fontWeight: 800, mb: 0.5, textDecoration: 'underline' }}>
              IMPORTANT INSTRUCTIONS
            </Typography>
            <Typography sx={{ fontSize: '7.5px', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
              {wo.important_instructions || `1. The above label instruction is followed - The recommended rates are complied.
2. The safe time label instruction is followed.
3. All labourers are wearing all required PPEs (Overall, Respiratory, Safety boots, Goggles/face shield and rubber gloves).
4. Uniform walking/driving speed is followed and full canopy is covered/spot treatment is done as per the instruction.
5. Empty containers, hoses covered and caps are put on for storage.
6. The tankers, hoses, filters and nozzles are checked for appropriateness/applicability and are used for operation.
7. PPEs, spray machines are cleaned and stored in the designated storage area.
8. Containers are triple rinsed and returned or stored in the designated storage area.`}
            </Typography>
          </Box>

          {/* Right: Authorization & Completion */}
          <Box sx={{ flex: 1, p: 1 }}>
            <Typography sx={{ fontSize: '9px', fontWeight: 800, mb: 1, textDecoration: 'underline' }}>
              AUTHORIZATION &amp; COMPLETION
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <AuthRow label="Work Order Given by" name={wo.issued_by_name || ''} />
              <AuthRow label="Work Order Given to" name={wo.assigned_to_name || ''} />
              <AuthRow label="Work Order Completed by" name={wo.completed_by_name_user || ''} />
            </Box>
          </Box>
        </Box>

        {/* Ensure * note */}
        <Typography sx={{ fontSize: '7px', mt: 0.5, color: '#666' }}>
          * Ensure the following: 1. Containers are triple rinsed. 2. PPEs, spray machines are cleaned and stored in the designated storage area.
        </Typography>
      </Box>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          @page { size: landscape; margin: 10mm; }
        }
      `}</style>
    </>
  );
}

function Cell({ label, value, flex = 1 }) {
  return (
    <Box sx={{ flex, borderRight: borderStyle, p: cellPad, '&:last-child': { borderRight: 'none' } }}>
      <Typography sx={{ fontSize: '7px', color: '#666', fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ fontSize: '11px', fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

function HCell({ text, w, noBorder = false }) {
  return (
    <Box sx={{
      width: w, minWidth: w, borderRight: noBorder ? 'none' : borderStyle,
      p: '2px 4px', display: 'flex', alignItems: 'center',
    }}>
      <Typography sx={{ fontSize: '7px', fontWeight: 700, lineHeight: 1.2 }}>{text}</Typography>
    </Box>
  );
}

function DCell({ text, w, noBorder = false }) {
  return (
    <Box sx={{
      width: w, minWidth: w, borderRight: noBorder ? 'none' : borderStyle,
      p: '2px 4px', display: 'flex', alignItems: 'center',
    }}>
      <Typography sx={{ fontSize: fontSize, lineHeight: 1.3 }}>{text}</Typography>
    </Box>
  );
}

function AuthRow({ label, name }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, borderBottom: '1px solid #ccc', pb: 0.5 }}>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: '7.5px', color: '#666' }}>{label}</Typography>
      </Box>
      <Box sx={{ flex: 1, borderBottom: '1px solid #999' }}>
        <Typography sx={{ fontSize: '8px', fontWeight: 600, textAlign: 'center' }}>Name</Typography>
        <Typography sx={{ fontSize: '10px', fontWeight: 700, textAlign: 'center' }}>{name}</Typography>
      </Box>
      <Box sx={{ flex: 1, borderBottom: '1px solid #999' }}>
        <Typography sx={{ fontSize: '8px', fontWeight: 600, textAlign: 'center' }}>Signature</Typography>
        <Box sx={{ height: 20 }} />
      </Box>
    </Box>
  );
}
