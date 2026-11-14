import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Tabs, Tab, Paper, Grid, Card, CardContent,
  Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Select, MenuItem, FormControl, InputLabel, Chip,
  Table, TableHead, TableRow, TableCell, TableBody, Alert, LinearProgress,
  Switch, FormControlLabel, Divider, CircularProgress, Backdrop, Radio, Checkbox, ListItemText,
} from '@mui/material';
import {
  AddOutlined as Add, DeleteOutlined as Delete, EditOutlined as Edit, AutoAwesomeOutlined as AutoAwesome, MenuBookOutlined as MenuBook, QuizOutlined as Quiz,
  SchoolOutlined as School, AssessmentOutlined as Assessment, UploadFileOutlined as UploadFile, CloseOutlined as Close, SendOutlined as Send, ChatOutlined as Chat,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { canAuthorTraining } from '../../utils/roleAccess';
import InfoNote from '../../components/InfoNote';
import PageTitle from '../../components/PageTitle';

export default function TeacherPanel() {
  const { t } = useTranslation();
  // Only the intern teacher authors lessons, quizzes and questions; managers see grades only.
  const canAuthor = canAuthorTraining(useAuth().user);
  const [tab, setTab] = useState(0);
  const [selectedModule, setSelectedModule] = useState('');
  const queryClient = useQueryClient();

  const { data: modules = [] } = useQuery({
    queryKey: ['training-modules'],
    queryFn: () => apiRequest('/training/modules'),
    select: (res) => Array.isArray(res) ? res : (res?.data || []),
  });

  if (!canAuthor) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <PageTitle sx={{ mb: 1 }}>
          Teacher Panel
        </PageTitle>
        <InfoNote severity="info" sx={{ mb: 3 }}>{t('adminAccess.trainingAuthorOnly')}</InfoNote>
        <GradeViewer />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Teacher Panel
      </Typography>

      <FormControl size="small" sx={{ mb: 3, minWidth: 300 }}>
        <InputLabel id="teacherpanel-select-module-label-1">Select Module</InputLabel>
        <Select labelId="teacherpanel-select-module-label-1" value={selectedModule} onChange={(e) => setSelectedModule(e.target.value)} label="Select Module">
          {modules.map((m) => <MenuItem key={m.id} value={m.id}>{m.title}</MenuItem>)}
        </Select>
      </FormControl>

      {selectedModule && (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
            <Tab icon={<MenuBook />} label="Lessons" iconPosition="start" />
            <Tab icon={<Quiz />} label="Quizzes" iconPosition="start" />
            <Tab icon={<AutoAwesome />} label="AI Generator" iconPosition="start" />
            <Tab icon={<Assessment />} label="Grades" iconPosition="start" />
          </Tabs>

          {tab === 0 && <LessonManager moduleId={selectedModule} />}
          {tab === 1 && <QuizManager moduleId={selectedModule} />}
          {tab === 2 && <AIQuestionGenerator moduleId={selectedModule} />}
          {tab === 3 && <GradeViewer />}
        </>
      )}

      {!selectedModule && (
        <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <School sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
          <Typography color="text.secondary">Select a module to manage its content</Typography>
        </Paper>
      )}
    </Box>
  );
}

