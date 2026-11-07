import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Box, ButtonBase, IconButton, Popover, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { InfoOutlined as InfoIcon, ExpandMoreRounded as MoreIcon } from '@mui/icons-material';
import { useIsArabic } from '../i18n/shellLabels';

/**
 * Icon-only informational note.
 *
 * Long explanations ("View only — …", "Data entry workers fill …") no longer take
 * space on the page: only a small icon is shown, and tapping / clicking it (or
 * Enter / Space) opens the full text in a small popup next to the icon.
 * Drop-in replacement for <Alert severity="info">…</Alert>.
 *
 * Props: children (the message), icon (optional custom icon), label (accessible
 * name for the icon; defaults to "Information"), sx (outer spacing).
 *
 * mode="line" keeps status messages that must be seen at a glance ("No fields in
 * this farm area", "12 of 15 columns mapped") visible as one slim line with a
 * More toggle instead of hiding them behind the icon.
 */
export default function InfoNote({ mode = 'icon', ...props }) {
  if (mode === 'line') return <InfoLine {...props} />;
  return <InfoIconNote {...props} />;
}

function InfoIconNote({ children, sx, icon, label, severity = 'info', showLabel = false }) {
  const [anchor, setAnchor] = useState(null);
  const isAr = useIsArabic();
  const popId = useId();
  const open = Boolean(anchor);
  const name = label || (isAr ? 'معلومات' : 'Information');

  return (
    <Box sx={{ display: 'flex', mb: 1, ...sx, '@media print': { display: 'none' } }}>
      {showLabel ? (
        <ButtonBase
          onClick={(e) => setAnchor(open ? null : e.currentTarget)}
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          aria-haspopup="dialog"
          data-info-note=""
          sx={(t) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1.5,
            height: 28,
            px: 2.5,
            borderRadius: 999,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'text.secondary',
            bgcolor: open ? alpha(t.palette.text.primary, 0.1) : alpha(t.palette.text.primary, 0.06),
            '&:hover': { bgcolor: alpha(t.palette.text.primary, 0.1) },
            '& .MuiSvgIcon-root': { fontSize: 16 },
          })}
        >
          {icon || <InfoIcon />}
          {name}
        </ButtonBase>
      ) : (
        <IconButton
        size="small"
        onClick={(e) => setAnchor(open ? null : e.currentTarget)}
        aria-label={name}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-haspopup="dialog"
        data-info-note=""
        sx={(t) => ({
          width: 32,
          height: 32,
          p: 0,
          color: `${severity}.main`,
          bgcolor: open ? alpha(t.palette[severity]?.main || t.palette.info.main, 0.12) : 'transparent',
          '&:hover': { bgcolor: alpha(t.palette[severity]?.main || t.palette.info.main, 0.1), color: `${severity}.main` },
          '& .MuiSvgIcon-root': { fontSize: 18 },
        })}
      >
        {icon || <InfoIcon />}
      </IconButton>
      )}
      <Popover
        id={popId}
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: isAr ? 'right' : 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: isAr ? 'right' : 'left' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': name,
            sx: { mt: 1, p: 3.5, maxWidth: 380, width: 'calc(100vw - 32px)', '@media (min-width:420px)': { width: 'auto' } },
          },
        }}
      >
        <Typography component="div" sx={{ fontSize: '0.8125rem', lineHeight: 1.6, color: 'text.primary' }}>
          {children}
        </Typography>
      </Popover>
    </Box>
  );
}



/**
 * One-line status note (mode="line").
 *
 * Long explanations ("View only — …", "Data entry workers fill …") used to take
 * two or three full-width lines on every page. InfoNote shows them as one slim
 * line with a small icon; when the text does not fit, a "More" toggle expands it
 * in place (tap / click / keyboard). Drop-in replacement for <Alert severity="info">.
 */
function InfoLine({ children, sx, icon, severity = 'info', ...rest }) {
  const textRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const isAr = useIsArabic();

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return undefined;
    const check = () => {
      if (!open) setOverflowing(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    };
    check();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, children]);

  const toggle = overflowing || open;

  return (
    <Alert
      severity={severity}
      icon={icon}
      {...rest}
      sx={{
        py: 0,
        px: 3,
        minHeight: 36,
        alignItems: 'center',
        borderRadius: 1.5,
        fontSize: '0.8125rem',
        '& .MuiAlert-icon': { py: 0, mr: 2, fontSize: 18, alignSelf: open ? 'flex-start' : 'center', mt: open ? 2 : 0 },
        '& .MuiAlert-icon .MuiSvgIcon-root': { fontSize: 18 },
        '& .MuiAlert-message': {
          py: 2,
          display: 'flex',
          alignItems: open ? 'flex-start' : 'center',
          gap: 2,
          width: '100%',
          minWidth: 0,
          overflow: 'visible',
        },
        ...sx,
      }}
    >
      <Box
        ref={textRef}
        component="span"
        sx={{
          flex: 1,
          minWidth: 0,
          lineHeight: 1.5,
          ...(open
            ? { whiteSpace: 'normal' }
            : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
          // Nested blocks (lists, paragraphs) collapse to a single line too.
          ...(!open && { '& > *': { display: 'inline', m: 0 }, '& ul, & ol': { display: 'inline', p: 0 }, '& li': { display: 'inline', mr: 1 } }),
        }}
      >
        {children}
      </Box>
      {toggle && (
        <ButtonBase
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          sx={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1.5,
            minHeight: 24,
            borderRadius: 999,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'inherit',
            opacity: 0.85,
            '&:hover': { opacity: 1, bgcolor: 'action.hover' },
          }}
        >
          {open ? (isAr ? 'أقل' : 'Less') : (isAr ? 'المزيد' : 'More')}
          <MoreIcon sx={{ fontSize: 16, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />
        </ButtonBase>
      )}
    </Alert>
  );
}
