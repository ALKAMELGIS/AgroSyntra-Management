import { useState, useMemo } from 'react';
import {
  Popover, Box, Typography, Checkbox, FormControlLabel, TextField,
  IconButton, Chip, Tooltip, Divider, Button,
} from '@mui/material';
import { FilterList as FilterIcon, Close as CloseIcon } from '@mui/icons-material';
import { getLocationOptionsForField } from '../utils/plantingSegment';
import { classifyAllowedTokens } from '../utils/plantingOccupancy';

const chipSx = { height: 22, fontSize: '0.68rem', cursor: 'pointer' };

export default function SegmentSelector({
  value,
  onChange,
  fieldId,
  plantingRecords = [],
  compact = false,
  allowedTokens = null,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [freeText, setFreeText] = useState('');
  const restrictToAllowed = Array.isArray(allowedTokens);

  const segmentOptions = useMemo(() => {
    if (restrictToAllowed) {
      return classifyAllowedTokens(allowedTokens);
    }
    if (!fieldId) return { valves: [], bays: [], spots: false, extras: [] };

    const { bays, valves, hasPlantingSegments } = getLocationOptionsForField(
      fieldId,
      plantingRecords,
      { valveCountFallback: 4 },
    );

    return {
      valves: valves.map((v) => Number(String(v).replace(/^V/i, '')) || 0).filter((n) => n > 0),
      bays: bays.map((b) => Number(String(b).replace(/^B/i, '')) || 0).filter((n) => n > 0),
      spots: hasPlantingSegments || true,
      extras: [],
    };
  }, [fieldId, plantingRecords, allowedTokens, restrictToAllowed]);

  const selectedItems = useMemo(() => {
    if (!value) return new Set();
    return new Set(value.split(',').map(s => s.trim()).filter(Boolean));
  }, [value]);

  const isAllSelected = value === 'ALL';

  const handleSelectAll = () => {
    if (isAllSelected) {
      onChange('');
    } else {
      onChange('ALL');
    }
  };

  const handleToggle = (item) => {
    const next = new Set(selectedItems);
    next.delete('ALL');
    if (next.has(item)) next.delete(item);
    else next.add(item);
    onChange([...next].join(', '));
  };

  const handleFreeTextAdd = () => {
    if (!freeText.trim()) return;
    const next = new Set(selectedItems);
    next.add(freeText.trim());
    onChange([...next].join(', '));
    setFreeText('');
  };

  const handleClear = () => {
    onChange('');
  };

  const open = Boolean(anchorEl);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      <Box
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          flex: 1, cursor: 'pointer', minHeight: 28, display: 'flex',
          alignItems: 'center', flexWrap: 'wrap', gap: 0.3, px: 0.5,
          border: '1px solid transparent', borderRadius: 0.5,
          '&:hover': { border: '1px solid', borderColor: 'primary.light' },
          fontSize: '0.72rem',
        }}
      >
        {value ? (
          compact ? <Typography sx={{ fontSize: '0.72rem' }} noWrap>{isAllSelected ? 'All (Entire Field)' : value}</Typography> :
          isAllSelected ? (
            <Chip label="All (Entire Field)" size="small" sx={chipSx} variant="outlined" color="primary"
              onDelete={() => onChange('')} />
          ) :
          value.split(',').map((s, i) => s.trim()).filter(Boolean).map((s, i) => (
            <Chip key={i} label={s} size="small" sx={chipSx} variant="outlined"
              onDelete={() => {
                const next = [...selectedItems].filter(x => x !== s);
                onChange(next.join(', '));
              }} />
          ))
        ) : (
          <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>Select segments...</Typography>
        )}
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 1.5, minWidth: 280, maxWidth: 360 } } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>Select Segments</Typography>
          <IconButton size="small" onClick={() => setAnchorEl(null)}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
        </Box>

        <Box sx={{ mb: 1 }}>
          <FormControlLabel sx={{ m: 0 }}
            control={<Checkbox size="small" sx={{ p: 0.3 }}
              checked={isAllSelected}
              onChange={handleSelectAll} />}
            label={<Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>All (Entire Field)</Typography>} />
        </Box>

        <Divider sx={{ mb: 1 }} />

        {segmentOptions.valves.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>Valves</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.3 }}>
              {segmentOptions.valves.map(v => (
                <FormControlLabel key={`V${v}`} sx={{ m: 0, mr: 0.5 }}
                  control={<Checkbox size="small" sx={{ p: 0.3 }}
                    checked={selectedItems.has(`V${v}`) || selectedItems.has(String(v))}
                    onChange={() => handleToggle(`V${v}`)} />}
                  label={<Typography sx={{ fontSize: '0.72rem' }}>V{v}</Typography>} />
              ))}
            </Box>
          </Box>
        )}

        {segmentOptions.bays.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>Bays</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.3 }}>
              {segmentOptions.bays.map(b => (
                <FormControlLabel key={`B${b}`} sx={{ m: 0, mr: 0.5 }}
                  control={<Checkbox size="small" sx={{ p: 0.3 }}
                    checked={selectedItems.has(`B${b}`)}
                    onChange={() => handleToggle(`B${b}`)} />}
                  label={<Typography sx={{ fontSize: '0.72rem' }}>B{b}</Typography>} />
              ))}
            </Box>
          </Box>
        )}

        {segmentOptions.spots && (
          <Box sx={{ mb: 1 }}>
            <FormControlLabel sx={{ m: 0 }}
              control={<Checkbox size="small" sx={{ p: 0.3 }}
                checked={selectedItems.has('S')}
                onChange={() => handleToggle('S')} />}
              label={<Typography sx={{ fontSize: '0.72rem' }}>Spot (S)</Typography>} />
          </Box>
        )}

        {(segmentOptions.extras || []).length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>Occupied</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2, mt: 0.3 }}>
              {segmentOptions.extras.map((token) => (
                <FormControlLabel key={token} sx={{ m: 0 }}
                  control={<Checkbox size="small" sx={{ p: 0.3 }}
                    checked={selectedItems.has(token)}
                    onChange={() => handleToggle(token)} />}
                  label={<Typography sx={{ fontSize: '0.72rem' }}>{token}</Typography>} />
              ))}
            </Box>
          </Box>
        )}

        {!restrictToAllowed && (
          <>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <TextField size="small" placeholder="Free text (e.g. Structure)"
                value={freeText} onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFreeTextAdd(); } }}
                sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.72rem', py: 0.5 } }} />
              <Button size="small" variant="outlined" onClick={handleFreeTextAdd}
                disabled={!freeText.trim()} sx={{ minWidth: 40, fontSize: '0.65rem' }}>Add</Button>
            </Box>
          </>
        )}

        {value && (
          <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="small" color="error" onClick={handleClear} sx={{ fontSize: '0.65rem' }}>Clear All</Button>
          </Box>
        )}
      </Popover>
    </Box>
  );
}

