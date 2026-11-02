import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Paper, TextField, IconButton, LinearProgress,
  Button, Avatar, Alert,
} from '@mui/material';
import { ArrowBackOutlined as ArrowBack, SendOutlined as Send, SmartToyOutlined as SmartToy, PersonOutlined as Person } from '@mui/icons-material';
import { apiRequest } from '../../utils/api';

export default function InternshipAITutor() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  const { data: chat, isLoading } = useQuery({
    queryKey: ['training-ai-chat', moduleId],
    queryFn: () => apiRequest(`/training/ai/chat/${moduleId}`),
    select: (res) => res?.data !== undefined ? res.data : res,
  });

  useEffect(() => {
    if (chat?.messages) setMessages(chat.messages);
  }, [chat]);

  const sendMutation = useMutation({
    mutationFn: (message) => apiRequest('/training/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ moduleId, message }),
    }),
    onMutate: (message) => {
      setMessages((prev) => [...prev, { role: 'user', content: message, timestamp: new Date().toISOString() }]);
    },
    onSuccess: (res) => {
      const data = res?.data !== undefined ? res.data : res;
      setMessages((prev) => [...prev, { role: 'assistant', content: data?.reply || 'No response received.', timestamp: new Date().toISOString() }]);
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I could not get a response. Please try again.', timestamp: new Date().toISOString(), _error: true }]);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || sendMutation.isLoading) return;
    sendMutation.mutate(input.trim());
    setInput('');
  };

  if (isLoading) return <LinearProgress />;

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate(`/internship/module/${moduleId}`)}>
          Back
        </Button>
        <SmartToy color="primary" />
        <Typography variant="h6" fontWeight={600}>AI Tutor</Typography>
      </Box>

      <Paper sx={{ flexGrow: 1, overflow: 'auto', p: 2, mb: 2, bgcolor: 'background.muted' }}>
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', mt: 8 }}>
            <SmartToy sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Ask me anything about this module!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              I can explain concepts, give examples, or help you prepare for quizzes.
            </Typography>
          </Box>
        )}

        {messages.map((msg, idx) => (
          <Box
            key={idx}
            sx={{
              display: 'flex',
              gap: 1.5,
              mb: 2,
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            }}
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: msg.role === 'user' ? 'primary.main' : 'secondary.main' }}>
              {msg.role === 'user' ? <Person fontSize="small" /> : <SmartToy fontSize="small" />}
            </Avatar>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                maxWidth: '75%',
                bgcolor: msg.role === 'user' ? 'action.selected' : 'white',
                border: '1px solid',
                borderColor: msg.role === 'user' ? 'primary.light' : 'divider',
                borderRadius: 2,
                whiteSpace: 'pre-wrap',
              }}
            >
              <Typography variant="body2">{msg.content}</Typography>
            </Paper>
          </Box>
        ))}

        {sendMutation.isLoading && (
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
              <SmartToy fontSize="small" />
            </Avatar>
            <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">Thinking...</Typography>
            </Paper>
          </Box>
        )}
        {sendMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to get a response. Make sure the AI service is configured.
          </Alert>
        )}
        <div ref={messagesEndRef} />
      </Paper>

      <Paper sx={{ p: 1, display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Ask a question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={sendMutation.isLoading}
          multiline
          maxRows={3}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!input.trim() || sendMutation.isLoading}
         aria-label="Send">
          <Send />
        </IconButton>
      </Paper>
    </Box>
  );
}
