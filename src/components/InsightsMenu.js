import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography,
} from '@mui/material';
import {
  HelpOutlineRounded as QueryIcon, DescriptionOutlined as SummaryIcon, AssessmentOutlined as BriefIcon,
} from '@mui/icons-material';
import { useShellLabel } from '../i18n/shellLabels';

/** Overview pages reached from the top bar instead of the side menu. */
export const INSIGHT_ITEMS = [
  { text: 'Summary & Contents', path: '/summary', icon: SummaryIcon },
  { text: 'Daily Brief', path: '/daily-brief', icon: BriefIcon },
];
export const INSIGHT_PATHS = new Set(INSIGHT_ITEMS.map((i) => i.path));

/** Top-bar "?" that opens a short menu with the overview pages. */
export default function InsightsMenu() {
  const [anchor, setAnchor] = useState(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const L = useShellLabel();
  const open = Boolean(anchor);
  const active = INSIGHT_PATHS.has(pathname);

  return (
    <>
      <Tooltip title={L('Overview')}>
        <IconButton
          aria-label={L('Overview')}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? 'insights-menu' : undefined}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ color: active ? 'primary.main' : 'text.secondary' }}
        >
          <QueryIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        id="insights-menu"
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { mt: 0.5, minWidth: 220, borderRadius: 2 } } }}
      >
        <Typography sx={{ px: 2, pt: 0.75, pb: 0.5, fontSize: '0.6875rem', fontWeight: 600, color: 'text.secondary' }}>
          {L('Overview')}
        </Typography>
        {INSIGHT_ITEMS.map(({ text, path, icon: Icon }) => (
          <MenuItem
            key={path}
            selected={pathname === path}
            onClick={() => { setAnchor(null); navigate(path); }}
            sx={{ minHeight: 40, fontSize: '0.8125rem' }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}><Icon sx={{ fontSize: 18 }} /></ListItemIcon>
            <ListItemText primary={L(text)} primaryTypographyProps={{ fontSize: '0.8125rem' }} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
