import {
  Toolbar,
  Typography,
  Box,
  TextField,
  MenuItem,
  InputBase,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  FileDownload as ExportIcon,
} from '@mui/icons-material';
import { DATE_PRESETS } from '../../utils/entryDateRange';

export default function EntryHistoryToolbar({
  title = 'All Entries',
  datePreset,
  onDatePresetChange,
  filterText,
  onFilterTextChange,
  onExport,
  loading = false,
  entryCount = 0,
  bulkDeleteSlot,
  farmAreas,
  farmAreaId,
  onFarmAreaChange,
  fields,
  fieldId,
  onFieldChange,
}) {
  return (
    <Toolbar
      sx={{
        pl: { sm: 2 },
        pr: { xs: 1, sm: 1 },
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        borderRadius: '12px 12px 0 0',
        flexWrap: 'wrap',
        gap: 1,
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mr: 1 }}>
        {title}
      </Typography>
      {loading && <CircularProgress size={18} sx={{ mr: 1 }} />}
      {!loading && entryCount > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
          ({entryCount})
        </Typography>
      )}

      <TextField
        select
        size="small"
        value={datePreset}
        onChange={(e) => onDatePresetChange(e.target.value)}
        sx={{ minWidth: 130 }}
      >
        {DATE_PRESETS.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.label}
          </MenuItem>
        ))}
      </TextField>

      {farmAreas && (
        <TextField
          select
          size="small"
          label="Farm area"
          value={farmAreaId || ''}
          onChange={(e) => onFarmAreaChange?.(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All farm areas</MenuItem>
          {farmAreas.map((area) => (
            <MenuItem key={area.id} value={area.id}>{area.name}</MenuItem>
          ))}
        </TextField>
      )}

      {fields && (
        <TextField
          select
          size="small"
          label="Field"
          value={fieldId || ''}
          onChange={(e) => onFieldChange?.(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All fields</MenuItem>
          {fields.map((field) => (
            <MenuItem key={field.id} value={field.id}>{field.name}</MenuItem>
          ))}
        </TextField>
      )}

      {bulkDeleteSlot}

      {onExport && (
        <Tooltip title="Export to Excel">
          <IconButton size="small" onClick={onExport} sx={{ mr: 1 }}>
            <ExportIcon />
          </IconButton>
        </Tooltip>
      )}

      <Box
        sx={{
          flex: '1 1 200px',
          maxWidth: 300,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          pl: 1,
        }}
      >
        <SearchIcon sx={{ color: 'text.secondary', mr: 1, fontSize: 20 }} />
        <InputBase
          placeholder="Search entries..."
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          sx={{ width: '100%', fontSize: '0.875rem' }}
        />
      </Box>
    </Toolbar>
  );
}
