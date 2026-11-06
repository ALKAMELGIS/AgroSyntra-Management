import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Chip, Tabs, Tab,
  CircularProgress, Grid, FormControl, InputLabel, Select, IconButton, Tooltip, Switch,
  FormControlLabel, Divider, Alert, Autocomplete, Checkbox,
} from '@mui/material';
import { AddOutlined as Add, DeleteOutlined as Delete, CheckCircleOutlined as CheckCircle, CancelOutlined as Cancel, ContentCopyOutlined as ContentCopy } from '@mui/icons-material';
import api from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useMasterData } from '../../utils/useMasterData';
import { canEditIpmCatalog, canManagePppMsds } from '../../utils/ipmAccess';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../../components/table/ExcelTable';
import PppMsdsTab from './PppMsdsTab';
import InfoNote from '../../components/InfoNote';

const FORMULATION_TYPES = ['spray', 'drench', 'fog', 'granule', 'dust', 'other'];
const AGENT_TYPES = ['predatory_mite', 'parasitic_wasp', 'nematode', 'fungus', 'bacteria', 'other'];
const BIO_FORM_TYPES = ['bottle', 'sachet', 'pouch', 'other'];

// Product name and Active Ingredient stay pinned: the pesticide tab is 16 columns
// wide, and once scrolled past dose every row looks alike without them.
const PRODUCT_FROZEN_WIDTHS = [150, 180];
const TABLE_MAX_HEIGHT = 'calc(100vh - 260px)';
const PHI_TABLE_MAX_HEIGHT = 'calc(100vh - 300px)';

// Product header bands and the yellow add/edit rows have to outrank excelTableSx
// hover, which would otherwise grey them the moment the mouse crossed a row
// someone was typing into.
const phiRowSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root.row-section .MuiTableCell-root': {
    backgroundColor: 'table.sectionBg',
    color: 'table.sectionText',
    fontWeight: 600,
  },
  '&&& .MuiTableBody-root .MuiTableRow-root.row-draft .MuiTableCell-root': {
    backgroundColor: '#fffde7',
  },
};

const EMPTY_PEST_FORM = {
  name: '', activeIngredient: '', formulationType: 'spray', phiDays: '', phiText: '',
  manufacturer: '', registrationNumber: '', safetyNotes: '',
  targetCrops: '', targetPests: '',
  maxIndividualDose: '', maxTotalDose: '', maxApplications: '',
  growthStage: 'All Stages', sprayInterval: '',
  reEntryInterval: '', bumbleBeeInterval: '', chemicalCategory: '',
  hasLabelMsds: true,
};

