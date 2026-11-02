import { useEffect, useMemo, useState } from 'react';
import { useConfirmDialog } from '../components/ConfirmDialog';
import {
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AddOutlined as Add, DeleteOutlined as Delete, EditOutlined as Edit, TaskAltOutlined as TaskAlt } from '@mui/icons-material';
import { FERTILIZER_LIST } from '../data/recipeDatabase';
import { approveRecipe, createRecipe, deleteRecipe, listRecipesAll, updateRecipe } from '../utils/backendApi';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { canApproveRecipes, isRecipeApproved } from '../utils/recipeApproval';
import { canEditRecipes } from '../utils/roleAccess';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../components/table/ExcelTable';

const RECIPE_FROZEN_WIDTHS = [180];

const emptyFertilizers = FERTILIZER_LIST.map((fert) => ({
  name: fert.name,
  kgPerLiter: '',
  dose: '',
  tankVolume: '',
  quantityPer1000L: '',
  elementPpm: '',
  element: fert.element,
  concentration: fert.concentration ?? '',
}));

function buildFertilizerRows(existing = []) {
  return FERTILIZER_LIST.map((fert) => {
    const match = existing.find((item) => item.name === fert.name);
    return {
      name: fert.name,
      kgPerLiter: match?.kgPerLiter ?? '',
      dose: match?.dose ?? '',
      tankVolume: match?.tankVolume ?? '',
      quantityPer1000L: match?.quantityPer1000L ?? '',
      elementPpm: match?.elementPpm
        ? Object.entries(match.elementPpm)
            .map(([key, value]) => `${key}:${value}`)
            .join(', ')
        : '',
      element: match?.element ?? fert.element ?? '',
      concentration: match?.concentration ?? fert.concentration ?? '',
    };
  });
}