function LessonManager({ moduleId }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editLesson, setEditLesson] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', content: '', durationMinutes: '' });
  const [bankLessonId, setBankLessonId] = useState(null);

  const [aiStep, setAiStep] = useState(0);
  const [outline, setOutline] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [generatedLessons, setGeneratedLessons] = useState([]);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [previewIdx, setPreviewIdx] = useState(null);
  const [editContentIdx, setEditContentIdx] = useState(null);
  const [chatIdx, setChatIdx] = useState(null);
  const [chatHistories, setChatHistories] = useState({});
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState(null);
  const [pdfText, setPdfText] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [pdfUploading, setPdfUploading] = useState(false);
  const [editAiChat, setEditAiChat] = useState([]);
  const [editAiInput, setEditAiInput] = useState('');
  const [editAiLoading, setEditAiLoading] = useState(false);
  const [editPreview, setEditPreview] = useState(false);

  const { data: moduleData } = useQuery({
    queryKey: ['training-module', moduleId],
    queryFn: () => apiRequest(`/training/modules/${moduleId}`),
    select: (res) => res?.data !== undefined ? res.data : res,
  });

  const lessons = moduleData?.lessons || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => apiRequest(`/training/lessons/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries(['training-module', moduleId]); setEditOpen(false); setEditLesson(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiRequest(`/training/lessons/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries(['training-module', moduleId]),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => apiRequest('/training/ai/analyze-outline', { method: 'POST', body: JSON.stringify({ moduleId, outline, referenceText: pdfText || undefined }) }),
    onSuccess: (res) => {
      const data = res?.data !== undefined ? res.data : res;
      setAnalysis(data);
      setAiStep(2);
    },
  });

  const generateMutation = useMutation({
    mutationFn: (lessonPlan) => apiRequest('/training/ai/generate-lessons', {
      method: 'POST',
      body: JSON.stringify({ moduleId, outline, lessonPlan, referenceText: pdfText || undefined }),
    }),
    onSuccess: (res) => {
      const data = Array.isArray(res) ? res : (res?.data || res || []);
      setGeneratedLessons(data);
      setExpandedIdx(0);
      setAiStep(3);
    },
  });

  const saveBulkMutation = useMutation({
    mutationFn: (lessonsToSave) => apiRequest('/training/lessons/bulk', {
      method: 'POST',
      body: JSON.stringify({ moduleId, lessons: lessonsToSave }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['training-module', moduleId]);
      setAiStep(0);
      setOutline('');
      setAnalysis(null);
      setGeneratedLessons([]);
    },
  });

  const handleEditOpen = (lesson) => {
    setEditLesson(lesson);
    setEditForm({ title: lesson.title, content: lesson.content || '', durationMinutes: lesson.duration_minutes || '' });
    setEditOpen(true);
  };

  const handleEditSave = () => {
    updateMutation.mutate({
      id: editLesson.id,
      moduleId,
      title: editForm.title,
      content: editForm.content,
      durationMinutes: editForm.durationMinutes ? parseInt(editForm.durationMinutes) : undefined,
    });
  };

  const handleGenerate = () => {
    const plan = (analysis?.proposedLessons || []).map(l => ({ title: l.title, questions: l.questions || [] }));
    generateMutation.mutate(plan);
  };

  const updateGeneratedLesson = (idx, field, value) => {
    setGeneratedLessons(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const updateQA = (lessonIdx, qaIdx, field, value) => {
    setGeneratedLessons(prev => prev.map((l, i) => {
      if (i !== lessonIdx) return l;
      const questions = [...(l.questions || [])];
      questions[qaIdx] = { ...questions[qaIdx], [field]: value };
      return { ...l, questions };
    }));
  };

  const handleRegenerate = async (idx) => {
    const lesson = generatedLessons[idx];
    setRegeneratingIdx(idx);
    try {
      const res = await apiRequest('/training/ai/regenerate-lesson', {
        method: 'POST',
        body: JSON.stringify({ moduleId, title: lesson.title, questions: lesson.questions || [] }),
      });
      const data = res?.data !== undefined ? res.data : res;
      setGeneratedLessons(prev => prev.map((l, i) => i === idx ? { ...l, content: data.content, durationMinutes: data.durationMinutes || l.durationMinutes } : l));
    } catch { /* error handled silently */ }
    setRegeneratingIdx(null);
  };

  const handlePublish = () => {
    const toSave = generatedLessons.map(l => ({
      title: l.title,
      content: l.content,
      durationMinutes: l.durationMinutes === 0 || l.durationMinutes === '0' ? null : (l.durationMinutes || null),
    }));
    saveBulkMutation.mutate(toSave);
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiRequest('/training/ai/upload-pdf', { method: 'POST', body: formData, headers: {} });
      const data = res?.data !== undefined ? res.data : res;
      setPdfText(data.text || '');
      setPdfName(file.name);
    } catch { setPdfText(''); setPdfName(''); }
    setPdfUploading(false);
    e.target.value = '';
  };

  const handleChatSend = async (idx) => {
    if (!chatInput.trim()) return;
    const lesson = generatedLessons[idx];
    const history = chatHistories[idx] || [];
    const msg = chatInput.trim();
    setChatInput('');
    setChatHistories(prev => ({ ...prev, [idx]: [...history, { role: 'user', content: msg }] }));
    setChatLoading(true);
    try {
      const res = await apiRequest('/training/ai/chat-edit', {
        method: 'POST',
        body: JSON.stringify({ lessonTitle: lesson.title, currentContent: lesson.content || '', message: msg, history }),
      });
      const data = res?.data !== undefined ? res.data : res;
      setChatHistories(prev => ({ ...prev, [idx]: [...(prev[idx] || []), { role: 'assistant', content: data.reply }] }));
      if (data.updatedContent) updateGeneratedLesson(idx, 'content', data.updatedContent);
    } catch {
      setChatHistories(prev => ({ ...prev, [idx]: [...(prev[idx] || []), { role: 'assistant', content: 'Sorry, something went wrong. Try again.' }] }));
    }
    setChatLoading(false);
  };

  const handleEditAiSend = async () => {
    if (!editAiInput.trim()) return;
    const msg = editAiInput.trim();
    setEditAiInput('');
    setEditAiChat(prev => [...prev, { role: 'user', content: msg }]);
    setEditAiLoading(true);
    try {
      const res = await apiRequest('/training/ai/chat-edit', {
        method: 'POST',
        body: JSON.stringify({ lessonTitle: editForm.title, currentContent: editForm.content, message: msg, history: editAiChat }),
      });
      const data = res?.data !== undefined ? res.data : res;
      setEditAiChat(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.updatedContent) setEditForm(p => ({ ...p, content: data.updatedContent }));
    } catch {
      setEditAiChat(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Try again.' }]);
    }
    setEditAiLoading(false);
  };

  const SUGGESTION_COLORS = { add: 'success', remove: 'error', split: 'info', reorder: 'warning', merge: 'info' };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Lessons ({lessons.length})</Typography>
        {aiStep === 0 && (
          <Button startIcon={<AutoAwesome />} variant="contained" onClick={() => setAiStep(1)}>
            AI Lesson Generator
          </Button>
        )}
      </Box>

      {lessons.map((lesson, idx) => (
        <Paper key={lesson.id} sx={{ p: 2, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip label={idx + 1} size="small" />
          <Typography sx={{ flexGrow: 1 }} fontWeight={500}>{lesson.title}</Typography>
          {lesson.duration_minutes ? (
            <Chip label={`${lesson.duration_minutes}m`} size="small" variant="outlined" />
          ) : (
            <Chip label="Unlimited" size="small" variant="outlined" color="info" />
          )}
          <Button size="small" startIcon={<Quiz />} onClick={() => setBankLessonId(lesson.id)}>Bank</Button>
          <IconButton size="small" onClick={() => handleEditOpen(lesson)} aria-label="Edit"><Edit fontSize="small" /></IconButton>
          <IconButton size="small" color="error" onClick={() => deleteMutation.mutate(lesson.id)} aria-label="Delete"><Delete fontSize="small" /></IconButton>
        </Paper>
      ))}

      {/* Step 1: Paste outline with questions */}
      {aiStep === 1 && (
        <Paper sx={{ p: { xs: 3, sm: 4 }, mt: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Paste your lessons with questions
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Write each lesson as a title followed by the questions it must answer. The AI will analyze, suggest improvements, generate content, and then you review every answer before publishing.
          </Typography>
          <TextField
            fullWidth multiline rows={10}
            placeholder={"Format: * Lesson Title: question1? question2? question3?\n\nExample:\n* EC and pH Basics: what is EC/pH? how do they increase or decrease? why is it important to know their meters? does each crop have a favorable EC/pH range?\n* EC Meter Factors: how does EC increase? how much ppm in fertigation increases EC? how does organic fertilizer regulate EC?\n* EC Causes and Effects: how can high or low EC affect crops? why does each stage have an EC range? signs of low EC?"}
            value={outline} onChange={(e) => setOutline(e.target.value)}
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'center' }}>
            <Button component="label" startIcon={pdfUploading ? <CircularProgress size={16} /> : <UploadFile />} disabled={pdfUploading}>
              {pdfUploading ? 'Uploading...' : 'Upload PDF'}
              <input type="file" hidden accept="application/pdf" onChange={handlePdfUpload} />
            </Button>
            {pdfName && (
              <Chip label={pdfName} onDelete={() => { setPdfText(''); setPdfName(''); }} size="small" color="primary" variant="outlined" />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'flex-end' }}>
            <Button onClick={() => { setAiStep(0); setOutline(''); setPdfText(''); setPdfName(''); }}>Cancel</Button>
            <Button
              variant="contained" startIcon={analyzeMutation.isLoading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesome />}
              onClick={() => analyzeMutation.mutate()} disabled={!outline.trim() || analyzeMutation.isLoading}
            >
              {analyzeMutation.isLoading ? 'Analyzing...' : 'Analyze & Suggest'}
            </Button>
          </Box>
          {analyzeMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>Failed to analyze outline. Check AI service configuration.</Alert>
          )}
        </Paper>
      )}

      {/* Step 2: Review suggestions & proposed plan */}
      {aiStep === 2 && analysis && (
        <Paper sx={{ p: { xs: 3, sm: 4 }, mt: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>AI Suggestions</Typography>

          {analysis.suggestions?.length > 0 && (
            <Box sx={{ mb: 3 }}>
              {analysis.suggestions.map((s, i) => (
                <Alert key={i} severity={SUGGESTION_COLORS[s.type] || 'info'} sx={{ mb: 1, py: 0 }}>
                  <Typography variant="body2"><strong>{s.type.toUpperCase()}:</strong> {s.text}</Typography>
                </Alert>
              ))}
            </Box>
          )}

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Proposed Lesson Plan ({analysis.proposedLessons?.length || 0} lessons)
          </Typography>

          {analysis.proposedLessons?.map((l, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2, mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label={i + 1} size="small" />
                <Typography fontWeight={600} sx={{ flexGrow: 1 }}>{l.title}</Typography>
                {l.estimatedMinutes && <Chip label={`~${l.estimatedMinutes}m`} size="small" variant="outlined" />}
              </Box>
              {l.questions?.length > 0 && (
                <Box sx={{ pl: 4, mt: 1 }}>
                  {l.questions.map((q, qi) => (
                    <Typography key={qi} variant="body2" color="text.secondary">• {q}</Typography>
                  ))}
                </Box>
              )}
            </Paper>
          ))}

          <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'flex-end' }}>
            <Button onClick={() => setAiStep(1)}>Back to Outline</Button>
            <Button
              variant="contained" startIcon={generateMutation.isLoading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesome />}
              onClick={handleGenerate} disabled={generateMutation.isLoading || !analysis.proposedLessons?.length}
            >
              {generateMutation.isLoading ? 'Generating Lessons...' : `Generate ${analysis.proposedLessons?.length || 0} Lessons`}
            </Button>
          </Box>
          {generateMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {generateMutation.error?.message || 'Failed to generate lessons. Please try again.'}
            </Alert>
          )}
        </Paper>
      )}

      <Backdrop open={generateMutation.isLoading} sx={{ zIndex: 1300, flexDirection: 'column', gap: 2, color: '#fff' }}>
        <CircularProgress color="inherit" size={48} />
        <Typography variant="h6">Generating lessons with AI...</Typography>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>This may take 1-2 minutes. Please don&apos;t close this page.</Typography>
      </Backdrop>

      {/* Step 3: Review Q&A, edit answers, edit duration, then publish */}
      {aiStep === 3 && generatedLessons.length > 0 && (
        <Paper sx={{ p: { xs: 3, sm: 4 }, mt: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Review & Revise ({generatedLessons.length} lessons)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Review the AI's answers for each question. Edit any answer you want to correct. When satisfied, publish all lessons.
          </Typography>

          {generatedLessons.map((l, i) => (
            <Paper key={i} variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
              {/* Lesson header */}
              <Box
                sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', '&:hover': { bgcolor: 'background.muted' } }}
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              >
                <Chip label={i + 1} size="small" color="primary" />
                <Typography fontWeight={600} sx={{ flexGrow: 1 }}>{l.title}</Typography>
                <Chip
                  label={l.durationMinutes === 0 || l.durationMinutes === '0' || !l.durationMinutes ? 'Unlimited' : `${l.durationMinutes}m`}
                  size="small" variant="outlined" color={!l.durationMinutes || l.durationMinutes === 0 ? 'info' : 'default'}
                />
                <Typography variant="body2" color="text.secondary">{l.questions?.length || 0} Q&A</Typography>
              </Box>

              {/* Expanded: edit title, duration, Q&A */}
              {expandedIdx === i && (
                <Box sx={{ px: 3, pb: 3, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', gap: 2, mt: 2, mb: 2 }}>
                    <TextField
                      label="Lesson Title" size="small" sx={{ flexGrow: 1 }}
                      value={l.title} onChange={(e) => updateGeneratedLesson(i, 'title', e.target.value)}
                    />
                    <TextField
                      label="Duration (min)" size="small" type="number" sx={{ width: 140 }}
                      value={l.durationMinutes || ''} onChange={(e) => updateGeneratedLesson(i, 'durationMinutes', e.target.value === '' ? 0 : parseInt(e.target.value))}
                      helperText="0 = unlimited"
                    />
                  </Box>

                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Questions & Answers</Typography>
                  {(l.questions || []).map((qa, qi) => (
                    <Box key={qi} sx={{ mb: 2, pl: 1, borderLeft: '3px solid', borderColor: 'primary.light' }}>
                      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5, pl: 1 }}>
                        Q{qi + 1}: {qa.question}
                      </Typography>
                      <TextField
                        fullWidth size="small" multiline minRows={2} maxRows={5}
                        value={qa.answer || ''} onChange={(e) => updateQA(i, qi, 'answer', e.target.value)}
                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'var(--sheet-muted)' } }}
                      />
                    </Box>
                  ))}

                  <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'center' }}>
                    <Button
                      size="small" variant="outlined" startIcon={regeneratingIdx === i ? <CircularProgress size={14} /> : <AutoAwesome />}
                      onClick={() => handleRegenerate(i)} disabled={regeneratingIdx === i}
                    >
                      {regeneratingIdx === i ? 'Regenerating...' : 'Regenerate with corrections'}
                    </Button>
                    <Button size="small" onClick={() => { setPreviewIdx(previewIdx === i ? null : i); setEditContentIdx(null); }}>
                      {previewIdx === i ? 'Hide Preview' : 'Preview'}
                    </Button>
                    <Button size="small" onClick={() => { setEditContentIdx(editContentIdx === i ? null : i); setPreviewIdx(null); setChatIdx(null); }}>
                      {editContentIdx === i ? 'Hide Editor' : 'Edit Content'}
                    </Button>
                    <Button size="small" startIcon={<Chat />} onClick={() => { setChatIdx(chatIdx === i ? null : i); setPreviewIdx(null); setEditContentIdx(null); }}>
                      {chatIdx === i ? 'Hide Chat' : 'Chat with AI'}
                    </Button>
                  </Box>

                  {previewIdx === i && (
                    <Paper variant="outlined" sx={{ p: 2, mt: 2, maxHeight: 300, overflow: 'auto', bgcolor: 'var(--sheet-muted)' }}>
                      <Box
                        sx={{ '& h2': { mt: 2, mb: 1, fontSize: '1.125rem' }, '& p': { mb: 1.5, lineHeight: 1.7, fontSize: '0.875rem' }, '& ul,& ol': { pl: 3, mb: 1.5 }, '& li': { mb: 0.5, fontSize: '0.875rem' } }}
                        dangerouslySetInnerHTML={{ __html: l.content || '<p>No content yet.</p>' }}
                      />
                    </Paper>
                  )}

                  {editContentIdx === i && (
                    <TextField
                      fullWidth multiline minRows={8} maxRows={20}
                      value={l.content || ''}
                      onChange={(e) => updateGeneratedLesson(i, 'content', e.target.value)}
                      sx={{ mt: 2, '& .MuiInputBase-input': { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '0.875rem' } }}
                      placeholder="HTML content..."
                    />
                  )}

                  {chatIdx === i && (
                    <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Chat with AI about this lesson</Typography>
                      <Box sx={{ maxHeight: 200, overflow: 'auto', mb: 2 }}>
                        {(chatHistories[i] || []).map((msg, mi) => (
                          <Box key={mi} sx={{ mb: 1, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                            <Paper sx={{ p: 1, px: 1.5, maxWidth: '80%', bgcolor: msg.role === 'user' ? 'primary.main' : 'background.muted', color: msg.role === 'user' ? 'white' : 'text.primary' }}>
                              <Typography variant="body2">{msg.content}</Typography>
                            </Paper>
                          </Box>
                        ))}
                        {chatLoading && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={14} />
                            <Typography variant="body2" color="text.secondary">Thinking...</Typography>
                          </Box>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          fullWidth size="small" placeholder="e.g. Make the intro shorter, add more examples..."
                          value={chatIdx === i ? chatInput : ''} onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(i); } }}
                          disabled={chatLoading}
                        />
                        <Button variant="contained" size="small" onClick={() => handleChatSend(i)} disabled={chatLoading || !chatInput.trim()}>
                          <Send fontSize="small" />
                        </Button>
                      </Box>
                    </Paper>
                  )}
                </Box>
              )}
            </Paper>
          ))}

          <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
            <Button onClick={() => setAiStep(2)}>Back to Plan</Button>
            <Button
              variant="contained" color="success" size="large"
              startIcon={saveBulkMutation.isLoading ? <CircularProgress size={16} color="inherit" /> : null}
              onClick={handlePublish} disabled={saveBulkMutation.isLoading}
            >
              {saveBulkMutation.isLoading ? 'Publishing...' : `Publish ${generatedLessons.length} Lessons`}
            </Button>
          </Box>
          {saveBulkMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>Failed to publish lessons. Please try again.</Alert>
          )}
        </Paper>
      )}

      {/* Edit existing lesson dialog */}
      <Dialog open={editOpen} onClose={() => { setEditOpen(false); setEditAiChat([]); setEditAiInput(''); setEditPreview(false); }} maxWidth="md" fullWidth>
        <DialogTitle>Edit Lesson</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth margin="normal" label="Title"
            value={editForm.title} onChange={(e) => setEditForm(p => ({ ...p, title: e.target.value }))}
          />
          <TextField
            fullWidth margin="normal" label="Duration (minutes)" type="number" helperText="0 or empty = unlimited"
            value={editForm.durationMinutes} onChange={(e) => setEditForm(p => ({ ...p, durationMinutes: e.target.value }))}
          />
          <Box sx={{ display: 'flex', gap: 1, mt: 2, mb: 1 }}>
            <Button size="small" variant={editPreview ? 'outlined' : 'contained'} onClick={() => setEditPreview(false)}>
              Edit HTML
            </Button>
            <Button size="small" variant={editPreview ? 'contained' : 'outlined'} onClick={() => setEditPreview(true)}>
              Preview
            </Button>
          </Box>
          {!editPreview ? (
            <TextField
              fullWidth margin="normal" label="Content (HTML)" multiline rows={8}
              value={editForm.content} onChange={(e) => setEditForm(p => ({ ...p, content: e.target.value }))}
            />
          ) : (
            <Paper variant="outlined" sx={{ p: 2, mt: 1, maxHeight: 300, overflow: 'auto', bgcolor: 'var(--sheet-muted)' }}>
              <Box
                sx={{ '& h2': { mt: 2, mb: 1, fontSize: '1.125rem' }, '& p': { mb: 1.5, lineHeight: 1.7, fontSize: '0.875rem' }, '& ul,& ol': { pl: 3, mb: 1.5 }, '& li': { mb: 0.5, fontSize: '0.875rem' } }}
                dangerouslySetInnerHTML={{ __html: editForm.content || '<p>No content yet.</p>' }}
              />
            </Paper>
          )}
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>Edit with AI</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Tell the AI what to change instead of editing HTML directly.
          </Typography>
          <Box sx={{ maxHeight: 150, overflow: 'auto', mb: 1 }}>
            {editAiChat.map((msg, mi) => (
              <Box key={mi} sx={{ mb: 0.5, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <Paper sx={{ p: 1, px: 1.5, maxWidth: '80%', bgcolor: msg.role === 'user' ? 'primary.main' : 'background.muted', color: msg.role === 'user' ? 'white' : 'text.primary' }}>
                  <Typography variant="body2">{msg.content}</Typography>
                </Paper>
              </Box>
            ))}
            {editAiLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">Thinking...</Typography>
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth size="small" placeholder="e.g. Make it shorter, add a summary at the end..."
              value={editAiInput} onChange={(e) => setEditAiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditAiSend(); } }}
              disabled={editAiLoading}
            />
            <Button variant="contained" size="small" onClick={handleEditAiSend} disabled={editAiLoading || !editAiInput.trim()}>
              <Send fontSize="small" />
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEditOpen(false); setEditAiChat([]); setEditAiInput(''); setEditPreview(false); }}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={!editForm.title}>Save</Button>
        </DialogActions>
      </Dialog>

      {bankLessonId && (
        <QuestionBankDialog lessonId={bankLessonId} onClose={() => setBankLessonId(null)} />
      )}
    </Box>
  );
}

