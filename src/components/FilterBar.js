import { useState } from 'react';
import { Badge, Box, Button, Chip, Drawer, Paper, Stack, Typography } from '@mui/material';
import { FilterListOutlined as FilterIcon, TuneOutlined as TuneIcon } from '@mui/icons-material';
import useAppLayout from '../hooks/useAppLayout';

/**
 * Filters that stay out of the way on a phone.
 *
 * Tablet and desktop: one card with every filter inline (as before).
 * Phone: the search box and a "Filters" button on one line; the other filters
 * open in a bottom sheet, and each active filter shows as a chip that clears
 * it with one tap. The records start right under the search box instead of
 * below a screen of stacked inputs.
 *
 *   <FilterBar search={<TextField … />} chips={[{ label: 'GH-01', onDelete }]} onClear={reset}>
 *     <Select … /> <TextField type="date" … />
 *   </FilterBar>
 */
export default function FilterBar({ search, children, chips = [], onClear, actions, sx }) {
  const { isPhone } = useAppLayout();
  const [open, setOpen] = useState(false);
  const active = chips.length;

  if (!isPhone) {
    return (
      <Paper sx={{ p: { xs: 3, sm: 4 }, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', ...sx }}>
        <FilterIcon color="action" />
        {children}
        {search}
        {actions}
      </Paper>
    );
  }

  return (
    <Box sx={{ mb: 1.5, ...sx }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'stretch', '& > .MuiFormControl-root, & > .MuiTextField-root': { flex: '1 1 auto', minWidth: 0, width: 'auto' } }}>
        {search}
        <Button
          variant={active ? 'contained' : 'outlined'}
          color="primary"
          onClick={() => setOpen(true)}
          startIcon={<Badge color="secondary" badgeContent={active} invisible={!active}><TuneIcon /></Badge>}
          sx={{ flexShrink: 0, minHeight: 44, px: 1.5, bgcolor: active ? undefined : 'background.paper' }}
        >
          Filters
        </Button>
      </Box>
      {(active > 0 || actions) && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1, alignItems: 'center' }}>
          {chips.map((c) => (
            <Chip key={c.key || c.label} size="small" label={c.label} onDelete={c.onDelete} color="primary" variant="outlined"
              sx={{ bgcolor: 'background.paper', maxWidth: '100%' }} />
          ))}
          {active > 1 && onClear && (
            <Button size="small" onClick={onClear} sx={{ minWidth: 0 }}>Clear all</Button>
          )}
          {actions}
        </Box>
      )}
      <Drawer
        anchor="bottom" open={open} onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85dvh' } } }}
      >
        <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 1.5 }}>
          <Typography variant="h6" sx={{ fontSize: '1.0625rem', fontWeight: 700, flex: 1 }}>Filters</Typography>
          {onClear && <Button onClick={onClear} disabled={!active}>Clear all</Button>}
        </Box>
        <Stack spacing={2} sx={{ p: 2, overflowY: 'auto', '& .MuiFormControl-root, & .MuiTextField-root': { width: '100%', minWidth: 0, flex: 'none' } }}>
          {children}
        </Stack>
        <Box sx={{ p: 2, pt: 0, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <Button fullWidth size="large" variant="contained" onClick={() => setOpen(false)}>Show results</Button>
        </Box>
      </Drawer>
    </Box>
  );
}
