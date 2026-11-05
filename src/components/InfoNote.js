import { useLayoutEffect, useRef, useState } from 'react';
import { Alert, Box, ButtonBase } from '@mui/material';
import { ExpandMoreRounded as MoreIcon } from '@mui/icons-material';
import { useIsArabic } from '../i18n/shellLabels';

/**
 * Compact informational note.
 *
 * Long explanations ("View only — …", "Data entry workers fill …") used to take
 * two or three full-width lines on every page. InfoNote shows them as one slim
 * line with a small icon; when the text does not fit, a "More" toggle expands it
 * in place (tap / click / keyboard). Drop-in replacement for <Alert severity="info">.
 */
export default function InfoNote({ children, sx, icon, severity = 'info', ...rest }) {
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
        borderRadius: 2.5,
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
