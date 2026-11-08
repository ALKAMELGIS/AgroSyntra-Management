import { useState } from 'react';
import { Box, Drawer, IconButton, Tooltip, Typography } from '@mui/material';
import {
  AutoAwesomeOutlined as SparkIcon, CloseRounded as CloseIcon, AddCommentOutlined as NewIcon, OpenInFullRounded as FullIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AssistantChat from './AssistantChat';
import { useAuth } from '../../contexts/AuthContext';

const LAST_KEY = 'agrocloud_ai_last_conversation';
const readLast = () => { try { return localStorage.getItem(LAST_KEY) || null; } catch { return null; } };
const writeLast = (id) => { try { if (id) localStorage.setItem(LAST_KEY, id); else localStorage.removeItem(LAST_KEY); } catch { /* private mode */ } };

/** Top-bar button that opens the assistant beside any page. */
export default function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState(readLast);
  const navigate = useNavigate();
  const { user } = useAuth();
  const setConv = (id) => { setConversationId(id); writeLast(id); };

  return (
    <>
      <Tooltip title="AI Assistant">
        <IconButton aria-label="AI Assistant" onClick={() => setOpen(true)} sx={{ color: 'primary.main' }}>
          <SparkIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Drawer
        anchor="right" open={open} onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 }, display: 'flex', flexDirection: 'column' } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, height: 56, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <SparkIcon color="primary" fontSize="small" />
          <Typography component="h2" sx={{ fontWeight: 600, fontSize: '0.9375rem', flex: 1, ms: 0.5, ml: 0.5 }}>AI Assistant</Typography>
          <Tooltip title="New chat">
            <IconButton aria-label="New chat" onClick={() => setConv(null)}><NewIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Open full page">
            <IconButton aria-label="Open full page" onClick={() => { setOpen(false); navigate(conversationId ? `/assistant?c=${conversationId}` : '/assistant'); }}>
              <FullIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton aria-label="Close" onClick={() => setOpen(false)}><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {open && (
            <AssistantChat compact conversationId={conversationId} onConversation={setConv}
              isAdmin={['ceo', 'operation_manager'].includes(user?.role)} />
          )}
        </Box>
      </Drawer>
    </>
  );
}
