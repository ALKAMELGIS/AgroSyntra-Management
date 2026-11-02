import { useMemo, useState, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useApiQuery, useApiMutation } from '../hooks/useApiQuery';
import {
  APP_SUMMARY_DEFAULTS,
  SUMMARY_EDITOR_EMAILS,
  canEditSummaryEmail,
} from '../content/appSummaryDefaults';
import InlineEditableText from '../components/InlineEditableText';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  Divider,
  Snackbar,
} from '@mui/material';
import {
  EditOutlined as EditIcon,
  AddOutlined as AddIcon,
  DeleteOutlined as DeleteIcon,
  OpenInNewOutlined as OpenIcon,
  SaveOutlined as SaveIcon,
  CloseOutlined as CloseIcon,
} from '@mui/icons-material';

function toContentBody(payload) {
  if (!payload) return APP_SUMMARY_DEFAULTS;
  return {
    introText: payload.introText,
    closingText: payload.closingText,
    summaryRows: payload.summaryRows,
    contentsGroups: payload.contentsGroups,
  };
}

function cloneContent(c) {
  return {
    introText: c.introText,
    closingText: c.closingText,
    summaryRows: c.summaryRows.map((r) => ({ ...r })),
    contentsGroups: c.contentsGroups.map((g) => ({
      group: g.group,
      items: g.items.map((i) => ({ ...i })),
    })),
  };
}

function emptySummaryRow() {
  return { area: 'New area', today: '', withApp: '' };
}

function emptyContentsItem() {
  return { module: 'New module', description: '', replaces: '', path: '/' };
}

function emptyContentsGroup() {
  return { group: 'New section', items: [emptyContentsItem()] };
}

