import { useState, useRef, useEffect } from 'react';
import { Box, TextField, Typography } from '@mui/material';

/**
 * Click-to-edit text: display mode until clicked, then in-place TextField.
 * Parent controls whether editing is allowed (editMode + isEditor).
 */
export default function InlineEditableText({
  value = '',
  onChange,
  editable = false,
  multiline = false,
  minRows = 1,
  fontWeight,
  color,
  sx = {},
  placeholder = 'Click to edit…',
}) {
  const [active, setActive] = useState(false);
  const [local, setLocal] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!active) setLocal(value);
  }, [value, active]);

  useEffect(() => {
    if (active && inputRef.current) {
      inputRef.current.focus();
      const len = local?.length ?? 0;
      try {
        inputRef.current.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }
  }, [active, local]);

  const commit = () => {
    setActive(false);
    if (local !== value) onChange(local);
  };

  const cancel = () => {
    setLocal(value);
    setActive(false);
  };

  if (!editable) {
    return (
      <Typography
        component="span"
        sx={{ fontSize: 'inherit', lineHeight: 'inherit', fontWeight, color, ...sx }}
      >
        {value || '—'}
      </Typography>
    );
  }

  if (active) {
    return (
      <TextField
        inputRef={inputRef}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
          if (e.key === 'Enter' && !multiline && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        }}
        multiline={multiline}
        minRows={multiline ? minRows : undefined}
        size="small"
        fullWidth
        variant="outlined"
        placeholder={placeholder}
        sx={{
          '& .MuiInputBase-root': { fontSize: 'inherit', lineHeight: 'inherit' },
          '& .MuiInputBase-input': { py: 0.75, fontWeight },
          ...sx,
        }}
      />
    );
  }

  return (
    <Box
      component="span"
      onClick={() => setActive(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setActive(true);
        }
      }}
      role="button"
      tabIndex={0}
      sx={{
        display: 'block',
        cursor: 'text',
        borderRadius: 1,
        px: 0.5,
        mx: -0.5,
        minHeight: multiline ? 48 : 28,
        fontSize: 'inherit',
        lineHeight: 'inherit',
        fontWeight,
        color: color || 'text.primary',
        border: '1px dashed',
        borderColor: 'divider',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'action.hover',
        },
        ...sx,
      }}
    >
      {value || (
        <Typography component="span" color="text.disabled" fontStyle="italic">
          {placeholder}
        </Typography>
      )}
    </Box>
  );
}
