import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Box, Typography, Checkbox, FormControlLabel, FormGroup, Divider, Alert,
  List, ListItemButton, ListItemText, IconButton, MenuItem,
} from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
import {
  createFertigationGroup,
  updateFertigationGroup,
  deleteFertigationGroup,
} from '../../utils/backendApi';
import { useNotification } from '../../contexts/NotificationContext';
import { isRecipeApproved, recipeOptionLabel, recipePickerOptions } from '../../utils/recipeApproval';

const emptyForm = () => ({
  name: '',
  fieldIds: [],
  defaultRecipeId: '',
});

export default function FertigationGroupManager({
  open,
  onClose,
  siteId,
  allFieldsForSite,
  farmAreasForSite,
  recipes,
  groups,
  onGroupsChange,
  readOnly = false,
}) {
  const notify = useNotification();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const fieldsByArea = useMemo(() => {
    const map = new Map();
    farmAreasForSite.forEach((fa) => {
      map.set(fa.id, { name: fa.name, fields: allFieldsForSite.filter((f) => f.farmAreaId === fa.id) });
    });
    return map;
  }, [farmAreasForSite, allFieldsForSite]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setForm(emptyForm());
    }
  }, [open]);

  const startCreate = () => {
    setEditingId('new');
    setForm(emptyForm());
  };

  const startEdit = (group) => {
    setEditingId(group.id);
    setForm({
      name: group.name,
      fieldIds: [...(group.fieldIds || [])],
      defaultRecipeId: group.defaultRecipeId || '',
    });
  };

  const toggleField = (fieldId) => {
    setForm((prev) => {
      const set = new Set(prev.fieldIds);
      if (set.has(fieldId)) set.delete(fieldId);
      else set.add(fieldId);
      return { ...prev, fieldIds: [...set] };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      notify.error('Group name is required');
      return;
    }
    if (form.fieldIds.length === 0) {
      notify.error('Select at least one field');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        siteId,
        name: form.name.trim(),
        fieldIds: form.fieldIds,
        defaultRecipeId: form.defaultRecipeId || null,
      };
      if (editingId === 'new') {
        await createFertigationGroup(payload);
        notify.success('Field group created');
      } else {
        await updateFertigationGroup(editingId, {
          name: payload.name,
          fieldIds: payload.fieldIds,
          defaultRecipeId: payload.defaultRecipeId,
        });
        notify.success('Field group updated');
      }
      setEditingId(null);
      setForm(emptyForm());
      if (onGroupsChange) await onGroupsChange();
    } catch (err) {
      notify.error(err.message || 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group) => {
    if (!window.confirm(`Delete group "${group.name}"?`)) return;
    try {
      await deleteFertigationGroup(group.id);
      notify.success('Group deleted');
      if (editingId === group.id) {
        setEditingId(null);
        setForm(emptyForm());
      }
      if (onGroupsChange) await onGroupsChange();
    } catch (err) {
      notify.error(err.message || 'Failed to delete group');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Manage Fertigation Field Groups</DialogTitle>
      <DialogContent dividers>
        {!siteId && (
          <Alert severity="info">Select a site first.</Alert>
        )}

        {siteId && !editingId && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Saved groups apply shared recipe and water defaults during daily entry.
              </Typography>
              {!readOnly && (
                <Button size="small" startIcon={<Add />} variant="contained" onClick={startCreate}>
                  New group
                </Button>
              )}
            </Box>
            {groups.length === 0 ? (
              <Alert severity="info">No field groups yet. Create one for blocks like Nethouse 1–10.</Alert>
            ) : (
              <List dense disablePadding>
                {groups.map((group) => (
                  <ListItemButton
                    key={group.id}
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 1 }}
                    onClick={() => !readOnly && startEdit(group)}
                  >
                    <ListItemText
                      primary={group.name}
                      secondary={`${group.fieldIds?.length || 0} field(s)${
                        group.defaultRecipeId
                          ? ` · default recipe: ${recipes.find((r) => r.id === group.defaultRecipeId)?.name || 'set'}`
                          : ''
                      }`}
                    />
                    {!readOnly && (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); startEdit(group); }}>
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDelete(group); }}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                    )}
                  </ListItemButton>
                ))}
              </List>
            )}
          </>
        )}

        {siteId && editingId && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              size="small"
              label="Group name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Nethouses 1–10"
              fullWidth
            />
            <TextField
              size="small"
              select
              label="Default recipe (optional)"
              value={form.defaultRecipeId}
              onChange={(e) => setForm({ ...form, defaultRecipeId: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {recipePickerOptions(recipes, form.defaultRecipeId).map((r) => (
                <MenuItem key={r.id} value={r.id} disabled={!isRecipeApproved(r)}>{recipeOptionLabel(r)}</MenuItem>
              ))}
            </TextField>

            <Typography variant="subtitle2">Fields in this group</Typography>
            {[...fieldsByArea.entries()].map(([areaId, { name, fields }]) => (
              fields.length > 0 && (
                <Box key={areaId}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{name}</Typography>
                  <FormGroup row sx={{ flexWrap: 'wrap' }}>
                    {fields.map((f) => (
                      <FormControlLabel
                        key={f.id}
                        control={
                          <Checkbox
                            size="small"
                            checked={form.fieldIds.includes(f.id)}
                            onChange={() => toggleField(f.id)}
                          />
                        }
                        label={f.name}
                      />
                    ))}
                  </FormGroup>
                  <Divider sx={{ mt: 1 }} />
                </Box>
              )
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {editingId ? (
          <>
            <Button onClick={() => { setEditingId(null); setForm(emptyForm()); }}>Back</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving || readOnly}>
              {saving ? 'Saving…' : editingId === 'new' ? 'Create' : 'Save'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
