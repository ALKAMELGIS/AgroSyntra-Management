import { Button, Checkbox, TableCell } from '@mui/material';
import { Delete } from '@mui/icons-material';

export const headerCheckboxSx = (t) => ({
  color: t.palette.table?.headerText || '#fff',
  '&.Mui-checked, &.MuiCheckbox-indeterminate': {
    color: t.palette.table?.headerText || '#fff',
  },
});

export function SelectAllCheckbox({ ids, selectedIds, onToggleAll, label = 'Select all rows', plain = false, sx }) {
  const list = ids || [];
  const selectedCount = list.filter((id) => selectedIds?.has(id)).length;
  const allSelected = list.length > 0 && selectedCount === list.length;
  const someSelected = selectedCount > 0 && selectedCount < list.length;
  return (
    <Checkbox
      size="small"
      sx={plain ? sx : [headerCheckboxSx, sx]}
      checked={allSelected}
      indeterminate={someSelected}
      disabled={list.length === 0}
      onChange={() => onToggleAll?.(list)}
      inputProps={{ 'aria-label': label }}
    />
  );
}

export function RowCheckbox({ id, selectedIds, onToggle, label = 'Select row' }) {
  return (
    <Checkbox
      size="small"
      checked={Boolean(selectedIds?.has(id))}
      onChange={() => onToggle?.(id)}
      inputProps={{ 'aria-label': label }}
    />
  );
}

export function SelectAllHeadCell({ ids, selectedIds, onToggleAll, label, className, sx, plain = false }) {
  return (
    <TableCell padding="checkbox" className={className} sx={sx}>
      <SelectAllCheckbox ids={ids} selectedIds={selectedIds} onToggleAll={onToggleAll} label={label} plain={plain} />
    </TableCell>
  );
}

export function RowSelectCell({ id, selectedIds, onToggle, label, className }) {
  return (
    <TableCell padding="checkbox" className={className} onClick={(e) => e.stopPropagation()}>
      <RowCheckbox id={id} selectedIds={selectedIds} onToggle={onToggle} label={label} />
    </TableCell>
  );
}

export function DeleteSelectedButton({ count, onClick, disabled, label = 'Delete selected' }) {
  if (!count) return null;
  return (
    <Button
      size="small"
      color="error"
      variant="contained"
      startIcon={<Delete />}
      onClick={onClick}
      disabled={disabled}
      sx={{ textTransform: 'none' }}
    >
      {label} ({count})
    </Button>
  );
}

export async function deleteIdsSequentially(ids, deleteOne) {
  let deleted = 0;
  for (const id of ids) {
    try {
      await deleteOne(id);
      deleted += 1;
    } catch {
      /* skip failed rows */
    }
  }
  return deleted;
}
