import { Toolbar, TextField, MenuItem, IconButton, Tooltip, Typography } from '@mui/material';
import { FileDownload as ExportIcon } from '@mui/icons-material';

export default function HarvestEntryToolbar({
  farmAreas = [],
  farmAreaId,
  onFarmAreaChange,
  fields = [],
  fieldId,
  onFieldChange,
  crops = [],
  cropName,
  onCropChange,
  varieties = [],
  variety,
  onVarietyChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onExport,
}) {
  return (
    <Toolbar
      sx={{
        px: 0,
        minHeight: '40px !important',
        flexWrap: 'wrap',
        gap: 1,
        mb: 1,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, mr: 0.5 }}>
        Filters
      </Typography>
      <TextField
        select
        size="small"
        label="Farm area"
        value={farmAreaId || ''}
        onChange={(e) => onFarmAreaChange?.(e.target.value)}
        sx={{ minWidth: 150 }}
      >
        <MenuItem value="">All farm areas</MenuItem>
        {farmAreas.map((area) => (
          <MenuItem key={area.id} value={area.id}>{area.name}</MenuItem>
        ))}
      </TextField>
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
      <TextField
        select
        size="small"
        label="Crop"
        value={cropName || ''}
        onChange={(e) => onCropChange?.(e.target.value)}
        sx={{ minWidth: 130 }}
      >
        <MenuItem value="">All crops</MenuItem>
        {crops.map((crop) => (
          <MenuItem key={crop.id || crop.name} value={crop.name}>{crop.name}</MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Variety"
        value={variety || ''}
        onChange={(e) => onVarietyChange?.(e.target.value)}
        sx={{ minWidth: 130 }}
      >
        <MenuItem value="">All varieties</MenuItem>
        {varieties.map((name) => (
          <MenuItem key={name} value={name}>{name}</MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        label="From"
        type="date"
        value={dateFrom || ''}
        onChange={(e) => onDateFromChange?.(e.target.value)}
        InputLabelProps={{ shrink: true }}
        sx={{ minWidth: 140 }}
      />
      <TextField
        size="small"
        label="To"
        type="date"
        value={dateTo || ''}
        onChange={(e) => onDateToChange?.(e.target.value)}
        InputLabelProps={{ shrink: true }}
        sx={{ minWidth: 140 }}
      />
      {onExport && (
        <Tooltip title="Export to Excel">
          <IconButton size="small" onClick={onExport} aria-label="Export to Excel">
            <ExportIcon />
          </IconButton>
        </Tooltip>
      )}
    </Toolbar>
  );
}
