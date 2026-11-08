import { useEffect, useRef, useState } from 'react';
import {
  Alert, Avatar, Box, ButtonBase, Chip, CircularProgress, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  ArrowUpwardRounded as SendIcon, AutoAwesomeOutlined as SparkIcon, DescriptionOutlined as FormIcon,
  BarChartRounded as ChartIcon, WarningAmberRounded as PhiIcon, PaidOutlined as CostIcon, HelpOutlineRounded as HowIcon,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import MiniMarkdown from './MiniMarkdown';
import ArtifactView from './ArtifactView';
import * as api from './aiApi';

const SUGGESTIONS_AR = [
  'كم إجمالي الحصاد هذا الشهر لكل حقل؟',
  'ما الحقول التي عليها فترة ما قبل الحصاد سارية الآن؟',
  'تقرير تكلفة المبيدات لكل موقع هذا الموسم',
  'كيف أسجّل تطبيق مبيد جديد؟',
];
const SUGGESTION_ICONS = [ChartIcon, PhiIcon, CostIcon, HowIcon];
const SUGGESTIONS_EN = [
  'Total harvest this month per field?',
  'Which fields are inside an active PHI now?',
  'Pesticide cost per site this season',
  'How do I record a new pesticide application?',
];

function Message({ m, ar }) {
  const mine = m.role === 'user';
  return (
    <Box sx={{ display: 'flex', gap: 1, justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-start' }}>
      {!mine && (
        <Avatar sx={{ width: 26, height: 26, bgcolor: 'primary.main', mt: 0.25 }}><SparkIcon sx={{ fontSize: 15 }} /></Avatar>
      )}
      <Box sx={{ maxWidth: mine ? '85%' : '100%', minWidth: 0, flex: mine ? '0 1 auto' : 1 }}>
        <Box sx={(t) => ({
          px: mine ? 1.5 : 0, py: mine ? 1 : 0.25, borderRadius: 2,
          bgcolor: mine ? alpha(t.palette.primary.main, 0.1) : 'transparent',
          color: 'text.primary', fontSize: '0.875rem', whiteSpace: mine ? 'pre-wrap' : 'normal', overflowWrap: 'anywhere',
        })}
        >
          {mine ? m.content : <MiniMarkdown text={m.content} />}
        </Box>
        {(m.artifacts || []).map((a, i) => <ArtifactView key={i} artifact={a} />)}
        {!mine && (m.sources || []).length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
            {m.sources.map((s) => (
              <Tooltip key={s.form_id} title={`FORM_ID ${s.form_id}`}>
                <Chip size="small" variant="outlined" icon={<FormIcon />} label={<span translate="no">{ar ? s.title_ar || s.title_en : s.title_en}</span>} />
              </Tooltip>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * The assistant conversation. Used in the side panel and on the full page.
 * Every answer comes from the server (tools over the system database).
 */
export default function AssistantChat({ conversationId, onConversation, compact = false, wide = false, isAdmin = false }) {
  const theme = useTheme();
  const ar = theme.direction === 'rtl';
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [configured, setConfigured] = useState(true);
  const endRef = useRef(null);
  const skipLoad = useRef(null);

  useEffect(() => {
    api.aiStatus().then((s) => setConfigured(Boolean(s?.configured))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    if (skipLoad.current === conversationId) { skipLoad.current = null; return; }
    api.getMessages(conversationId).then(setMessages).catch((e) => setError({ message: e.message }));
  }, [conversationId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const send = async (value) => {
    const q = String(value ?? text).trim();
    if (!q || busy) return;
    setText('');
    setError(null);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: q }]);
    setBusy(true);
    try {
      const res = await api.ask({ conversationId: conversationId || null, text: q, lang: ar ? 'ar' : 'en' });
      setMessages((m) => [...m, res.message]);
      if (res.conversationId !== conversationId) {
        skipLoad.current = res.conversationId;
        onConversation?.(res.conversationId);
      }
    } catch (e) {
      setError({ message: e.message, code: e.code });
    } finally {
      setBusy(false);
    }
  };

  const suggestions = ar ? SUGGESTIONS_AR : SUGGESTIONS_EN;

  // Reading width: long lines are hard to follow, so on the full page the
  // conversation and composer are centred in a comfortable column.
  const column = wide ? { maxWidth: 920, mx: 'auto', width: '100%' } : {};

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: compact ? 1.5 : { xs: 1.5, sm: 2.5, md: 3 }, py: compact ? 1.5 : { xs: 2, md: 3 } }}>
        <Box sx={column}>
          {!configured && (
            <Alert severity="info" sx={{ mb: 1.5, py: 0, alignItems: 'center', fontSize: '0.8125rem', '& .MuiAlert-icon': { py: 0.75 } }}>
              {isAdmin
                ? <>The assistant needs an AI key. <RouterLink to="/admin/api-keys">Settings → API Keys → AI Brain</RouterLink></>
                : 'The assistant is not set up yet. Ask your administrator.'}
            </Alert>
          )}
          {messages.length === 0 && !busy ? (
            <Box sx={{ pt: compact ? 2 : { xs: 3, md: 8 }, px: { xs: 0, sm: 1 } }}>
              <Box sx={{ textAlign: 'center', mb: { xs: 2.5, md: 3.5 } }}>
                <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main', mx: 'auto', mb: 1.25 }}><SparkIcon sx={{ fontSize: 20 }} /></Avatar>
                <Typography component="h2" sx={{ fontWeight: 600, fontSize: { xs: '1.0625rem', md: '1.25rem' }, letterSpacing: '-0.01em' }}>How can I help?</Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: compact ? '1fr' : '1fr 1fr' }, gap: 1, maxWidth: 680, mx: 'auto' }}>
                {suggestions.map((s, i) => {
                  const Icon = SUGGESTION_ICONS[i % SUGGESTION_ICONS.length];
                  return (
                    <ButtonBase
                      key={s}
                      onClick={() => send(s)}
                      disabled={!configured}
                      sx={(t) => ({
                        display: 'flex', alignItems: 'center', gap: 1.25, justifyContent: 'flex-start', textAlign: 'start',
                        px: 1.5, py: 1.25, minHeight: 52, borderRadius: 1.5, border: 1, borderColor: 'divider',
                        bgcolor: 'background.paper', fontFamily: 'inherit', fontSize: '0.8125rem', color: 'text.primary', lineHeight: 1.4,
                        transition: 'border-color .15s, background-color .15s',
                        '&:hover': { borderColor: alpha(t.palette.primary.main, 0.5), bgcolor: alpha(t.palette.primary.main, 0.04) },
                        '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
                        '&.Mui-disabled': { opacity: 0.6 },
                      })}
                    >
                      <Box sx={(t) => ({ width: 28, height: 28, borderRadius: 1, display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: alpha(t.palette.primary.main, 0.1), color: 'primary.main' })}>
                        <Icon sx={{ fontSize: 16 }} />
                      </Box>
                      <span>{s}</span>
                    </ButtonBase>
                  );
                })}
              </Box>
            </Box>
          ) : (
            <Stack spacing={2.5}>
              {messages.map((m) => <Message key={m.id} m={m} ar={ar} />)}
              {busy && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2">Reading the data…</Typography>
                </Box>
              )}
            </Stack>
          )}
          {error && <Alert severity={error.code === 'RATE_LIMITED' ? 'warning' : 'error'} sx={{ mt: 1.5 }}>{error.message}</Alert>}
          <div ref={endRef} />
        </Box>
      </Box>

      <Box component="form" onSubmit={(e) => { e.preventDefault(); send(); }}
        sx={{ p: compact ? 1.25 : { xs: 1, sm: 1.5, md: 2 }, pt: compact ? 1.25 : { xs: 1, md: 1 }, borderTop: compact ? 1 : 0, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
        <Box sx={column}>
        <TextField
          fullWidth multiline maxRows={5} size="small" value={text} disabled={busy || !configured}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          placeholder="Ask about your data…"
          inputProps={{ 'aria-label': 'Ask about your data…' }}
          InputProps={{
            sx: { borderRadius: 3, pr: 0.75, pl: 0.5, py: compact ? undefined : 1, bgcolor: (t) => alpha(t.palette.text.primary, 0.03), fontSize: '0.875rem' },
            endAdornment: (
              <InputAdornment position="end">
                <IconButton type="submit" aria-label="Send" disabled={busy || !text.trim()} color="primary"
                  sx={{ bgcolor: text.trim() ? 'primary.main' : 'action.hover', color: text.trim() ? 'common.white' : 'text.disabled', '&:hover': { bgcolor: 'primary.dark' }, width: 32, height: 32 }}>
                  <SendIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        </Box>
      </Box>
    </Box>
  );
}
