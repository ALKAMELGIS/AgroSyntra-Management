import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

const FONT = '"Calibri", "Segoe UI", Arial, sans-serif';

export default function IrrigationStructurePlaceholder({
  structureLabel = '',
  siteName,
  year,
  fields = [],
}) {
  const label = structureLabel || 'structure';

  return (
    <Box sx={{ fontFamily: FONT }}>
      <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '14px' }}>
        Elite Agro Management LLC
      </Typography>
      <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '12px', mb: 0.5 }}>
        {siteName || 'Site'} — {label} Irrigation {year}
      </Typography>
      <Typography sx={{ fontFamily: FONT, fontSize: '12px', color: '#555', mb: 2 }}>
        {label} irrigation cycle template — coming soon
      </Typography>

      {fields.length === 0 ? (
        <Typography sx={{ fontFamily: FONT, fontSize: '11px', color: '#777' }}>
          No {label.toLowerCase()} fields on this site.
        </Typography>
      ) : (
        <TableContainer sx={{ border: '1px solid #ccc', maxWidth: 480 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#E6E0EC' }}>
                <TableCell sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '11px' }}>Field</TableCell>
                <TableCell sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '11px' }}>Farm Area</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((f) => (
                <TableRow key={f.id}>
                  <TableCell sx={{ fontFamily: FONT, fontSize: '11px' }}>{f.name}</TableCell>
                  <TableCell sx={{ fontFamily: FONT, fontSize: '11px' }}>{f.farmAreaName || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
