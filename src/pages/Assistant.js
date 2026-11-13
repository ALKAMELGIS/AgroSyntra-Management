import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Drawer, IconButton, List, ListItem, ListItemButton, ListItemText, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AddCommentOutlined as NewIcon, DeleteOutlineRounded as DeleteIcon, HistoryRounded as HistoryIcon,
  AutoAwesomeOutlined as SparkIcon,
} from '@mui/icons-material';
import HelpTip from '../components/HelpTip';
import AssistantChat from '../components/assistant/AssistantChat';
import * as api from '../components/assistant/aiApi';
import useAppLayout, { CONTENT_BLEED } from '../hooks/useAppLayout';
import { useAuth } from '../contexts/AuthContext';

const RAIL_WIDTH = 256;

function ChatList({ list, current, onOpen, onDelete, onNew }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ height: 52, px: 1.25, display: 'flex', alignItems: 'center', flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Button fullWidth size="small" variant="outlined" startIcon={<NewIcon />} onClick={onNew} sx={{ justifyContent: 'flex-start' }}>
          New chat
        </Button>
      </Box>
      <Typography sx={{ px: 2, pt: 1.5, pb: 0.5, fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', textTransform: 'none', letterSpacing: 0 }}>
        Chats
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 0.75, pb: 1 }}>
        {list.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 1.25, py: 1 }}>No chats yet.</Typography>}
        <List dense disablePadding>
          {list.map((c) => {
            const selected = c.id === current;
            return (
              <ListItem
                key={c.id}
                disablePadding
                sx={{
                  display: 'flex', alignItems: 'center', borderRadius: 1.25, mb: 0.25,
                  bgcolor: selected ? (t) => alpha(t.palette.primary.main, 0.1) : 'transparent',
                  '&:hover': { bgcolor: (t) => (selected ? alpha(t.palette.primary.main, 0.14) : t.palette.action.hover) },
                  '@media (hover: hover)': {
                    '& .chat-delete': { opacity: selected ? 1 : 0 },
                    '&:hover .chat-delete, &:focus-within .chat-delete': { opacity: 1 },
                  },
                }}
              >
                <ListItemButton
                  onClick={() => onOpen(c.id)}
                  aria-current={selected ? 'page' : undefined}
                  sx={{ minWidth: 0, borderRadius: 1.25, py: 0.5, px: 1.25, '&:hover': { bgcolor: 'transparent' } }}
                >
                  <ListItemText
                    primary={c.title}
                    secondary={String(c.updated_at || '').slice(0, 10)}
                    primaryTypographyProps={{ noWrap: true, fontSize: '0.8125rem', fontWeight: selected ? 600 : 400, color: selected ? 'primary.main' : 'text.primary' }}
                    secondaryTypographyProps={{ fontSize: '0.6875rem', component: 'bdi' }}
                  />
                </ListItemButton>
                <Tooltip title="Delete">
                  <IconButton className="chat-delete" size="small" aria-label="Delete" onClick={() => onDelete(c.id)}
                    sx={{ flexShrink: 0, width: 28, height: 28, mx: 0.25, color: 'text.secondary', transition: 'opacity .15s' }}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </ListItem>
            );
          })}
        </List>
      </Box>
    </Box>
  );
}

/**
 * Full-page assistant: one workspace card that fills the screen.
 * Desktop: chat history rail + wide chat. Tablet / phone: the chat uses the
 * whole width and the history opens as a drawer.
 */
export default function Assistant() {
  const [params, setParams] = useSearchParams();
  const conversationId = params.get('c') || null;
  const [list, setList] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { isMobile, isTablet, isPhone, scrollRegionHeight } = useAppLayout();
  const { user } = useAuth();
  const showRail = !isMobile && !isTablet;

  const load = useCallback(() => { api.listConversations().then((l) => setList(Array.isArray(l) ? l : [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load, conversationId]);

  const open = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('c', id); else next.delete('c');
    setParams(next, { replace: true });
    setHistoryOpen(false);
  };
  const remove = async (id) => {
    await api.deleteConversation(id).catch(() => {});
    if (id === conversationId) open(null);
    load();
  };

  const listProps = { list, current: conversationId, onOpen: open, onDelete: remove, onNew: () => open(null) };

  return (
    <Box
      sx={(t) => ({
        display: 'grid',
        gridTemplateColumns: showRail ? `${RAIL_WIDTH}px minmax(0, 1fr)` : 'minmax(0, 1fr)',
        height: scrollRegionHeight(isPhone ? 4 : 16),
        minHeight: 420,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        [t.breakpoints.down('sm')]: { mx: CONTENT_BLEED.xs, borderRadius: 0, borderLeft: 0, borderRight: 0 },
      })}
    >
      {showRail && (
        <Box component="nav" aria-label="Chats" sx={(t) => ({ borderInlineEnd: 1, borderColor: 'divider', bgcolor: alpha(t.palette.text.primary, 0.02), minHeight: 0 })}>
          <ChatList {...listProps} />
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: { xs: 1, sm: 1.5 }, height: 52, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
          {!showRail && (
            <Tooltip title="Chats">
              <IconButton aria-label="Chats" onClick={() => setHistoryOpen(true)} size="small"><HistoryIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          <SparkIcon color="primary" sx={{ fontSize: 18 }} />
          <Typography component="h1" className="page-title" noWrap sx={{ fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.01em', m: 0 }}>
            AI Assistant
          </Typography>
          <HelpTip size={20}>
            Answers come only from this system&apos;s database, limited to what you are allowed to see. Lists and reports open as tables you can export to Excel or PDF. The assistant reads only; it does not change data.
          </HelpTip>
          <Box sx={{ flex: 1 }} />
          {!showRail && (
            isPhone ? (
              <Tooltip title="New chat">
                <IconButton aria-label="New chat" onClick={() => open(null)} size="small" color="primary"><NewIcon fontSize="small" /></IconButton>
              </Tooltip>
            ) : (
              <Button size="small" variant="outlined" startIcon={<NewIcon />} onClick={() => open(null)}>New chat</Button>
            )
          )}
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <AssistantChat
            wide
            conversationId={conversationId}
            onConversation={open}
            isAdmin={['ceo', 'operation_manager'].includes(user?.role)}
          />
        </Box>
      </Box>

      {!showRail && (
        <Drawer anchor="left" open={historyOpen} onClose={() => setHistoryOpen(false)}
          slotProps={{ paper: { sx: { width: { xs: '86%', sm: 320 }, maxWidth: 360 } } }}>
          <Box component="nav" aria-label="Chats" sx={{ height: '100%' }}>
            <ChatList {...listProps} />
          </Box>
        </Drawer>
      )}
    </Box>
  );
}
