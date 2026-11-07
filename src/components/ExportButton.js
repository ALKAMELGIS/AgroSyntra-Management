import { Box, CircularProgress, IconButton, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { FileDownloadOutlined as DownloadIcon, PrintOutlined as PrintIcon } from '@mui/icons-material';

/** Tag colours: the colours people already associate with each file type. */
const FORMATS = {
  xlsx: { tag: 'XLS', color: '#1d6f42' },
  csv: { tag: 'CSV', color: '#1d6f42' },
  pdf: { tag: 'PDF', color: '#b3261e' },
  print: { tag: null, color: null },
};

/**
 * The one export control used across AgroCloud: a compact square icon button
 * (download arrow + a small file-type tag: XLS / CSV / PDF) with a tooltip and
 * an accessible name. Replaces wide "Export to Excel" text buttons.
 *
 *   <ExportButton onClick={exportToExcel} />                       // Excel
 *   <ExportButton format="pdf" label="Export period as PDF" … />
 *   <ExportButton loading={exporting} disabled={!rows.length} … />
 */
export default function ExportButton({
  onClick, label, format = 'xlsx', disabled = false, loading = false, size = 'medium', sx, ...rest
}) {
  const f = FORMATS[format] || FORMATS.xlsx;
  const name = label || (format === 'pdf' ? 'Export to PDF' : format === 'csv' ? 'Export CSV' : format === 'print' ? 'Print' : 'Export to Excel');
  const box = size === 'small' ? 32 : 40;
  const Icon = format === 'print' ? PrintIcon : DownloadIcon;

  return (
    <Tooltip title={name} arrow describeChild>
      {/* span keeps the tooltip working while the button is disabled */}
      <Box component="span" sx={{ display: 'inline-flex', flexShrink: 0, ...sx }}>
        <IconButton
          onClick={onClick}
          disabled={disabled || loading}
          aria-label={name}
          aria-busy={loading || undefined}
          data-export-button={format}
          {...rest}
          sx={(t) => ({
            position: 'relative',
            width: box,
            height: box,
            borderRadius: '10px',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            color: 'primary.main',
            '& .MuiSvgIcon-root': { fontSize: size === 'small' ? 18 : 20 },
            '&:hover': { borderColor: alpha(t.palette.primary.main, 0.5), bgcolor: alpha(t.palette.primary.main, 0.06), color: 'primary.main' },
            '&.Mui-disabled': { borderColor: 'divider', opacity: 0.5 },
          })}
        >
          {loading ? <CircularProgress size={18} color="inherit" /> : <Icon />}
          {f.tag && !loading && (
            <Box
              component="span"
              aria-hidden
              sx={{
                position: 'absolute',
                insetInlineEnd: -5,
                bottom: -5,
                px: '3px',
                minWidth: 20,
                height: 13,
                borderRadius: '4px',
                bgcolor: f.color,
                color: '#fff',
                fontSize: '8px',
                fontWeight: 700,
                lineHeight: '13px',
                letterSpacing: '0.02em',
                textAlign: 'center',
                boxShadow: (t) => `0 0 0 2px ${t.palette.background.default}`,
                direction: 'ltr',
              }}
            >
              {f.tag}
            </Box>
          )}
        </IconButton>
      </Box>
    </Tooltip>
  );
}