export default function ProductCatalog() {
  const notify = useNotification();
  const { user } = useAuth();
  const { activeSiteId } = useActiveSite();
  const { data: masterData } = useMasterData();
  const { t } = useTranslation();
  const canManageMsds = canManagePppMsds(user);
  const canEdit = canEditIpmCatalog(user);
  const [tab, setTab] = useState(0);
  const [pesticideProducts, setPesticideProducts] = useState([]);
  const [foundationProducts, setFoundationProducts] = useState([]);
  const [bioProducts, setBioProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Pesticide form
  const [pestForm, setPestForm] = useState({ ...EMPTY_PEST_FORM });

  // Bio form
  const [bioForm, setBioForm] = useState({
    name: '', agentType: 'predatory_mite', formType: 'sachet', applicationRateGuide: '',
  });

  // PHI Table state
  const [cropPhiEntries, setCropPhiEntries] = useState([]);
  const [siteProducts, setSiteProducts] = useState([]);
  const [phiLoading, setPhiLoading] = useState(false);
  const [phiFilter, setPhiFilter] = useState('');
  const [addingPhi, setAddingPhi] = useState(null);
  const [newPhiCrop, setNewPhiCrop] = useState('');
  const [newPhiDays, setNewPhiDays] = useState('');
  const [editingPhiId, setEditingPhiId] = useState(null);
  const [editPhiDays, setEditPhiDays] = useState('');
  const [copyDialogProduct, setCopyDialogProduct] = useState(null);
  const [otherSitesPhi, setOtherSitesPhi] = useState([]);
  const [copySelected, setCopySelected] = useState(new Set());
  const [copyLoading, setCopyLoading] = useState(false);

  const cropOptions = useMemo(() => (masterData?.crops || []).map(c => c.name), [masterData]);

  const loadCropPhi = useCallback(async () => {
    if (!activeSiteId) return;
    setPhiLoading(true);
    try {
      const [phiRes, prodRes] = await Promise.all([
        api.get(`/ipm/site/${activeSiteId}/crop-phi`),
        api.get(`/ipm/pesticide-products/site/${activeSiteId}`),
      ]);
      setCropPhiEntries(phiRes.data.data || []);
      setSiteProducts(prodRes.data.data || []);
    } catch (err) {
      console.error('Failed to load crop PHI:', err);
    } finally {
      setPhiLoading(false);
    }
  }, [activeSiteId]);

  useEffect(() => { if (tab === 3) loadCropPhi(); }, [tab, loadCropPhi]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoadError(null);
      const [activeRes, foundationRes, bioRes] = await Promise.all([
        api.get('/ipm/pesticide-products/active'),
        api.get('/ipm/pesticide-products/foundation'),
        api.get('/ipm/bio-products'),
      ]);
      setPesticideProducts(activeRes.data.data || []);
      setFoundationProducts(foundationRes.data.data || []);
      setBioProducts(bioRes.data.data || []);
    } catch (err) {
      console.error('Failed to load:', err);
      setLoadError(err.message || 'Failed to load product catalog. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const validatePestForm = () => {
    const errors = {};
    if (!pestForm.name.trim()) errors.name = 'Product name is required';
    if (pestForm.phiDays !== '' && (isNaN(pestForm.phiDays) || Number(pestForm.phiDays) < 0))
      errors.phiDays = 'Must be zero or positive';
    if (pestForm.maxApplications !== '' && isNaN(pestForm.maxApplications))
      errors.maxApplications = 'Must be a number';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateBioForm = () => {
    const errors = {};
    if (!bioForm.name.trim()) errors.bioName = 'Product name is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreatePesticide = async () => {
    if (!validatePestForm()) return;
    setCreating(true);
    try {
      // Parse target pests from comma-separated string to array
      const payload = {
        ...pestForm,
        targetPests: pestForm.targetPests
          ? pestForm.targetPests.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      };
      await api.post('/ipm/pesticide-products', payload);
      setShowCreate(false);
      setPestForm({ ...EMPTY_PEST_FORM });
      setFormErrors({});
      notify.success('Pesticide product added');
      loadData();
    } catch (err) {
      notify.error(err.message || 'Failed to create product');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateBio = async () => {
    if (!validateBioForm()) return;
    setCreating(true);
    try {
      await api.post('/ipm/bio-products', bioForm);
      setShowCreate(false);
      setBioForm({ name: '', agentType: 'predatory_mite', formType: 'sachet', applicationRateGuide: '' });
      setFormErrors({});
      notify.success('Biological product added');
      loadData();
    } catch (err) {
      notify.error(err.message || 'Failed to create product');
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePesticide = async (id) => {
    if (!window.confirm('Remove this product from your organization\'s active list?')) return;
    try {
      await api.delete(`/ipm/pesticide-products/${id}`);
      notify.success('Product removed from active list');
      loadData();
    } catch (err) {
      notify.error(err.message || 'Failed to remove product');
    }
  };

  const activeProductIds = useMemo(
    () => new Set(pesticideProducts.map((p) => p.source_product_id || p.id)),
    [pesticideProducts],
  );

  const handleAddFromFoundation = async (foundationId) => {
    try {
      await api.post(`/ipm/pesticide-products/active/from-foundation/${foundationId}`);
      notify.success('Product added to your active list');
      loadData();
    } catch (err) {
      notify.error(err.message || 'Failed to add product');
    }
  };

  // ─── PHI Table handlers ───
  const handleAddCropPhi = async (productId) => {
    if (!newPhiCrop || !newPhiDays || isNaN(Number(newPhiDays))) {
      notify.error('Crop and PHI days are required');
      return;
    }
    try {
      await api.post(`/ipm/site/${activeSiteId}/crop-phi`, {
        productId, cropName: newPhiCrop, phiDays: Number(newPhiDays),
      });
      notify.success('Crop PHI added');
      setAddingPhi(null);
      setNewPhiCrop('');
      setNewPhiDays('');
      loadCropPhi();
    } catch (err) {
      notify.error(err.message || 'Failed to save crop PHI');
    }
  };

  const handleEditCropPhi = async (entry) => {
    if (!editPhiDays || isNaN(Number(editPhiDays))) return;
    try {
      await api.post(`/ipm/site/${activeSiteId}/crop-phi`, {
        productId: entry.product_id, cropName: entry.crop_name, phiDays: Number(editPhiDays),
      });
      notify.success('PHI updated');
      setEditingPhiId(null);
      loadCropPhi();
    } catch (err) {
      notify.error(err.message || 'Failed to update');
    }
  };

  const handleDeleteCropPhi = async (id) => {
    try {
      await api.delete(`/ipm/crop-phi/${id}`);
      notify.success('Crop PHI removed');
      loadCropPhi();
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  const handleOpenCopyDialog = async (product) => {
    setCopyDialogProduct(product);
    setCopySelected(new Set());
    try {
      const res = await api.get(`/ipm/pesticide-products/${product.id}/crop-phi/other-sites?excludeSite=${activeSiteId}`);
      setOtherSitesPhi(res.data.data || []);
    } catch (err) {
      setOtherSitesPhi([]);
    }
  };

  const handleCopyPhi = async () => {
    if (copySelected.size === 0) return;
    setCopyLoading(true);
    try {
      const entries = otherSitesPhi
        .filter(e => copySelected.has(e.id))
        .map(e => ({ productId: e.product_id, cropName: e.crop_name, phiDays: e.phi_days }));
      await api.post(`/ipm/site/${activeSiteId}/crop-phi/bulk-copy`, { entries });
      notify.success(`Copied ${entries.length} PHI entries to your site`);
      setCopyDialogProduct(null);
      loadCropPhi();
    } catch (err) {
      notify.error(err.message || 'Copy failed');
    } finally {
      setCopyLoading(false);
    }
  };

  // Group PHI entries by product for display
  const phiGrouped = useMemo(() => {
    const filtered = phiFilter
      ? cropPhiEntries.filter(e =>
          e.product_name?.toLowerCase().includes(phiFilter.toLowerCase()) ||
          e.crop_name?.toLowerCase().includes(phiFilter.toLowerCase()))
      : cropPhiEntries;

    const groups = {};
    for (const entry of filtered) {
      if (!groups[entry.product_id]) {
        groups[entry.product_id] = {
          productId: entry.product_id,
          productName: entry.product_name,
          defaultPhi: entry.default_phi_days,
          activeIngredient: entry.active_ingredient,
          entries: [],
        };
      }
      groups[entry.product_id].entries.push(entry);
    }

    // Also include site products with NO crop-specific PHI so they appear in the table
    for (const p of siteProducts) {
      if (!groups[p.id]) {
        if (phiFilter && !p.name?.toLowerCase().includes(phiFilter.toLowerCase())) continue;
        groups[p.id] = {
          productId: p.id,
          productName: p.name,
          defaultPhi: p.phi_days,
          activeIngredient: p.active_ingredient,
          entries: [],
        };
      }
    }

    return Object.values(groups).sort((a, b) => a.productName?.localeCompare(b.productName));
  }, [cropPhiEntries, siteProducts, phiFilter]);

  // Helper to display target pests from JSONB
  const formatPests = (pests) => {
    if (!pests) return '-';
    if (typeof pests === 'string') {
      try { pests = JSON.parse(pests); } catch { return pests; }
    }
    if (Array.isArray(pests)) return pests.join(', ');
    return '-';
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

  if (loadError) return (
    <Box sx={{ p: 4, textAlign: 'center' }}>
      <Alert severity="error" sx={{ mb: 2, justifyContent: 'center' }}>{loadError}</Alert>
      <Button variant="contained" onClick={() => { setLoading(true); loadData(); }}>
        Retry
      </Button>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Product Catalog</Typography>
          <Typography variant="body2" color="text.secondary">
            {pesticideProducts.length} active pesticide products, {foundationProducts.length} foundation reference items, {bioProducts.length} biological products
          </Typography>
        </Box>
        {tab === 0 && canEdit && (
          <Button variant="contained" startIcon={<Add />} onClick={() => setShowCreate(true)}>
            Add Product
          </Button>
        )}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label={`Pesticide Products (${pesticideProducts.length})`} />
        <Tab label={`Pesticides Products Catalog Info (${foundationProducts.length})`} />
        <Tab label={`Biological Products (${bioProducts.length})`} />
        <Tab label="PHI Table" />
        <Tab label="PPP MSDS" />
      </Tabs>

      {!canEdit && tab !== 4 && (
        <InfoNote severity="info" sx={{ mb: 2 }}>{t('ipmCatalogAccess.productViewOnly')}</InfoNote>
      )}

      {/* ─── Pesticide Products Table (Excel column order) ─── */}
      {tab === 0 && (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: TABLE_MAX_HEIGHT }}>
          <Table size="small" sx={[excelTableSx, freezeColumnsSx(PRODUCT_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell className="col-frozen-0">Product Trade Name</TableCell>
                <TableCell className="col-frozen-1">Active Ingredient(s)</TableCell>
                <TableCell>Target Crop(s)</TableCell>
                <TableCell>Target Disease/Pests</TableCell>
                <TableCell>Max Individual Dose</TableCell>
                <TableCell>Max Total Dose</TableCell>
                <TableCell className="col-numeric">Max Apps</TableCell>
                <TableCell>Growth Stage</TableCell>
                <TableCell>Spray Interval</TableCell>
                <TableCell>PHI</TableCell>
                <TableCell>Re-Entry Interval</TableCell>
                <TableCell>Bumble Bee Interval</TableCell>
                <TableCell>Chemical Category</TableCell>
                <TableCell>Label & MSDS</TableCell>
                {canEdit && <TableCell>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {pesticideProducts.map((p, idx) => (
                <TableRow key={p.id} hover>
                  <GutterCell index={idx + 1} />
                  <TableCell className="col-frozen-0" title={p.name || ''}>
                    {p.name}
                  </TableCell>
                  <TableCell className="col-frozen-1" title={p.active_ingredient || ''}>
                    {p.active_ingredient || '-'}
                  </TableCell>
                  <TableCell>{p.target_crops || '-'}</TableCell>
                  <TableCell>{formatPests(p.target_pests)}</TableCell>
                  <TableCell>{p.max_individual_dose || '-'}</TableCell>
                  <TableCell>{p.max_total_dose || '-'}</TableCell>
                  <TableCell className="col-numeric">{p.max_applications || '-'}</TableCell>
                  <TableCell>{p.growth_stage || '-'}</TableCell>
                  <TableCell>{p.spray_interval || '-'}</TableCell>
                  <TableCell>
                    {p.phi_text || p.phi_days != null ? (
                    <Tooltip title={p.phi_text || `${p.phi_days} days`}>
                      <Chip
                        label={p.phi_text || `${p.phi_days}d`}
                        size="small"
                        color={p.phi_days >= 7 ? 'warning' : p.phi_days === 0 ? 'success' : 'default'}
                        sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      />
                    </Tooltip>
                    ) : '-'}
                  </TableCell>
                  <TableCell>{p.re_entry_interval || '-'}</TableCell>
                  <TableCell>{p.bumble_bee_interval || '-'}</TableCell>
                  <TableCell>{p.chemical_category || '-'}</TableCell>
                  <TableCell align="center">
                    {p.has_label_msds ? (
                      <CheckCircle color="success" fontSize="small" />
                    ) : (
                      <Cancel color="disabled" fontSize="small" />
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Tooltip title="Deactivate">
                        <IconButton size="small" color="error" onClick={() => handleDeletePesticide(p.id)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {pesticideProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 16 : 15} align="center">
                    <Typography color="text.secondary" py={4}>
                      No pesticide products added yet. Products will be seeded on next deploy.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ─── Foundation Catalog (read-only reference) ─── */}
      {tab === 1 && (
        <Box>
          <InfoNote severity="info" sx={{ mb: 2 }}>
            Reference catalog — platform-maintained PPP data sheets. Add items to your active product list; changes here do not affect other organizations.
          </InfoNote>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: PHI_TABLE_MAX_HEIGHT }}>
            <Table size="small" sx={[excelTableSx, freezeColumnsSx(PRODUCT_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
              <TableHead>
                <TableRow>
                  <GutterCell />
                  <TableCell className="col-frozen-0">Product Trade Name</TableCell>
                  <TableCell className="col-frozen-1">Active Ingredient(s)</TableCell>
                  <TableCell>Target Crop(s)</TableCell>
                  <TableCell>Target Disease/Pests</TableCell>
                  <TableCell>PHI</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {foundationProducts.map((p, idx) => (
                  <TableRow key={p.id} hover>
                    <GutterCell index={idx + 1} />
                    <TableCell className="col-frozen-0" title={p.name || ''}>
                      {p.name}
                    </TableCell>
                    <TableCell className="col-frozen-1" title={p.active_ingredient || ''}>
                      {p.active_ingredient || '-'}
                    </TableCell>
                    <TableCell>{p.target_crops || '-'}</TableCell>
                    <TableCell>{formatPests(p.target_pests)}</TableCell>
                    <TableCell>
                      <Chip label={p.phi_text || `${p.phi_days}d`} size="small" />
                    </TableCell>
                    <TableCell>
                      {activeProductIds.has(p.id) ? (
                        <Chip label="In active list" size="small" color="success" variant="outlined" />
                      ) : canEdit ? (
                        <Button size="small" variant="outlined" onClick={() => handleAddFromFoundation(p.id)}>
                          Add to my products
                        </Button>
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
                {foundationProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography color="text.secondary" py={4}>No foundation catalog items available.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ─── Biological Products Table ─── */}
      {tab === 2 && (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: TABLE_MAX_HEIGHT }}>
          <Table size="small" sx={excelTableSx}>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell>Name</TableCell>
                <TableCell>Agent Type</TableCell>
                <TableCell>Form Type</TableCell>
                <TableCell>Application Rate Guide</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bioProducts.map((p, idx) => (
                <TableRow key={p.id} hover>
                  <GutterCell index={idx + 1} />
                  <TableCell>{p.name}</TableCell>
                  <TableCell><Chip label={p.agent_type} size="small" variant="outlined" /></TableCell>
                  <TableCell>{p.form_type}</TableCell>
                  <TableCell>{p.application_rate_guide || '-'}</TableCell>
                </TableRow>
              ))}
              {bioProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography color="text.secondary" py={4}>
                      No biological products added yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ─── PHI Table Tab ─── */}
      {tab === 3 && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
            <TextField
              size="small" placeholder="Filter by product or crop..."
              value={phiFilter} onChange={(e) => setPhiFilter(e.target.value)}
              sx={{ width: 300 }}
            />
            <Typography variant="body2" color="text.secondary">
              {cropPhiEntries.length} crop-specific PHI entries across {phiGrouped.length} products
            </Typography>
          </Box>

          {phiLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: PHI_TABLE_MAX_HEIGHT }}>
              <Table size="small" sx={[excelTableSx, phiRowSx]}>
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell>Active Ingredient</TableCell>
                    <TableCell className="col-numeric">Default PHI</TableCell>
                    <TableCell>Crop</TableCell>
                    <TableCell className="col-numeric">Crop PHI (days)</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {phiGrouped.map((group) => (
                    <Fragment key={group.productId}>
                      {/* Product header row (with default PHI) */}
                      <TableRow className="row-section">
                        <TableCell>{group.productName}</TableCell>
                        <TableCell>{group.activeIngredient || '-'}</TableCell>
                        <TableCell className="col-numeric">
                          <Chip label={`${group.defaultPhi || 0}d`} size="small"
                            color={group.defaultPhi >= 7 ? 'warning' : group.defaultPhi === 0 ? 'success' : 'default'} />
                        </TableCell>
                        <TableCell colSpan={2}>
                          {group.entries.length === 0 ? 'No crop-specific overrides' : `${group.entries.length} crop override(s)`}
                        </TableCell>
                        <TableCell>
                          {canEdit && (
                            <>
                              <Tooltip title="Add crop PHI">
                                <IconButton size="small" color="primary" onClick={() => { setAddingPhi(group.productId); setNewPhiCrop(''); setNewPhiDays(''); }}>
                                  <Add fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Copy PHI from other sites">
                                <IconButton size="small" onClick={() => handleOpenCopyDialog({ id: group.productId, name: group.productName })}>
                                  <ContentCopy fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Add new crop PHI row */}
                      {canEdit && addingPhi === group.productId && (
                        <TableRow className="row-draft">
                          <TableCell />
                          <TableCell />
                          <TableCell />
                          <TableCell>
                            <Autocomplete
                              size="small" freeSolo options={cropOptions}
                              value={newPhiCrop} onInputChange={(_, v) => setNewPhiCrop(v)}
                              renderInput={(params) => <TextField {...params} placeholder="Select crop" size="small" />}
                              sx={{ minWidth: 130 }}
                            />
                          </TableCell>
                          <TableCell className="col-numeric">
                            <TextField size="small" type="number" placeholder="Days" value={newPhiDays}
                              onChange={(e) => setNewPhiDays(e.target.value)}
                              inputProps={{ min: 0 }} sx={{ width: 80 }} />
                          </TableCell>
                          <TableCell>
                            <Button size="small" variant="contained" sx={{ mr: 1, textTransform: 'none' }}
                              onClick={() => handleAddCropPhi(group.productId)}>Save</Button>
                            <Button size="small" sx={{ textTransform: 'none' }}
                              onClick={() => setAddingPhi(null)}>Cancel</Button>
                          </TableCell>
                        </TableRow>
                      )}

                      {/* Existing crop PHI entries */}
                      {group.entries.map((entry) => (
                        <TableRow key={entry.id} hover className={editingPhiId === entry.id ? 'row-draft' : undefined}>
                          <TableCell />
                          <TableCell />
                          <TableCell />
                          <TableCell>
                            <Chip label={entry.crop_name} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell className="col-numeric">
                            {canEdit && editingPhiId === entry.id ? (
                              <TextField size="small" type="number" value={editPhiDays}
                                onChange={(e) => setEditPhiDays(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleEditCropPhi(entry); }}
                                inputProps={{ min: 0 }} sx={{ width: 70 }} autoFocus />
                            ) : canEdit ? (
                              <Typography variant="body2" fontWeight={600}
                                sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                                onClick={() => { setEditingPhiId(entry.id); setEditPhiDays(String(entry.phi_days)); }}>
                                {entry.phi_days}d
                              </Typography>
                            ) : (
                              <Typography variant="body2" fontWeight={600}>{entry.phi_days}d</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {!canEdit ? null : editingPhiId === entry.id ? (
                              <>
                                <Button size="small" sx={{ textTransform: 'none', mr: 1 }}
                                  onClick={() => handleEditCropPhi(entry)}>Save</Button>
                                <Button size="small" sx={{ textTransform: 'none' }}
                                  onClick={() => setEditingPhiId(null)}>Cancel</Button>
                              </>
                            ) : (
                              <Tooltip title="Remove crop PHI">
                                <IconButton size="small" color="error" onClick={() => handleDeleteCropPhi(entry.id)}>
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                  {phiGrouped.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Typography color="text.secondary" py={4}>
                          {phiFilter ? 'No products match your filter' : 'No products in catalog yet'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {tab === 4 && <PppMsdsTab canManage={canManageMsds} />}

      {/* ─── Copy PHI from Other Sites Dialog ─── */}
      <Dialog open={!!copyDialogProduct} onClose={() => setCopyDialogProduct(null)} maxWidth="sm" fullWidth>
        <DialogTitle>PHI for "{copyDialogProduct?.name}" on Other Sites</DialogTitle>
        <DialogContent dividers>
          {otherSitesPhi.length === 0 ? (
            <Typography color="text.secondary" py={2}>
              No other sites have configured crop-specific PHI for this product yet.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell sx={{ fontWeight: 700 }}>Site</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Crop</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">PHI (days)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {otherSitesPhi.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox size="small"
                        checked={copySelected.has(entry.id)}
                        onChange={() => {
                          setCopySelected(prev => {
                            const next = new Set(prev);
                            next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                            return next;
                          });
                        }} />
                    </TableCell>
                    <TableCell>{entry.site_name}</TableCell>
                    <TableCell>{entry.crop_name}</TableCell>
                    <TableCell align="center">{entry.phi_days}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyDialogProduct(null)}>Cancel</Button>
          <Button variant="contained" disabled={copySelected.size === 0 || copyLoading}
            onClick={handleCopyPhi}>
            {copyLoading ? <CircularProgress size={20} /> : `Copy Selected (${copySelected.size}) to My Site`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Create Product Dialog ─── */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add {tab === 0 ? 'Pesticide' : 'Biological'} Product</DialogTitle>
        <DialogContent dividers>
          {tab === 0 ? (
            <>
              {/* Row 1: Name & Active Ingredient */}
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Product Trade Name *" value={pestForm.name}
                    onChange={(e) => setPestForm({ ...pestForm, name: e.target.value })}
                    error={!!formErrors.name} helperText={formErrors.name} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Active Ingredient(s)" value={pestForm.activeIngredient}
                    onChange={(e) => setPestForm({ ...pestForm, activeIngredient: e.target.value })} />
                </Grid>
              </Grid>

              {/* Row 2: Target Crops & Pests */}
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Target Crop(s)" value={pestForm.targetCrops}
                    onChange={(e) => setPestForm({ ...pestForm, targetCrops: e.target.value })}
                    placeholder="e.g. Tomato, Pepper, Cucumber" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Target Disease/Pests" value={pestForm.targetPests}
                    onChange={(e) => setPestForm({ ...pestForm, targetPests: e.target.value })}
                    placeholder="Comma-separated: Whitefly, Thrips, Mites" />
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* Row 3: Dose info */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Max Individual Dose" value={pestForm.maxIndividualDose}
                    onChange={(e) => setPestForm({ ...pestForm, maxIndividualDose: e.target.value })}
                    placeholder="e.g. 0.5 ml/L" />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Max Total Dose" value={pestForm.maxTotalDose}
                    onChange={(e) => setPestForm({ ...pestForm, maxTotalDose: e.target.value })}
                    placeholder="e.g. 1500L/Ha" />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Max Applications" value={pestForm.maxApplications}
                    onChange={(e) => setPestForm({ ...pestForm, maxApplications: e.target.value })}
                    placeholder="e.g. 2 or N/A"
                    error={!!formErrors.maxApplications} helperText={formErrors.maxApplications} />
                </Grid>
              </Grid>

              {/* Row 4: Timing */}
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Growth Stage" value={pestForm.growthStage}
                    onChange={(e) => setPestForm({ ...pestForm, growthStage: e.target.value })}
                    placeholder="e.g. All Stages" />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Spray Interval" value={pestForm.sprayInterval}
                    onChange={(e) => setPestForm({ ...pestForm, sprayInterval: e.target.value })}
                    placeholder="e.g. 7-10 days" />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="PHI (Days) *" type="number" value={pestForm.phiDays}
                    onChange={(e) => setPestForm({ ...pestForm, phiDays: e.target.value })}
                    inputProps={{ min: 0 }}
                    error={!!formErrors.phiDays} helperText={formErrors.phiDays || 'Pre-Harvest Interval (number)'} />
                </Grid>
              </Grid>

              {/* Row 5: PHI text, REI, Bee */}
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="PHI Details" value={pestForm.phiText}
                    onChange={(e) => setPestForm({ ...pestForm, phiText: e.target.value })}
                    placeholder="e.g. 3 days veg, 7 days fruit" />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Re-Entry Interval" value={pestForm.reEntryInterval}
                    onChange={(e) => setPestForm({ ...pestForm, reEntryInterval: e.target.value })}
                    placeholder="e.g. when field is dry" />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Bumble Bee Interval" value={pestForm.bumbleBeeInterval}
                    onChange={(e) => setPestForm({ ...pestForm, bumbleBeeInterval: e.target.value })}
                    placeholder="e.g. >30 days out" />
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* Row 6: Category, MSDS, legacy fields */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Chemical Category" value={pestForm.chemicalCategory}
                    onChange={(e) => setPestForm({ ...pestForm, chemicalCategory: e.target.value })}
                    placeholder="e.g. 4A, Acaricide" />
                </Grid>
                <Grid size={4}>
                  <FormControlLabel
                    control={
                      <Switch checked={pestForm.hasLabelMsds}
                        onChange={(e) => setPestForm({ ...pestForm, hasLabelMsds: e.target.checked })} />
                    }
                    label="Label & MSDS Available"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="productcatalog-formulation-type-label-1">Formulation Type</InputLabel>
                    <Select labelId="productcatalog-formulation-type-label-1" value={pestForm.formulationType} label="Formulation Type"
                      onChange={(e) => setPestForm({ ...pestForm, formulationType: e.target.value })}>
                      {FORMULATION_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              {/* Row 7: Manufacturer, Reg#, Safety Notes */}
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Manufacturer" value={pestForm.manufacturer}
                    onChange={(e) => setPestForm({ ...pestForm, manufacturer: e.target.value })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Registration #" value={pestForm.registrationNumber}
                    onChange={(e) => setPestForm({ ...pestForm, registrationNumber: e.target.value })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Safety Notes" value={pestForm.safetyNotes}
                    onChange={(e) => setPestForm({ ...pestForm, safetyNotes: e.target.value })} />
                </Grid>
              </Grid>
            </>
          ) : (
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={12}>
                <TextField fullWidth label="Product Name *" value={bioForm.name}
                  onChange={(e) => setBioForm({ ...bioForm, name: e.target.value })}
                  error={!!formErrors.bioName} helperText={formErrors.bioName} />
              </Grid>
              <Grid size={6}>
                <FormControl fullWidth>
                  <InputLabel id="productcatalog-agent-type-label-2">Agent Type</InputLabel>
                  <Select labelId="productcatalog-agent-type-label-2" value={bioForm.agentType} label="Agent Type"
                    onChange={(e) => setBioForm({ ...bioForm, agentType: e.target.value })}>
                    {AGENT_TYPES.map((t) => <MenuItem key={t} value={t}>{t.replace('_', ' ')}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={6}>
                <FormControl fullWidth>
                  <InputLabel id="productcatalog-form-type-label-3">Form Type</InputLabel>
                  <Select labelId="productcatalog-form-type-label-3" value={bioForm.formType} label="Form Type"
                    onChange={(e) => setBioForm({ ...bioForm, formType: e.target.value })}>
                    {BIO_FORM_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={12}>
                <TextField fullWidth multiline rows={2} label="Application Rate Guide" value={bioForm.applicationRateGuide}
                  onChange={(e) => setBioForm({ ...bioForm, applicationRateGuide: e.target.value })} />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="contained" disabled={creating}
            onClick={tab === 0 ? handleCreatePesticide : handleCreateBio}>
            {creating ? <CircularProgress size={20} /> : 'Add Product'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