function QuestionBankDialog({ lessonId, onClose }) {
  const queryClient = useQueryClient();
  const [editingQ, setEditingQ] = useState(null);
  const [editForm, setEditForm] = useState({ questionText: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });
  const [bulkAiInput, setBulkAiInput] = useState('');

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['question-bank', lessonId],
    queryFn: () => apiRequest(`/training/lessons/${lessonId}/question-bank`),
    select: (res) => Array.isArray(res) ? res : (res?.data || []),
  });

  const generateMutation = useMutation({
    mutationFn: (count) => apiRequest(`/training/lessons/${lessonId}/generate-bank`, { method: 'POST', body: JSON.stringify({ count }) }),
    onSuccess: () => queryClient.invalidateQueries(['question-bank', lessonId]),
  });

  const deleteMutation = useMutation({
    mutationFn: (qId) => apiRequest(`/training/questions/bank/${qId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries(['question-bank', lessonId]),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => apiRequest(`/training/questions/bank/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries(['question-bank', lessonId]); setEditingQ(null); },
  });

  const bulkAiMutation = useMutation({
    mutationFn: (instruction) => apiRequest(`/training/lessons/${lessonId}/question-bank/ai-edit`, {
      method: 'POST',
      body: JSON.stringify({
        instruction,
        questions: questions.map(q => ({
          id: q.id,
          question: q.question_text,
          options: q.options,
          correctIndex: q.correct_index,
          explanation: q.explanation || '',
        })),
      }),
    }),
    onSuccess: () => { queryClient.invalidateQueries(['question-bank', lessonId]); setBulkAiInput(''); },
  });

  const handleBulkAiEdit = () => {
    if (!bulkAiInput.trim() || questions.length === 0) return;
    bulkAiMutation.mutate(bulkAiInput);
  };

  const handleEditOpen = (q) => {
    setEditingQ(q.id);
    setEditForm({ questionText: q.question_text, options: q.options || ['', '', '', ''], correctIndex: q.correct_index, explanation: q.explanation || '' });
  };

  const handleEditSave = () => {
    updateMutation.mutate({ id: editingQ, ...editForm });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <Backdrop open={generateMutation.isLoading || bulkAiMutation.isLoading} sx={{ zIndex: 9999, flexDirection: 'column', gap: 2 }}>
        <CircularProgress size={48} sx={{ color: 'white' }} />
        <Typography sx={{ color: 'white', fontWeight: 600 }}>
          {bulkAiMutation.isLoading ? 'AI is editing questions...' : 'Generating questions... This may take up to a minute.'}
        </Typography>
      </Backdrop>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Question Bank ({questions.length} questions)
        <IconButton onClick={onClose} aria-label="Close"><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Button
            variant="contained" startIcon={<AutoAwesome />}
            onClick={() => generateMutation.mutate(20)} disabled={generateMutation.isLoading || bulkAiMutation.isLoading}
          >
            Generate 20 Questions
          </Button>
          <Button
            variant="outlined" startIcon={<Add />}
            onClick={() => generateMutation.mutate(10)} disabled={generateMutation.isLoading || bulkAiMutation.isLoading}
          >
            Generate 10 More
          </Button>
        </Box>

        {questions.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Edit with AI</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Tell the AI what to change. Reference questions by number or say &quot;all&quot;.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                fullWidth size="small"
                placeholder='e.g. "Make questions 3, 5, 7 harder" or "Rephrase all to be more practical"'
                value={bulkAiInput} onChange={(e) => setBulkAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleBulkAiEdit(); } }}
                disabled={bulkAiMutation.isLoading}
              />
              <Button variant="contained" size="small" onClick={handleBulkAiEdit} disabled={bulkAiMutation.isLoading || !bulkAiInput.trim()}>
                <Send fontSize="small" />
              </Button>
            </Box>
            {bulkAiMutation.isError && <Alert severity="error" sx={{ mt: 1 }}>AI edit failed. Try again.</Alert>}
          </Paper>
        )}

        {generateMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>Failed to generate questions. Try again.</Alert>}

        {isLoading && <LinearProgress sx={{ mb: 2 }} />}

        {questions.length === 0 && !isLoading && (
          <InfoNote mode="line" severity="info">No questions yet. Click &quot;Generate 20 Questions&quot; to create a question bank for this lesson.</InfoNote>
        )}

        {questions.map((q, idx) => (
          <Paper key={q.id} variant="outlined" sx={{ p: 2, mb: 1.5 }}>
            {editingQ === q.id ? (
              <Box>
                <TextField fullWidth size="small" label="Question" value={editForm.questionText} onChange={(e) => setEditForm(p => ({ ...p, questionText: e.target.value }))} sx={{ mb: 1 }} />
                {editForm.options.map((opt, oi) => (
                  <Box key={oi} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Radio size="small" checked={editForm.correctIndex === oi} onChange={() => setEditForm(p => ({ ...p, correctIndex: oi }))} />
                    <TextField fullWidth size="small" value={opt} onChange={(e) => { const opts = [...editForm.options]; opts[oi] = e.target.value; setEditForm(p => ({ ...p, options: opts })); }} />
                  </Box>
                ))}
                <TextField fullWidth size="small" label="Explanation" value={editForm.explanation} onChange={(e) => setEditForm(p => ({ ...p, explanation: e.target.value }))} sx={{ mt: 1 }} />
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                  <Button size="small" variant="contained" onClick={handleEditSave}>Save</Button>
                  <Button size="small" onClick={() => setEditingQ(null)}>Cancel</Button>
                </Box>
              </Box>
            ) : (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Typography fontWeight={500} sx={{ mb: 1 }}>{idx + 1}. {q.question_text}</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => handleEditOpen(q)} aria-label="Edit"><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => deleteMutation.mutate(q.id)} aria-label="Delete"><Delete fontSize="small" /></IconButton>
                  </Box>
                </Box>
                {(q.options || []).map((opt, oi) => (
                  <Typography key={oi} variant="body2" sx={{ pl: 2, color: oi === q.correct_index ? 'success.main' : 'text.secondary', fontWeight: oi === q.correct_index ? 600 : 400 }}>
                    {String.fromCharCode(65 + oi)}. {opt} {oi === q.correct_index && ' ✓'}
                  </Typography>
                ))}
                {q.explanation && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontStyle: 'italic' }}>{q.explanation}</Typography>}
              </Box>
            )}
          </Paper>
        ))}
      </DialogContent>
    </Dialog>
  );
}