export function SegmentColumnFilter({ value, onChange, allSegments = [] }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const uniqueSegments = useMemo(() => {
    const set = new Set();
    allSegments.forEach(seg => {
      if (seg) set.add(seg.trim());
    });
    return [...set].sort();
  }, [allSegments]);

  const selected = useMemo(() => {
    if (!value) return new Set();
    return new Set(value.split('||').filter(Boolean));
  }, [value]);

  const handleToggle = (seg) => {
    const next = new Set(selected);
    if (next.has(seg)) next.delete(seg);
    else next.add(seg);
    onChange([...next].join('||'));
  };

  return (
    <>
      <Tooltip title="Filter segments">
        <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ p: 0.2, ml: 0.3 }}>
          <FilterIcon sx={{ fontSize: 14, color: value ? 'primary.main' : 'text.disabled' }} />
        </IconButton>
      </Tooltip>
      <Popover open={open} anchorEl={anchorEl} onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 1.5, minWidth: 200, maxHeight: 300, overflow: 'auto' } } }}
      >
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Filter by Segment</Typography>
        {uniqueSegments.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No segments recorded</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
            {uniqueSegments.map(seg => (
              <FormControlLabel key={seg} sx={{ m: 0 }}
                control={<Checkbox size="small" sx={{ p: 0.3 }}
                  checked={selected.has(seg)}
                  onChange={() => handleToggle(seg)} />}
                label={<Typography sx={{ fontSize: '0.72rem' }}>{seg}</Typography>} />
            ))}
          </Box>
        )}
        {value && (
          <Button size="small" onClick={() => onChange('')} sx={{ mt: 1, fontSize: '0.65rem' }}>Clear Filter</Button>
        )}
      </Popover>
    </>
  );
}