function RecipesManagement() {
  const notify = useNotification();
  const [confirm, confirmDialog] = useConfirmDialog();
  const { user } = useAuth();
  const canApprove = canApproveRecipes(user);
  // Worker, agronomist and operation manager edit recipes; CEO / farm manager view only.
  const canEdit = canEditRecipes(user);
  const { t } = useTranslation();
  const [approvingId, setApprovingId] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    tankVolume: '',
    cycles: '',
    fertilizers: emptyFertilizers,
  });

  const loadRecipes = async () => {
    try {
      const data = await listRecipesAll();
      setRecipes(data);
    } catch (error) {
      setRecipes([]);
      notify.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecipes();
  }, []);

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      tankVolume: '',
      cycles: '',
      fertilizers: emptyFertilizers,
    });
    setEditing(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (recipe) => {
    setEditing(recipe);
    setForm({
      name: recipe.name || '',
      description: recipe.description || '',
      tankVolume: recipe.tankVolume ?? '',
      cycles: recipe.cycles ?? '',
      fertilizers: buildFertilizerRows(recipe.fertilizers || []),
    });
    setDialogOpen(true);
  };

  const handleDelete = async (recipeId) => {
    if (!(await confirm('Delete this recipe?', { title: 'Delete Recipe' }))) return;
    try {
      await deleteRecipe(recipeId);
      await loadRecipes();
      notify.success('Recipe deleted');
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleApprove = async (recipe) => {
    setApprovingId(recipe.id);
    try {
      await approveRecipe(recipe.id);
      await loadRecipes();
      notify.success(`Recipe "${recipe.name}" approved`);
    } catch (error) {
      notify.error(error.message);
    } finally {
      setApprovingId(null);
    }
  };

  const handleFertilizerChange = (index, key, value) => {
    setForm((prev) => {
      const next = [...prev.fertilizers];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, fertilizers: next };
    });
  };

  const parseElementPpm = (value) => {
    if (!value || !value.trim()) return undefined;
    const pairs = value.split(',').map((part) => part.trim()).filter(Boolean);
    const result = {};
    for (const pair of pairs) {
      const [key, rawValue] = pair.split(':').map((item) => item.trim());
      const num = Number(rawValue);
      if (key && Number.isFinite(num)) {
        result[key] = num;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  };

  const buildPayload = () => {
    const tankVolumeValue = form.tankVolume !== '' ? Number(form.tankVolume) : undefined;
    const cyclesValue = form.cycles !== '' ? Number(form.cycles) : undefined;
    const fertilizers = form.fertilizers.map((fert) => ({
      name: fert.name,
      kgPerLiter: fert.kgPerLiter !== '' ? Number(fert.kgPerLiter) : undefined,
      dose: fert.dose !== '' ? Number(fert.dose) : undefined,
      tankVolume: fert.tankVolume !== '' ? Number(fert.tankVolume) : undefined,
      quantityPer1000L: fert.quantityPer1000L !== '' ? Number(fert.quantityPer1000L) : undefined,
      elementPpm: parseElementPpm(fert.elementPpm),
    }));

    return {
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      ...(Number.isFinite(tankVolumeValue) ? { tankVolume: tankVolumeValue } : {}),
      ...(Number.isFinite(cyclesValue) ? { cycles: Math.round(cyclesValue) } : {}),
      fertilizers,
    };
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      notify.error('Recipe name is required');
      return;
    }
    try {
      const payload = buildPayload();
      if (editing?.id) {
        if (isRecipeApproved(editing) && !(await confirm(
          'Saving changes sends this recipe back to Draft. It cannot be used until the operations manager approves it again.',
          { title: 'Recipe needs re-approval' }
        ))) return;
        await updateRecipe(editing.id, payload);
        notify.success('Recipe updated');
      } else {
        await createRecipe(payload);
        notify.success('Recipe created');
      }
      setDialogOpen(false);
      resetForm();
      await loadRecipes();
    } catch (error) {
      notify.error(error.message);
    }
  };

  const rows = useMemo(() => recipes, [recipes]);

  if (loading) {
    return (
      <Container maxWidth="xl">
        <Paper elevation={3} sx={{ p: 4, mt: 2 }}>
          <Typography variant="h4" sx={{ mb: 3 }}>Recipes Management</Typography>
          <TableSkeleton rows={5} columns={6} />
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Paper elevation={3} sx={{ p: 4, mt: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
          <Typography variant="h4">Recipes Management</Typography>
          {canEdit && (
            <Button variant="contained" startIcon={<Add />} onClick={openAdd}>
              Add Recipe
            </Button>
          )}
        </Box>
        {!canEdit && (
          <Alert severity="info" sx={{ mb: 2 }}>{t('adminAccess.recipesViewOnly')}</Alert>
        )}

        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 280px)' }}>
          <Table size="small" sx={[excelTableSx, freezeColumnsSx(RECIPE_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell className="col-frozen-0">Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Description</TableCell>
                <TableCell className="col-numeric">Tank Volume</TableCell>
                <TableCell className="col-numeric">Cycles</TableCell>
                <TableCell className="col-numeric">Fertilizers</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    No recipes yet
                  </TableCell>
                </TableRow>
              )}
              {rows.map((recipe, idx) => (
                <TableRow key={recipe.id} hover>
                  <GutterCell index={idx + 1} />
                  <TableCell className="col-frozen-0" title={recipe.name}>{recipe.name}</TableCell>
                  <TableCell>
                    {isRecipeApproved(recipe) ? (
                      <Chip size="small" color="success" variant="outlined" label="Approved" />
                    ) : (
                      <Chip size="small" color="warning" variant="outlined" label="Draft" />
                    )}
                  </TableCell>
                  <TableCell>{recipe.description || '-'}</TableCell>
                  <TableCell className="col-numeric">{recipe.tankVolume ?? '-'}</TableCell>
                  <TableCell className="col-numeric">{recipe.cycles ?? '-'}</TableCell>
                  <TableCell className="col-numeric">{recipe.fertilizers?.length || 0}</TableCell>
                  <TableCell>
                    {canApprove && !isRecipeApproved(recipe) && (
                      <Button
                        size="small"
                        color="success"
                        startIcon={<TaskAlt />}
                        disabled={approvingId === recipe.id}
                        onClick={() => handleApprove(recipe)}
                        aria-label={`Approve recipe ${recipe.name}`}
                      >
                        Approve
                      </Button>
                    )}
                    {canEdit && (
                      <>
                        <Button size="small" startIcon={<Edit />} onClick={() => openEdit(recipe)}>
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<Delete />}
                          onClick={() => handleDelete(recipe.id)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>{editing ? 'Edit Recipe' : 'Add Recipe'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Recipe Name"
                fullWidth
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField
                label="Description"
                fullWidth
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Tank Volume (L)"
                fullWidth
                type="number"
                value={form.tankVolume}
                onChange={(e) => setForm((prev) => ({ ...prev, tankVolume: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Cycles"
                fullWidth
                type="number"
                value={form.cycles}
                onChange={(e) => setForm((prev) => ({ ...prev, cycles: e.target.value }))}
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Fertilizers (KG/L)
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small" sx={excelTableSx}>
                <TableHead>
                  <TableRow>
                    <GutterCell />
                    <TableCell>Name</TableCell>
                    <TableCell className="col-numeric">KG/L</TableCell>
                    <TableCell className="col-numeric">Dose</TableCell>
                    <TableCell className="col-numeric">Tank</TableCell>
                    <TableCell className="col-numeric">Qty/1000L</TableCell>
                    <TableCell>Element PPM</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {form.fertilizers.map((fert, index) => (
                    <TableRow key={fert.name} hover>
                      <GutterCell index={index + 1} />
                      <TableCell>{fert.name}</TableCell>
                      <TableCell className="col-numeric">
                        <TextField
                          type="number"
                          value={fert.kgPerLiter}
                          onChange={(e) => handleFertilizerChange(index, 'kgPerLiter', e.target.value)}
                          inputProps={{ step: 0.00001 }}
                          size="small"
                        />
                      </TableCell>
                      <TableCell className="col-numeric">
                        <TextField
                          type="number"
                          value={fert.dose}
                          onChange={(e) => handleFertilizerChange(index, 'dose', e.target.value)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell className="col-numeric">
                        <TextField
                          type="number"
                          value={fert.tankVolume}
                          onChange={(e) => handleFertilizerChange(index, 'tankVolume', e.target.value)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell className="col-numeric">
                        <TextField
                          type="number"
                          value={fert.quantityPer1000L}
                          onChange={(e) => handleFertilizerChange(index, 'quantityPer1000L', e.target.value)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          value={fert.elementPpm}
                          onChange={(e) => handleFertilizerChange(index, 'elementPpm', e.target.value)}
                          placeholder="K:50, S:18"
                          size="small"
                          fullWidth
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            {editing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
      {confirmDialog}
    </Container>
  );
}

export default RecipesManagement;