function QuizManager({ moduleId }) {
  const queryClient = useQueryClient();
  const [quizDialog, setQuizDialog] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [questionDialog, setQuestionDialog] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [quizForm, setQuizForm] = useState({ title: '', quizType: 'practice', timeLimitMinutes: '', passPercentage: '70', lessonIds: [] });
  const [qForm, setQForm] = useState({ questionType: 'mcq', questionText: '', options: ['', '', '', ''], correctAnswer: '', explanation: '' });
  const [aiGenDialog, setAiGenDialog] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiLessonIds, setAiLessonIds] = useState([]);
  const [aiGenerated, setAiGenerated] = useState([]);

  const { data: quizzes = [] } = useQuery({
    queryKey: ['training-quizzes', moduleId],
    queryFn: () => apiRequest(`/training/quizzes?module_id=${moduleId}`),
    select: (res) => Array.isArray(res) ? res : (res?.data || []),
  });

  const { data: lessons = [] } = useQuery({
    queryKey: ['training-module-lessons', moduleId],
    queryFn: () => apiRequest(`/training/modules/${moduleId}`),
    select: (res) => { const d = res?.data !== undefined ? res.data : res; return d?.lessons || []; },
  });

  const { data: quizDetail } = useQuery({
    queryKey: ['training-quiz', selectedQuiz],
    queryFn: () => apiRequest(`/training/quizzes/${selectedQuiz}`),
    select: (res) => res?.data !== undefined ? res.data : res,
    enabled: !!selectedQuiz,
  });

  const aiGenerateMutation = useMutation({
    mutationFn: () => apiRequest('/training/ai/generate-quiz-questions', {
      method: 'POST',
      body: JSON.stringify({ topic: aiTopic, count: aiCount, lessonIds: aiLessonIds.length ? aiLessonIds : undefined }),
    }),
    onSuccess: (res) => setAiGenerated(res.data || res || []),
  });

  const aiAddQuestionMutation = useMutation({
    mutationFn: (question) => apiRequest('/training/questions', {
      method: 'POST',
      body: JSON.stringify({ quizId: selectedQuiz, ...question }),
    }),
    onSuccess: () => queryClient.invalidateQueries(['training-quiz', selectedQuiz]),
  });

  const createQuizMutation = useMutation({
    mutationFn: (data) => apiRequest('/training/quizzes', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries(['training-quizzes']); setQuizDialog(false); setEditingQuiz(null); },
  });

  const updateQuizMutation = useMutation({
    mutationFn: ({ id, ...data }) => apiRequest(`/training/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries(['training-quizzes']); queryClient.invalidateQueries(['training-quiz']); setQuizDialog(false); setEditingQuiz(null); },
  });

  const deleteQuizMutation = useMutation({
    mutationFn: (id) => apiRequest(`/training/quizzes/${id}`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries(['training-quizzes']); setSelectedQuiz(null); },
  });

  const addQuestionMutation = useMutation({
    mutationFn: (data) => apiRequest('/training/questions', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries(['training-quiz', selectedQuiz]); setQuestionDialog(false); },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (id) => apiRequest(`/training/questions/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries(['training-quiz', selectedQuiz]),
  });

  const handleSaveQuiz = () => {
    const payload = {
      moduleId,
      title: quizForm.title,
      quizType: quizForm.quizType,
      timeLimitMinutes: quizForm.timeLimitMinutes ? parseInt(quizForm.timeLimitMinutes) : undefined,
      passPercentage: parseInt(quizForm.passPercentage) || 70,
      lessonIds: quizForm.lessonIds,
    };
    if (editingQuiz) {
      updateQuizMutation.mutate({ id: editingQuiz.id, ...payload });
    } else {
      createQuizMutation.mutate(payload);
    }
  };

  const handleEditQuiz = (quiz, e) => {
    e.stopPropagation();
    setEditingQuiz(quiz);
    const linkedIds = (quiz.linked_lessons || []).map((l) => l.id);
    setQuizForm({
      title: quiz.title,
      quizType: quiz.quiz_type,
      timeLimitMinutes: quiz.time_limit_minutes || '',
      passPercentage: String(quiz.pass_percentage || 70),
      lessonIds: linkedIds.length ? linkedIds : (quiz.lesson_id ? [quiz.lesson_id] : []),
    });
    setQuizDialog(true);
  };

  const handleAddQuestion = () => {
    addQuestionMutation.mutate({
      quizId: selectedQuiz,
      questionType: qForm.questionType,
      questionText: qForm.questionText,
      options: qForm.questionType === 'mcq' ? qForm.options.filter(Boolean) : ['True', 'False'],
      correctAnswer: qForm.correctAnswer,
      explanation: qForm.explanation,
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Quizzes ({quizzes.length})</Typography>
        <Button startIcon={<Add />} variant="contained" onClick={() => { setEditingQuiz(null); setQuizForm({ title: '', quizType: 'practice', timeLimitMinutes: '', passPercentage: '70', lessonIds: [] }); setQuizDialog(true); }}>
          Create Quiz
        </Button>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          {quizzes.map((q) => (
            <Paper
              key={q.id}
              sx={{ p: 2, mb: 1, cursor: 'pointer', border: selectedQuiz === q.id ? '2px solid' : 'none', borderColor: 'primary.main' }}
              onClick={() => setSelectedQuiz(q.id)}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography fontWeight={500}>{q.title}</Typography>
                <Box>
                  <IconButton size="small" onClick={(e) => handleEditQuiz(q, e)} aria-label="Edit"><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); deleteQuizMutation.mutate(q.id); }} aria-label="Delete">
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                <Chip label={q.quiz_type} size="small" />
                {(q.linked_lessons || []).map((l) => (
                  <Chip key={l.id} label={l.title} size="small" variant="outlined" color="primary" />
                ))}
                {!q.linked_lessons?.length && q.lesson_title && (
                  <Chip label={q.lesson_title} size="small" variant="outlined" color="primary" />
                )}
              </Box>
            </Paper>
          ))}
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          {selectedQuiz && quizDetail ? (
            <Paper sx={{ p: { xs: 3, sm: 4 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h6">{quizDetail.title} — Questions</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button startIcon={<AutoAwesome />} size="small" variant="outlined" color="secondary" onClick={() => {
                    const linked = (quizDetail.linked_lessons || []).map((l) => l.id);
                    setAiTopic(quizDetail.title);
                    setAiCount(5);
                    setAiLessonIds(linked.length ? linked : (quizDetail.lesson_id ? [quizDetail.lesson_id] : []));
                    setAiGenerated([]);
                    setAiGenDialog(true);
                  }}>
                    AI Generate
                  </Button>
                  <Button startIcon={<Add />} size="small" onClick={() => { setQForm({ questionType: 'mcq', questionText: '', options: ['', '', '', ''], correctAnswer: '', explanation: '' }); setQuestionDialog(true); }}>
                    Add Question
                  </Button>
                </Box>
              </Box>

              {(quizDetail.questions || []).map((q, idx) => (
                <Paper key={q.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle2">Q{idx + 1}: {q.question_text}</Typography>
                    <IconButton size="small" color="error" onClick={() => deleteQuestionMutation.mutate(q.id)} aria-label="Delete">
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Type: {q.question_type} | Answer: {q.correct_answer}
                  </Typography>
                </Paper>
              ))}
            </Paper>
          ) : (
            <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
              <Typography color="text.secondary">Select a quiz to view its questions</Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Create/Edit Quiz Dialog */}
      <Dialog open={quizDialog} onClose={() => { setQuizDialog(false); setEditingQuiz(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editingQuiz ? 'Edit Quiz' : 'Create Quiz'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth margin="normal" label="Title" value={quizForm.title} onChange={(e) => setQuizForm(p => ({ ...p, title: e.target.value }))} />
          <FormControl fullWidth margin="normal">
            <InputLabel id="teacherpanel-type-label-2">Type</InputLabel>
            <Select labelId="teacherpanel-type-label-2" value={quizForm.quizType} onChange={(e) => setQuizForm(p => ({ ...p, quizType: e.target.value }))} label="Type">
              <MenuItem value="practice">Practice</MenuItem>
              <MenuItem value="graded">Graded</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth margin="normal" label="Time Limit (minutes, optional)" type="number" value={quizForm.timeLimitMinutes} onChange={(e) => setQuizForm(p => ({ ...p, timeLimitMinutes: e.target.value }))} />
          <TextField fullWidth margin="normal" label="Pass Percentage" type="number" value={quizForm.passPercentage} onChange={(e) => setQuizForm(p => ({ ...p, passPercentage: e.target.value }))} />
          <FormControl fullWidth margin="normal">
            <InputLabel id="teacherpanel-linked-lessons-optional-label-3">Linked Lessons (optional)</InputLabel>
            <Select labelId="teacherpanel-linked-lessons-optional-label-3"
              multiple
              value={quizForm.lessonIds}
              onChange={(e) => setQuizForm(p => ({ ...p, lessonIds: e.target.value }))}
              label="Linked Lessons (optional)"
              renderValue={(selected) => selected.map((id) => lessons.find((l) => l.id === id)?.title || id).join(', ')}
            >
              {lessons.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  <Checkbox slotProps={{ input: { 'aria-label': 'Select' } }} checked={quizForm.lessonIds.indexOf(l.id) > -1} />
                  <ListItemText primary={l.title} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setQuizDialog(false); setEditingQuiz(null); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveQuiz} disabled={!quizForm.title}>{editingQuiz ? 'Save' : 'Create'}</Button>
        </DialogActions>
      </Dialog>

      {/* Add Question Dialog */}
      <Dialog open={questionDialog} onClose={() => setQuestionDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Question</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="normal">
            <InputLabel id="teacherpanel-type-label-4">Type</InputLabel>
            <Select labelId="teacherpanel-type-label-4" value={qForm.questionType} onChange={(e) => setQForm(p => ({ ...p, questionType: e.target.value }))} label="Type">
              <MenuItem value="mcq">Multiple Choice</MenuItem>
              <MenuItem value="true_false">True / False</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth margin="normal" label="Question" multiline rows={2} value={qForm.questionText} onChange={(e) => setQForm(p => ({ ...p, questionText: e.target.value }))} />
          {qForm.questionType === 'mcq' && (
            <>
              {qForm.options.map((opt, i) => (
                <TextField
                  key={i} fullWidth margin="dense"
                  label={`Option ${String.fromCharCode(65 + i)}`}
                  value={opt}
                  onChange={(e) => { const o = [...qForm.options]; o[i] = e.target.value; setQForm(p => ({ ...p, options: o })); }}
                />
              ))}
              <TextField fullWidth margin="normal" label="Correct Answer (A, B, C, or D)" value={qForm.correctAnswer} onChange={(e) => setQForm(p => ({ ...p, correctAnswer: e.target.value.toUpperCase() }))} />
            </>
          )}
          {qForm.questionType === 'true_false' && (
            <FormControl fullWidth margin="normal">
              <InputLabel id="teacherpanel-correct-answer-label-5">Correct Answer</InputLabel>
              <Select labelId="teacherpanel-correct-answer-label-5" value={qForm.correctAnswer} onChange={(e) => setQForm(p => ({ ...p, correctAnswer: e.target.value }))} label="Correct Answer">
                <MenuItem value="True">True</MenuItem>
                <MenuItem value="False">False</MenuItem>
              </Select>
            </FormControl>
          )}
          <TextField fullWidth margin="normal" label="Explanation (optional)" multiline rows={2} value={qForm.explanation} onChange={(e) => setQForm(p => ({ ...p, explanation: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuestionDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddQuestion} disabled={!qForm.questionText || !qForm.correctAnswer}>Add</Button>
        </DialogActions>
      </Dialog>

      {/* AI Generate Questions Dialog */}
      <Dialog open={aiGenDialog} onClose={() => setAiGenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>AI Generate Questions</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Topic" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="e.g., Nutrient management" />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField fullWidth label="Count" type="number" value={aiCount} onChange={(e) => setAiCount(parseInt(e.target.value) || 5)} inputProps={{ min: 1, max: 20 }} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Button variant="contained" fullWidth startIcon={<AutoAwesome />} onClick={() => aiGenerateMutation.mutate()} disabled={!aiTopic || aiGenerateMutation.isLoading} sx={{ height: 56 }}>
                {aiGenerateMutation.isLoading ? 'Generating...' : 'Generate'}
              </Button>
            </Grid>
            <Grid size={12}>
              <FormControl fullWidth size="small">
                <InputLabel id="teacherpanel-source-lessons-optional-label-6">Source Lessons (optional)</InputLabel>
                <Select labelId="teacherpanel-source-lessons-optional-label-6"
                  multiple
                  value={aiLessonIds}
                  onChange={(e) => setAiLessonIds(e.target.value)}
                  label="Source Lessons (optional)"
                  renderValue={(selected) => selected.map((id) => lessons.find((l) => l.id === id)?.title || id).join(', ')}
                >
                  {lessons.map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      <Checkbox slotProps={{ input: { 'aria-label': 'Select' } }} checked={aiLessonIds.indexOf(l.id) > -1} />
                      <ListItemText primary={l.title} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {aiGenerateMutation.isLoading && <LinearProgress sx={{ mt: 2 }} />}
          {aiGenerateMutation.isError && <Alert severity="error" sx={{ mt: 2 }}>{aiGenerateMutation.error?.message || 'Failed to generate'}</Alert>}

          {aiGenerated.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>Generated {aiGenerated.length} questions — click Add to include in quiz</Typography>
              {aiGenerated.map((q, idx) => (
                <Paper key={idx} variant="outlined" sx={{ p: 2, mb: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle2">Q{idx + 1}: {q.questionText}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Type: {q.questionType} | Answer: {q.correctAnswer}
                      </Typography>
                      {q.options && (
                        <Box sx={{ mt: 0.5 }}>
                          {q.options.map((o, i) => (
                            <Typography key={i} variant="caption" display="block">{String.fromCharCode(65 + i)}. {o}</Typography>
                          ))}
                        </Box>
                      )}
                    </Box>
                    <Button size="small" variant="outlined" onClick={() => aiAddQuestionMutation.mutate(q)}>Add</Button>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAiGenDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function AIQuestionGenerator({ moduleId }) {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [generated, setGenerated] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState('');

  const { data: quizzes = [] } = useQuery({
    queryKey: ['training-quizzes', moduleId],
    queryFn: () => apiRequest(`/training/quizzes?module_id=${moduleId}`),
    select: (res) => Array.isArray(res) ? res : (res?.data || []),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest('/training/ai/generate-questions', {
      method: 'POST',
      body: JSON.stringify({ moduleId, topic, count }),
    }),
    onSuccess: (res) => setGenerated(res.data || []),
  });

  const addToQuizMutation = useMutation({
    mutationFn: (question) => apiRequest('/training/questions', {
      method: 'POST',
      body: JSON.stringify({ quizId: selectedQuiz, ...question }),
    }),
    onSuccess: () => queryClient.invalidateQueries(['training-quiz']),
  });

  return (
    <Box>
      <Typography variant="h6" gutterBottom>AI Question Generator</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Use AI to generate quiz questions on any topic within this module.
      </Typography>

      <Paper sx={{ p: { xs: 3, sm: 4 }, mb: 3 }}>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth label="Topic" placeholder="e.g., pH correction methods"
              value={topic} onChange={(e) => setTopic(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField fullWidth label="Count" type="number" value={count} onChange={(e) => setCount(parseInt(e.target.value) || 5)} inputProps={{ min: 1, max: 20 }} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Button
              variant="contained" fullWidth startIcon={<AutoAwesome />}
              onClick={() => generateMutation.mutate()}
              disabled={!topic || generateMutation.isLoading}
            >
              {generateMutation.isLoading ? 'Generating...' : 'Generate'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {generateMutation.isLoading && <LinearProgress sx={{ mb: 2 }} />}

      {generateMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {generateMutation.error?.message || 'Failed to generate questions. Check the ANTHROPIC_API_KEY.'}
        </Alert>
      )}

      {generated.length > 0 && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
            <Typography variant="subtitle1" fontWeight={600}>Generated {generated.length} questions</Typography>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="teacherpanel-add-to-quiz-label-7">Add to Quiz</InputLabel>
              <Select labelId="teacherpanel-add-to-quiz-label-7" value={selectedQuiz} onChange={(e) => setSelectedQuiz(e.target.value)} label="Add to Quiz">
                {quizzes.map((q) => <MenuItem key={q.id} value={q.id}>{q.title}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>

          {generated.map((q, idx) => (
            <Paper key={idx} variant="outlined" sx={{ p: 2, mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle2">Q{idx + 1}: {q.questionText}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Type: {q.questionType} | Answer: {q.correctAnswer}
                  </Typography>
                  {q.options && (
                    <Box sx={{ mt: 0.5 }}>
                      {q.options.map((o, i) => (
                        <Typography key={i} variant="caption" display="block">
                          {String.fromCharCode(65 + i)}. {o}
                        </Typography>
                      ))}
                    </Box>
                  )}
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!selectedQuiz}
                  onClick={() => addToQuizMutation.mutate(q)}
                >
                  Add
                </Button>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}

function GradeViewer() {
  const [expandedStudent, setExpandedStudent] = useState(null);
  const { data: students = [], isLoading } = useQuery({
    queryKey: ['training-students'],
    queryFn: () => apiRequest('/training/students'),
    select: (res) => Array.isArray(res) ? res : (res?.data || []),
  });

  if (isLoading) return <LinearProgress />;

  const formatTime = (seconds) => {
    if (!seconds) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Student Progress</Typography>
      {students.length === 0 ? (
        <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <Typography color="text.secondary">No students enrolled yet.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Student</strong></TableCell>
                <TableCell align="center"><strong>Lessons</strong></TableCell>
                <TableCell align="center"><strong>Time Spent</strong></TableCell>
                <TableCell align="center"><strong>Avg Quiz</strong></TableCell>
                <TableCell align="center"><strong>Last Active</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((s) => {
                const stats = s.progress?.stats || {};
                const totalLessons = (s.progress?.modules || []).reduce((sum, m) => sum + Number(m.lesson_count || 0), 0);
                const isExpanded = expandedStudent === s.id;
                return (
                  <>
                    <TableRow
                      key={s.id}
                      hover
                      sx={{ cursor: 'pointer', '& td': { borderBottom: isExpanded ? 'none' : undefined } }}
                      onClick={() => setExpandedStudent(isExpanded ? null : s.id)}
                    >
                      <TableCell>
                        <Typography fontWeight={500}>{s.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={`${stats.totalLessonsCompleted || 0} / ${totalLessons}`} color={stats.totalLessonsCompleted >= totalLessons && totalLessons > 0 ? 'success' : 'default'} variant="outlined" />
                      </TableCell>
                      <TableCell align="center">{formatTime(stats.totalTimeSeconds)}</TableCell>
                      <TableCell align="center">
                        {stats.avgQuizScore != null ? `${stats.avgQuizScore}%` : '—'}
                      </TableCell>
                      <TableCell align="center">
                        {stats.lastActivity ? new Date(stats.lastActivity).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${s.id}-detail`}>
                        <TableCell colSpan={5} sx={{ bgcolor: 'background.muted', py: 2 }}>
                          <Box sx={{ pl: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>Module Progress</Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                              {(s.progress?.modules || []).map((m) => (
                                <Chip key={m.id} size="small" label={`${m.title}: ${m.completed_lessons || 0}/${m.lesson_count}`} variant="outlined" />
                              ))}
                            </Box>
                            {(s.progress?.completedLessons || []).length > 0 && (
                              <>
                                <Typography variant="subtitle2" gutterBottom>Completed Lessons</Typography>
                                <Table size="small" sx={{ mb: 2 }}>
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Lesson</TableCell>
                                      <TableCell align="center">Time</TableCell>
                                      <TableCell align="center">Completed</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {s.progress.completedLessons.slice(0, 10).map((l) => (
                                      <TableRow key={l.lesson_id}>
                                        <TableCell>{l.lesson_title}</TableCell>
                                        <TableCell align="center">{formatTime(l.total_time_seconds)}</TableCell>
                                        <TableCell align="center">{new Date(l.completed_at).toLocaleDateString()}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </>
                            )}
                            {(s.progress?.attempts || []).length > 0 && (
                              <>
                                <Typography variant="subtitle2" gutterBottom>Quiz Attempts</Typography>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Quiz</TableCell>
                                      <TableCell align="center">Score</TableCell>
                                      <TableCell align="center">Date</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {s.progress.attempts.slice(0, 10).map((a) => (
                                      <TableRow key={a.id}>
                                        <TableCell>{a.quiz_title}</TableCell>
                                        <TableCell align="center">
                                          <Chip size="small" label={`${a.score}%`} color={a.score >= 70 ? 'success' : 'error'} variant="outlined" />
                                        </TableCell>
                                        <TableCell align="center">{new Date(a.completed_at).toLocaleDateString()}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
