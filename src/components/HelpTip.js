import { useId, useState } from 'react';
import { IconButton, Popover, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { HelpOutlineRounded as HelpIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

/**
 * A small "?" that opens a short explanation. Screens show options, not
 * paragraphs; anything worth explaining sits behind this icon.
 *
 *   <HelpTip>Submissions stay pending until a manager approves them.</HelpTip>
 */
export default function HelpTip({ children, label, size = 22, sx }) {
  const [anchor, setAnchor] = useState(null);
  const { i18n } = useTranslation();
  const isAr = String(i18n?.language || '').startsWith('ar');
  const id = useId();
  const open = Boolean(anchor);
  if (!children) return null;
  const name = label || (isAr ? 'شرح' : 'Help');
  return (
    <>
      <IconButton
        onClick={(e) => { e.stopPropagation(); setAnchor(open ? null : e.currentTarget); }}
        aria-label={name}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        data-help-tip=""
        sx={(t) => ({
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          p: 0,
          flexShrink: 0,
          verticalAlign: 'middle',
          color: open ? 'primary.main' : 'text.secondary',
          bgcolor: open ? alpha(t.palette.primary.main, 0.1) : 'transparent',
          '&:hover': { color: 'primary.main', bgcolor: alpha(t.palette.primary.main, 0.08) },
          '& .MuiSvgIcon-root': { fontSize: Math.round(size * 0.8) },
          '@media print': { display: 'none' },
          ...(typeof sx === 'function' ? sx(t) : sx),
        })}
      >
        <HelpIcon />
      </IconButton>
      <Popover
        id={id}
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: isAr ? 'right' : 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: isAr ? 'right' : 'left' }}
        slotProps={{ paper: { role: 'dialog', 'aria-label': name, sx: { mt: 0.75, p: 2, maxWidth: 340, width: 'calc(100vw - 32px)', '@media (min-width:420px)': { width: 'auto' } } } }}
      >
        <Typography component="div" sx={{ fontSize: '0.8125rem', lineHeight: 1.6 }}>{children}</Typography>
      </Popover>
    </>
  );
}