export default function SummaryContents() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useApiQuery(['app-summary'], '/app-summary', {
    retry: 1,
  });

  const isEditor =
    data?.canEdit === true
      ? true
      : data?.canEdit === false
        ? false
        : canEditSummaryEmail(user?.email);

  const { mutateAsync: saveSummary, isPending: saving } = useApiMutation(
    '/app-summary',
    { method: 'PUT' },
    [['app-summary']]
  );

  const serverContent = toContentBody(data);
  const editorHintEmail = SUMMARY_EDITOR_EMAILS[0];

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  const display = editMode && draft ? draft : serverContent;
  const fieldEditable = isEditor && editMode;

  const markDirty = useCallback((updater) => {
    setDraft((prev) => {
      const base = prev || cloneContent(serverContent);
      const next = typeof updater === 'function' ? updater(base) : updater;
      return next;
    });
    setDirty(true);
  }, [serverContent]);

  const startEdit = () => {
    setDraft(cloneContent(serverContent));
    setEditMode(true);
    setDirty(false);
    setSaveError('');
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDraft(null);
    setDirty(false);
    setSaveError('');
  };

  const handleSave = async () => {
    if (!draft) return;
    try {
      setSaveError('');
      await saveSummary(draft);
      setSaveOk(true);
      await refetch();
      setEditMode(false);
      setDraft(null);
      setDirty(false);
    } catch (e) {
      setSaveError(e.message || 'Save failed');
    }
  };

  const summaryTableSx = useMemo(
    () => ({
      '& .MuiTableCell-root': { fontSize: '1.05rem', py: 1.5, verticalAlign: 'top' },
      '& .MuiTableCell-head': { fontWeight: 700, fontSize: '1.1rem' },
    }),
    []
  );

  if (isLoading && !data) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box maxWidth={1100} mx="auto" pb={editMode && dirty ? 10 : 0}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={2}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Summary & Contents
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Prototype overview — Excel today vs connected app
          </Typography>
          {!isEditor && user?.email && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Signed in as <strong>{user.email}</strong>. Edit is available only for{' '}
              <strong>{editorHintEmail}</strong>.
            </Typography>
          )}
        </Box>
        {isEditor && !editMode && (
          <Button variant="contained" startIcon={<EditIcon />} onClick={startEdit}>
            Edit
          </Button>
        )}
        {isEditor && editMode && (
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="outlined" startIcon={<CloseIcon />} onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
          </Box>
        )}
      </Box>

      {editMode && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Edit mode: click any text to change it. Press Save when finished.
        </Alert>
      )}

      {saveError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError('')}>
          {saveError}
        </Alert>
      )}

      {error && !data && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Showing default content (could not load saved version).
        </Alert>
      )}

      <Typography variant="overline" color="primary" fontWeight={700}>
        Summary
      </Typography>
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3, bgcolor: 'background.paper' }}>
        <Box sx={{ fontSize: '1.08rem', lineHeight: 1.65, mb: 3 }}>
          <InlineEditableText
            value={display.introText}
            editable={fieldEditable}
            multiline
            minRows={3}
            onChange={(v) => markDirty((d) => ({ ...d, introText: v }))}
          />
        </Box>

        {fieldEditable && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            sx={{ mb: 1 }}
            onClick={() =>
              markDirty((d) => ({
                ...d,
                summaryRows: [...d.summaryRows, emptySummaryRow()],
              }))
            }
          >
            Add summary row
          </Button>
        )}

        <TableContainer>
          <Table size="small" sx={summaryTableSx}>
            <TableHead>
              <TableRow>
                <TableCell width={fieldEditable ? '16%' : '18%'}>Area</TableCell>
                <TableCell width={fieldEditable ? '39%' : '41%'}>Today (Excel / paper)</TableCell>
                <TableCell width={fieldEditable ? '39%' : '41%'}>With this app</TableCell>
                {fieldEditable && <TableCell width="6%" />}
              </TableRow>
            </TableHead>
            <TableBody>
              {display.summaryRows.map((row, idx) => (
                <TableRow key={`summary-${idx}`} hover>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <InlineEditableText
                      value={row.area}
                      editable={fieldEditable}
                      fontWeight={600}
                      onChange={(v) =>
                        markDirty((d) => {
                          const summaryRows = [...d.summaryRows];
                          summaryRows[idx] = { ...row, area: v };
                          return { ...d, summaryRows };
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <InlineEditableText
                      value={row.today}
                      editable={fieldEditable}
                      multiline
                      minRows={2}
                      onChange={(v) =>
                        markDirty((d) => {
                          const summaryRows = [...d.summaryRows];
                          summaryRows[idx] = { ...row, today: v };
                          return { ...d, summaryRows };
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <InlineEditableText
                      value={row.withApp}
                      editable={fieldEditable}
                      multiline
                      minRows={2}
                      onChange={(v) =>
                        markDirty((d) => {
                          const summaryRows = [...d.summaryRows];
                          summaryRows[idx] = { ...row, withApp: v };
                          return { ...d, summaryRows };
                        })
                      }
                    />
                  </TableCell>
                  {fieldEditable && (
                    <TableCell>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={display.summaryRows.length <= 1}
                        onClick={() =>
                          markDirty((d) => ({
                            ...d,
                            summaryRows: d.summaryRows.filter((_, i) => i !== idx),
                          }))
                        }
                        aria-label="Delete row"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ fontSize: '1.05rem', lineHeight: 1.6, mt: 3, fontWeight: 500 }}>
          <InlineEditableText
            value={display.closingText}
            editable={fieldEditable}
            multiline
            minRows={2}
            onChange={(v) => markDirty((d) => ({ ...d, closingText: v }))}
          />
        </Box>
      </Paper>

      <Divider sx={{ mb: 2 }} />

      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={1}>
        <Typography variant="overline" color="primary" fontWeight={700}>
          Contents
        </Typography>
        {fieldEditable && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() =>
              markDirty((d) => ({
                ...d,
                contentsGroups: [...d.contentsGroups, emptyContentsGroup()],
              }))
            }
          >
            Add section
          </Button>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        What is in this prototype — click Open to jump to a module during demo.
      </Typography>

      {display.contentsGroups.map((group, gIdx) => (
        <Paper key={`group-${gIdx}`} variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
          <Box
            sx={{
              px: 2,
              py: 1.25,
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Box flex={1} fontWeight={700}>
              <InlineEditableText
                value={group.group}
                editable={fieldEditable}
                fontWeight={700}
                onChange={(v) =>
                  markDirty((d) => {
                    const contentsGroups = [...d.contentsGroups];
                    contentsGroups[gIdx] = { ...group, group: v };
                    return { ...d, contentsGroups };
                  })
                }
              />
            </Box>
            {fieldEditable && (
              <Box display="flex" gap={0.5}>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() =>
                    markDirty((d) => {
                      const contentsGroups = [...d.contentsGroups];
                      contentsGroups[gIdx] = {
                        ...group,
                        items: [...group.items, emptyContentsItem()],
                      };
                      return { ...d, contentsGroups };
                    })
                  }
                >
                  Add module
                </Button>
                <IconButton
                  size="small"
                  color="error"
                  disabled={display.contentsGroups.length <= 1}
                  onClick={() =>
                    markDirty((d) => ({
                      ...d,
                      contentsGroups: d.contentsGroups.filter((_, i) => i !== gIdx),
                    }))
                  }
                  aria-label="Delete section"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width="20%">Module</TableCell>
                  <TableCell width="34%">What it does</TableCell>
                  <TableCell width="24%">Replaces</TableCell>
                  <TableCell width="14%">Path</TableCell>
                  <TableCell width="8%" align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {group.items.map((item, iIdx) => (
                  <TableRow key={`${gIdx}-${iIdx}`} hover>
                    <TableCell sx={{ fontWeight: 600 }}>
                      <InlineEditableText
                        value={item.module}
                        editable={fieldEditable}
                        fontWeight={600}
                        onChange={(v) =>
                          markDirty((d) => {
                            const contentsGroups = [...d.contentsGroups];
                            const items = [...group.items];
                            items[iIdx] = { ...item, module: v };
                            contentsGroups[gIdx] = { ...group, items };
                            return { ...d, contentsGroups };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <InlineEditableText
                        value={item.description}
                        editable={fieldEditable}
                        multiline
                        minRows={2}
                        onChange={(v) =>
                          markDirty((d) => {
                            const contentsGroups = [...d.contentsGroups];
                            const items = [...group.items];
                            items[iIdx] = { ...item, description: v };
                            contentsGroups[gIdx] = { ...group, items };
                            return { ...d, contentsGroups };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <InlineEditableText
                        value={item.replaces}
                        editable={fieldEditable}
                        color="text.secondary"
                        onChange={(v) =>
                          markDirty((d) => {
                            const contentsGroups = [...d.contentsGroups];
                            const items = [...group.items];
                            items[iIdx] = { ...item, replaces: v };
                            contentsGroups[gIdx] = { ...group, items };
                            return { ...d, contentsGroups };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {fieldEditable ? (
                        <InlineEditableText
                          value={item.path}
                          editable
                          placeholder="/path"
                          sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                          onChange={(v) =>
                            markDirty((d) => {
                              const contentsGroups = [...d.contentsGroups];
                              const items = [...group.items];
                              items[iIdx] = { ...item, path: v };
                              contentsGroups[gIdx] = { ...group, items };
                              return { ...d, contentsGroups };
                            })
                          }
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                          {item.path}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {!fieldEditable && (
                        <Button
                          size="small"
                          component={RouterLink}
                          to={item.path}
                          endIcon={<OpenIcon fontSize="small" />}
                        >
                          Open
                        </Button>
                      )}
                      {fieldEditable && (
                        <IconButton
                          size="small"
                          color="error"
                          disabled={group.items.length <= 1}
                          onClick={() =>
                            markDirty((d) => {
                              const contentsGroups = [...d.contentsGroups];
                              contentsGroups[gIdx] = {
                                ...group,
                                items: group.items.filter((_, i) => i !== iIdx),
                              };
                              return { ...d, contentsGroups };
                            })
                          }
                          aria-label="Delete module"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ))}

      {editMode && dirty && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            py: 1.5,
            px: 3,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 2,
            zIndex: (theme) => theme.zIndex.snackbar,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Unsaved changes
          </Typography>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button variant="outlined" onClick={cancelEdit} disabled={saving}>
            Cancel
          </Button>
        </Paper>
      )}

      <Snackbar
        open={saveOk}
        autoHideDuration={4000}
        onClose={() => setSaveOk(false)}
        message="Summary & Contents saved."
      />
    </Box>
  );
}
