import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Button,
  Chip,
  IconButton,
  Breadcrumbs,
  Link,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Tabs,
  Tab,
  Tooltip,
  Divider,
  TextField,
  Autocomplete,
  InputAdornment,
} from '@mui/material';
import {
  ScienceOutlined as ScienceIcon,
  WaterDropOutlined as WaterDropIcon,
  AgricultureOutlined as AgricultureIcon,
  YardOutlined as YardIcon,
  PestControlOutlined as PestIcon,
  DescriptionOutlined as DescriptionIcon,
  SpaOutlined as SpaIcon,
  CloudOutlined as CloudIcon,
  GroupsOutlined as GroupsIcon,
  AddOutlined as AddIcon,
  ArrowBackOutlined as BackIcon,
  OpenInNewOutlined as OpenIcon,
  EditOutlined as EditIcon,
  DeleteOutlined as DeleteIcon,
  SettingsOutlined as SettingsIcon,
  NavigateNextOutlined as NavNextIcon,
  ContentCopyOutlined as CopyIcon,
  VisibilityOutlined as PreviewIcon,
  ViewColumnOutlined as ColumnsIcon,
  PublicOutlined as BrowseIcon,
  HomeOutlined as MySiteIcon,
  SearchOutlined as SearchIcon,
  StarOutlined as StarOutlinedIcon,
  Star as StarFilledIcon,
  CloseOutlined as CloseIcon,
  VisibilityOutlined as VisibilityIcon,
  VisibilityOffOutlined as VisibilityOffIcon,
} from '@mui/icons-material';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { apiRequest } from '../utils/api';
import InfoNote from '../components/InfoNote';
import PageTitle from '../components/PageTitle';

const CATEGORY_META = {
  ecph:        { label: 'EC / PH',              icon: <ScienceIcon sx={{ fontSize: 40 }} />,     color: '#1976d2' },
  fertigation: { label: 'Fertigation',          icon: <WaterDropIcon sx={{ fontSize: 40 }} />,   color: '#1f7a4d' },
  harvest:     { label: 'Harvest',              icon: <AgricultureIcon sx={{ fontSize: 40 }} />, color: '#ed6c02' },
  planting:    { label: 'Planting & Transplant', icon: <YardIcon sx={{ fontSize: 40 }} />,       color: '#9c27b0' },
  pest:        { label: 'Pest Applications',     icon: <PestIcon sx={{ fontSize: 40 }} />,       color: '#d32f2f' },
  scouting:    { label: 'Scouting Reports',      icon: <DescriptionIcon sx={{ fontSize: 40 }} />,color: '#0288d1' },
  biological:  { label: 'Biological Control',    icon: <SpaIcon sx={{ fontSize: 40 }} />,        color: '#388e3c' },
  weather:     { label: 'Weather',              icon: <CloudIcon sx={{ fontSize: 40 }} />,       color: '#5c6bc0' },
  workforce:   { label: 'Workforce',            icon: <GroupsIcon sx={{ fontSize: 40 }} />,      color: '#f57c00' },
};

const COLUMN_TYPE_LABELS = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  dropdown: 'Dropdown',
  calculated: 'Calculated',
};

const ADMIN_ROLES = ['ceo', 'farm_manager', 'operation_manager'];

const TEMPLATE_TYPE_BY_SLUG = {
  'scouting-report': 'Entry form',
  'scouting-summary': 'Summary / Report',
  'manpower-entry': 'Entry form',
  'nursery-sowing': 'Entry form',
};

function getTemplateTypeLabel(template) {
  if (template?.slug && TEMPLATE_TYPE_BY_SLUG[template.slug]) {
    return TEMPLATE_TYPE_BY_SLUG[template.slug];
  }
  const route = template?.route_path || '';
  if (route.includes('tab=summary')) return 'Summary / Report';
  if (route.includes('tab=nursery-sowing')) return 'Entry form';
  return null;
}

function TemplateTypeChip({ template, sx }) {
  const label = getTemplateTypeLabel(template);
  if (!label) return null;
  return (
    <Chip
      label={label}
      size="small"
      color={label === 'Entry form' ? 'default' : 'info'}
      variant="outlined"
      sx={{ fontSize: '0.65rem', height: 20, ...sx }}
    />
  );
}

function ColumnPreview({ columnsConfig }) {
  if (!columnsConfig || !Array.isArray(columnsConfig.columns) || columnsConfig.columns.length === 0) {
    return null;
  }
  const cols = columnsConfig.columns;
  const maxShow = 6;
  const shown = cols.slice(0, maxShow);
  const remaining = cols.length - maxShow;

  return (
    <Box sx={{ mt: 1.5, mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
        <ColumnsIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {cols.length} columns
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {shown.map((col, i) => (
          <Chip
            key={col.key || i}
            label={col.label || col.key}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.65rem', height: 20, '& .MuiChip-label': { px: 0.75 } }}
          />
        ))}
        {remaining > 0 && (
          <Chip
            label={`+${remaining} more`}
            size="small"
            sx={{ fontSize: '0.65rem', height: 20, bgcolor: 'action.hover', '& .MuiChip-label': { px: 0.75 } }}
          />
        )}
      </Box>
    </Box>
  );
}

function TemplatePreviewDialog({ template, open, onClose, onOpen, canEdit, onEdit, onFullPreview, activeSiteId, alreadyInSite, onAddToSite, onSetDefault, adding }) {
  if (!template) return null;

  const config = template.columns_config;
  const columns = config?.columns || [];
  const sections = config?.sections || [];
  const sectionMap = {};
  sections.forEach((s) => { sectionMap[s.key] = s.label || s.key; });
  const catMeta = CATEGORY_META[template.category];
  const typeLabel = getTemplateTypeLabel(template);

  let currentSection = null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pb: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{template.name}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
            {catMeta && (
              <Chip
                label={catMeta.label}
                size="small"
                sx={{ bgcolor: `${catMeta.color}15`, color: catMeta.color, fontWeight: 600, fontSize: '0.7rem' }}
              />
            )}
            {typeLabel && (
              <Chip
                label={typeLabel}
                size="small"
                color={typeLabel === 'Entry form' ? 'default' : 'info'}
                variant="outlined"
                sx={{ fontSize: '0.7rem' }}
              />
            )}
            {template.is_system ? (
              <Chip label="Built-in" size="small" variant="outlined" />
            ) : (
              <Chip label="Custom" size="small" color="primary" variant="outlined" />
            )}
            {template.site_name && (
              <Typography variant="caption" color="text.secondary">
                From: {template.site_name}
              </Typography>
            )}
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {template.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {template.description}
          </Typography>
        )}

        {columns.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              {template.is_system
                ? 'Built-in form with standard layout — no custom column configuration.'
                : 'No columns configured yet.'}
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 40 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Column</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 100 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {columns.map((col, idx) => {
                  const rows = [];
                  const colSection = col.sectionId || col.section;
                  if (colSection && colSection !== currentSection) {
                    currentSection = colSection;
                    rows.push(
                      <TableRow key={`section-${colSection}`}>
                        <TableCell
                          colSpan={4}
                          sx={{ bgcolor: 'action.hover', fontWeight: 700, fontSize: '0.8rem', py: 0.75 }}
                        >
                          {sectionMap[colSection] || colSection}
                        </TableCell>
                      </TableRow>,
                    );
                  }
                  rows.push(
                    <TableRow key={col.key || idx}>
                      <TableCell sx={{ color: 'text.secondary' }}>{idx + 1}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{col.label || col.key}</Typography>
                        <Typography variant="caption" color="text.secondary">{col.key}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={COLUMN_TYPE_LABELS[col.type] || col.type}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      </TableCell>
                      <TableCell>
                        {col.type === 'dropdown' && col.options && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {(typeof col.options === 'string' ? col.options.split(',') : col.options).map((opt, i) => (
                              <Chip
                                key={i}
                                label={typeof opt === 'string' ? opt.trim() : opt}
                                size="small"
                                sx={{ fontSize: '0.6rem', height: 18, bgcolor: 'action.hover' }}
                              />
                            ))}
                          </Box>
                        )}
                        {col.type === 'calculated' && col.formula && (
                          <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', color: 'text.secondary' }}>
                            {col.formula}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>,
                  );
                  return rows;
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="outlined" startIcon={<PreviewIcon />} onClick={onFullPreview}>
          Full Preview
        </Button>
        {activeSiteId && !alreadyInSite && (
          <Button
            variant="outlined"
            color="success"
            startIcon={<AddIcon />}
            onClick={() => onAddToSite(template)}
            disabled={adding}
          >
            {adding ? 'Adding...' : 'Add to my site'}
          </Button>
        )}
        {activeSiteId && alreadyInSite && !template.is_default && (
          <Button
            variant="outlined"
            color="warning"
            startIcon={<StarOutlinedIcon />}
            onClick={() => onSetDefault(template)}
          >
            Mark as Default
          </Button>
        )}
        {activeSiteId && alreadyInSite && template.is_default && (
          <Chip label="Default" size="small" color="warning" icon={<StarFilledIcon />} />
        )}
        {canEdit && (
          <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
            Edit
          </Button>
        )}
        {template.route_path && (
          <Button variant="contained" startIcon={<OpenIcon />} onClick={onOpen}>
            Open
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default function Templates() {
  const navigate = useNavigate();
  const { activeSiteId } = useActiveSite();
  const { user } = useAuth();
  const notify = useNotification();
  const isAdmin = ADMIN_ROLES.includes(user?.role);

  const [templates, setTemplates] = useState([]);
  const [browseTemplates, setBrowseTemplates] = useState([]);
  const [allTemplates, setAllTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [browseTab, setBrowseTab] = useState(0);
  const [configOpen, setConfigOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const [siteAssignments, setSiteAssignments] = useState({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [copying, setCopying] = useState(null);

  const [browseSiteFilter, setBrowseSiteFilter] = useState(null);
  const [browseSearch, setBrowseSearch] = useState('');

  const [previewTemplate, setPreviewTemplate] = useState(null);

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      if (activeSiteId) {
        const data = await apiRequest(`/form-templates/site/${activeSiteId}`);
        setTemplates(data);
      } else {
        const data = await apiRequest('/form-templates');
        setTemplates(data);
      }
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const loadBrowseTemplates = async () => {
    try {
      const data = await apiRequest('/form-templates/all');
      setBrowseTemplates(data);
    } catch {
      setBrowseTemplates([]);
    }
  };

  useEffect(() => {
    if (browseTab === 1) {
      loadBrowseTemplates();
    }
  }, [browseTab]);

  const mySiteTemplateIds = useMemo(
    () => new Set(templates.map((t) => t.id)),
    [templates],
  );

  const browseSiteOptions = useMemo(() => {
    const names = new Set();
    browseTemplates.forEach((t) => {
      if (t.site_name) names.add(t.site_name);
    });
    return Array.from(names).sort();
  }, [browseTemplates]);

  const filteredBrowseSource = useMemo(() => {
    if (browseTab !== 1) return browseTemplates;
    let list = browseTemplates;
    if (browseSiteFilter) {
      list = list.filter((t) => t.site_name === browseSiteFilter);
    }
    if (browseSearch.trim()) {
      const q = browseSearch.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.name || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [browseTemplates, browseSiteFilter, browseSearch, browseTab]);

  const categories = useMemo(() => {
    const source = browseTab === 0 ? templates : filteredBrowseSource;
    const map = {};
    source.forEach((t) => {
      if (!map[t.category]) map[t.category] = [];
      map[t.category].push(t);
    });
    const order = Object.keys(CATEGORY_META);
    return order
      .filter((key) => map[key])
      .map((key) => ({
        key,
        ...CATEGORY_META[key],
        templates: map[key].sort((a, b) => {
          if (a.is_default && !b.is_default) return -1;
          if (!a.is_default && b.is_default) return 1;
          return 0;
        }),
        count: map[key].length,
        hasDefault: map[key].some((t) => t.is_default),
      }));
  }, [templates, filteredBrowseSource, browseTab]);

  const handleCategoryClick = (cat) => {
    setSelectedCategory(cat);
  };

  const handleOpenTemplate = (tpl) => {
    if (tpl.route_path) {
      navigate(tpl.route_path);
    }
  };

  const handleDeleteTemplate = async (tpl) => {
    if (tpl.is_system) return;
    try {
      await apiRequest(`/form-templates/${tpl.id}?activeSiteId=${activeSiteId || ''}`, { method: 'DELETE' });
      notify.success('Template deleted');
      loadTemplates();
      if (browseTab === 1) loadBrowseTemplates();
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  const handleCopyTemplate = async (tpl) => {
    if (!activeSiteId) {
      notify.error('Select an active site first to copy templates');
      return;
    }
    setCopying(tpl.id);
    try {
      await apiRequest(`/form-templates/${tpl.id}/copy`, {
        method: 'POST',
        body: JSON.stringify({ siteId: activeSiteId }),
      });
      notify.success(`"${tpl.name}" copied to your site`);
      loadTemplates();
      if (browseTab === 1) loadBrowseTemplates();
    } catch (err) {
      notify.error(err.message || 'Failed to copy template');
    } finally {
      setCopying(null);
    }
  };

  const handleAddToSite = async (tpl) => {
    if (!activeSiteId) {
      notify.error('Select an active site first');
      return;
    }
    setCopying(tpl.id);
    try {
      if (tpl.is_system) {
        await apiRequest(`/form-templates/site/${activeSiteId}/add`, {
          method: 'POST',
          body: JSON.stringify({ templateId: tpl.id }),
        });
      } else {
        await apiRequest(`/form-templates/${tpl.id}/copy`, {
          method: 'POST',
          body: JSON.stringify({ siteId: activeSiteId }),
        });
      }
      notify.success(`"${tpl.name}" added to your site`);
      loadTemplates();
      if (browseTab === 1) loadBrowseTemplates();
    } catch (err) {
      notify.error(err.message || 'Failed to add template');
    } finally {
      setCopying(null);
    }
  };

  const handleSetDefault = async (tpl) => {
    if (!activeSiteId) {
      notify.error('Select an active site first');
      return;
    }
    try {
      await apiRequest(`/form-templates/site/${activeSiteId}/default`, {
        method: 'PUT',
        body: JSON.stringify({ templateId: tpl.id, category: tpl.category }),
      });
      notify.success(`"${tpl.name}" set as default`);
      loadTemplates();
    } catch (err) {
      notify.error(err.message || 'Failed to set default');
    }
  };

  const handleToggleVisibility = async (tpl) => {
    if (!activeSiteId) {
      notify.error('Select an active site first');
      return;
    }
    const nextVisible = tpl.is_visible === false;
    try {
      await apiRequest(`/form-templates/site/${activeSiteId}/${tpl.id}/visibility`, {
        method: 'PUT',
        body: JSON.stringify({ visible: nextVisible }),
      });
      notify.success(nextVisible ? `"${tpl.name}" shown in Crop History` : `"${tpl.name}" hidden from Crop History`);
      loadTemplates();
    } catch (err) {
      notify.error(err.message || 'Failed to update visibility');
    }
  };

  const canEdit = (tpl) => {
    if (tpl.is_system) return false;
    if (isAdmin) return true;
    return tpl.created_by_site_id && tpl.created_by_site_id === activeSiteId;
  };

  const canDelete = (tpl) => canEdit(tpl);

  // ---------- Site config dialog ----------
  const openConfig = async () => {
    try {
      const [all, siteList] = await Promise.all([
        apiRequest('/form-templates'),
        apiRequest('/sites'),
      ]);
      setAllTemplates(all);
      const siteArray = Array.isArray(siteList) ? siteList : siteList.data || [];
      setSites(siteArray);

      const assignments = {};
      for (const site of siteArray) {
        try {
          const siteTpls = await apiRequest(`/form-templates/site/${site.id}`);
          assignments[site.id] = siteTpls.map((t) => t.id);
        } catch {
          assignments[site.id] = [];
        }
      }
      setSiteAssignments(assignments);
      setConfigOpen(true);
    } catch {
      notify.error('Failed to load configuration');
    }
  };

  const toggleAssignment = (siteId, templateId) => {
    setSiteAssignments((prev) => {
      const list = prev[siteId] || [];
      const next = list.includes(templateId)
        ? list.filter((id) => id !== templateId)
        : [...list, templateId];
      return { ...prev, [siteId]: next };
    });
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      for (const [siteId, templateIds] of Object.entries(siteAssignments)) {
        await apiRequest(`/form-templates/site/${siteId}/assign`, {
          method: 'POST',
          body: JSON.stringify({ templateIds }),
        });
      }
      notify.success('Template assignments saved');
      setConfigOpen(false);
      loadTemplates();
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setSavingConfig(false);
    }
  };

  // ---------- Render helpers ----------

  const renderTemplateCard = (tpl, isBrowseView = false) => {
    const alreadyInSite = mySiteTemplateIds.has(tpl.id);
    const showEdit = canEdit(tpl) && !isBrowseView;
    const showDelete = canDelete(tpl) && !isBrowseView;
    const showAddToSite = isBrowseView && !alreadyInSite && activeSiteId;
    const showOpen = !isBrowseView || tpl.is_system;
    const showDefault = activeSiteId && (!isBrowseView || alreadyInSite);
    const showVisibilityToggle = activeSiteId && alreadyInSite && !isBrowseView;
    const isHiddenOnSite = tpl.is_visible === false;

    return (
      <Grid size={{ xs: 12, sm: 6, md: 4 }} key={tpl.id}>
        <Card
          variant="outlined"
          sx={{
            height: '100%',
            border: '1px solid',
            borderColor: tpl.is_default ? 'warning.main' : 'divider',
            display: 'flex',
            flexDirection: 'column',
            opacity: isHiddenOnSite ? 0.72 : 1,
            ...(tpl.is_default && {
              boxShadow: '0 0 0 1px rgba(237, 108, 2, 0.3)',
              bgcolor: 'rgba(237, 108, 2, 0.02)',
            }),
            ...(isHiddenOnSite && {
              bgcolor: 'action.hover',
            }),
          }}
        >
          <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%', pb: '12px !important' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {tpl.name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, ml: 1, flexShrink: 0, alignItems: 'center' }}>
                {tpl.is_default && (
                  <Chip label="Default" size="small" color="warning" sx={{ fontSize: '0.65rem', height: 20 }} />
                )}
                {isHiddenOnSite && (
                  <Chip label="Hidden" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                )}
                {tpl.is_system ? (
                  <Chip label="Built-in" size="small" variant="outlined" />
                ) : (
                  <Chip label="Custom" size="small" color="primary" variant="outlined" />
                )}
              </Box>
            </Box>

            <TemplateTypeChip template={tpl} sx={{ mb: 0.75, alignSelf: 'flex-start' }} />

            {isBrowseView && tpl.site_name && (
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                From: {tpl.site_name}
              </Typography>
            )}

            {tpl.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {tpl.description}
              </Typography>
            )}

            {tpl.columns_config ? (
              <ColumnPreview columnsConfig={tpl.columns_config} />
            ) : tpl.is_system ? (
              <Box
                sx={{
                  mt: 1,
                  mb: 1,
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <PreviewIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  Built-in form — standard layout
                </Typography>
              </Box>
            ) : null}

            <Box sx={{ display: 'flex', gap: 1, mt: 'auto', pt: 1, alignItems: 'center' }}>
              {showVisibilityToggle && (
                <Tooltip title={isHiddenOnSite ? 'Show in Crop History / forms' : 'Hide from Crop History / forms'}>
                  <IconButton size="small" onClick={() => handleToggleVisibility(tpl)}>
                    {isHiddenOnSite ? (
                      <VisibilityOffIcon fontSize="small" color="action" />
                    ) : (
                      <VisibilityIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              )}
              {showDefault && (
                <Tooltip title={tpl.is_default ? 'Current default' : 'Set as default'}>
                  <IconButton
                    size="small"
                    onClick={() => !tpl.is_default && handleSetDefault(tpl)}
                    sx={{ color: tpl.is_default ? 'warning.main' : 'action.disabled' }}
                  >
                    {tpl.is_default ? <StarFilledIcon fontSize="small" /> : <StarOutlinedIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Preview">
                <IconButton size="small" onClick={() => setPreviewTemplate(tpl)}>
                  <PreviewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {showOpen && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<OpenIcon />}
                  onClick={() => handleOpenTemplate(tpl)}
                  sx={{ flexGrow: 1 }}
                >
                  Open
                </Button>
              )}
              {!showOpen && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PreviewIcon />}
                  onClick={() => setPreviewTemplate(tpl)}
                  sx={{ flexGrow: 1 }}
                >
                  Preview
                </Button>
              )}
              {showAddToSite && (
                <Button
                  variant="outlined"
                  size="small"
                  color="success"
                  startIcon={<AddIcon />}
                  onClick={() => handleAddToSite(tpl)}
                  disabled={copying === tpl.id}
                >
                  {copying === tpl.id ? 'Adding...' : 'Add to my site'}
                </Button>
              )}
              {isBrowseView && alreadyInSite && (
                <Chip label="In your library" size="small" color="success" variant="outlined" sx={{ alignSelf: 'center' }} />
              )}
              {showEdit && (
                <IconButton size="small" onClick={() => navigate(`/templates/${tpl.id}/edit`)} aria-label="Edit">
                  <EditIcon fontSize="small" />
                </IconButton>
              )}
              {showDelete && (
                <IconButton size="small" color="error" onClick={() => handleDeleteTemplate(tpl)} aria-label="Delete">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          </CardContent>
        </Card>
      </Grid>
    );
  };

  // ---------- Render ----------

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <PageTitle sx={{ mb: 3 }}>Templates</PageTitle>
        <Grid container spacing={3}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Skeleton variant="rounded" height={160} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

  if (!selectedCategory) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 2 }}>
          <PageTitle>Templates</PageTitle>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {isAdmin && (
              <Button variant="outlined" startIcon={<SettingsIcon />} onClick={openConfig}>
                Configure Sites
              </Button>
            )}
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/templates/new')}>
              Create Template
            </Button>
          </Box>
        </Box>

        <Tabs
          value={browseTab}
          onChange={(_, v) => { setBrowseTab(v); setSelectedCategory(null); setBrowseSiteFilter(null); setBrowseSearch(''); }}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab icon={<MySiteIcon />} iconPosition="start" label="My Site" />
          <Tab icon={<BrowseIcon />} iconPosition="start" label="Browse All" />
        </Tabs>

        {browseTab === 1 && (
          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search templates..."
              value={browseSearch}
              onChange={(e) => setBrowseSearch(e.target.value)}
              sx={{ minWidth: 240 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
            <Autocomplete
              size="small"
              options={browseSiteOptions}
              value={browseSiteFilter}
              onChange={(_, v) => setBrowseSiteFilter(v)}
              renderInput={(params) => (
                <TextField {...params} placeholder="Filter by site" />
              )}
              sx={{ minWidth: 220 }}
              clearOnEscape
            />
            {(browseSiteFilter || browseSearch) && (
              <Button
                size="small"
                onClick={() => { setBrowseSiteFilter(null); setBrowseSearch(''); }}
              >
                Clear filters
              </Button>
            )}
          </Box>
        )}

        {browseTab === 0 && !activeSiteId && (
          <InfoNote mode="line" severity="info" sx={{ mb: 3 }}>
            Select a default site in Organization Settings to see site-specific templates.
            Showing all available templates.
          </InfoNote>
        )}

        {categories.length === 0 && browseTab === 0 && (
          <InfoNote mode="line" severity="info">
            No templates are assigned to this site yet. Use "Configure Sites" to assign templates, or create a new one.
          </InfoNote>
        )}

        {categories.length === 0 && browseTab === 1 && (
          <InfoNote mode="line" severity="info">
            {browseSiteFilter || browseSearch
              ? 'No templates match your filters.'
              : 'No custom templates exist yet across any site.'}
          </InfoNote>
        )}

        <Grid container spacing={3}>
          {categories.map((cat) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={cat.key}>
              <Card
                variant="outlined"
                sx={{
                  height: '100%',
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'all 0.2s',
                  '&:hover': { borderColor: cat.color, boxShadow: `0 0 0 1px ${cat.color}20` },
                }}
              >
                <CardActionArea
                  onClick={() => handleCategoryClick(cat)}
                  sx={{ height: '100%', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}
                >
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: 3,
                      bgcolor: `${cat.color}12`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: cat.color,
                      mb: 2,
                    }}
                  >
                    {cat.icon}
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {cat.label}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      {cat.count} {cat.count === 1 ? 'template' : 'templates'}
                    </Typography>
                    {browseTab === 0 && cat.hasDefault && (
                      <StarFilledIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                    )}
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Site config dialog */}
        <Dialog open={configOpen} onClose={() => setConfigOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Configure Templates per Site</DialogTitle>
          <DialogContent>
            {sites.length === 0 ? (
              <InfoNote mode="line" severity="info">No sites found.</InfoNote>
            ) : (
              <TableContainer sx={{ mt: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Template</TableCell>
                      {sites.map((s) => (
                        <TableCell key={s.id} align="center" sx={{ fontWeight: 700 }}>
                          {s.name}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allTemplates.map((tpl) => (
                      <TableRow key={tpl.id}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{tpl.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{CATEGORY_META[tpl.category]?.label || tpl.category}</Typography>
                        </TableCell>
                        {sites.map((s) => (
                          <TableCell key={s.id} align="center">
                            <Checkbox slotProps={{ input: { 'aria-label': 'Select row' } }}
                              checked={(siteAssignments[s.id] || []).includes(tpl.id)}
                              onChange={() => toggleAssignment(s.id, tpl.id)}
                              size="small"
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfigOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={saveConfig} disabled={savingConfig}>
              {savingConfig ? 'Saving...' : 'Save'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Preview dialog */}
        <TemplatePreviewDialog
          template={previewTemplate}
          open={!!previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onOpen={() => { handleOpenTemplate(previewTemplate); setPreviewTemplate(null); }}
          canEdit={previewTemplate ? canEdit(previewTemplate) : false}
          onEdit={() => { navigate(`/templates/${previewTemplate.id}/edit`); setPreviewTemplate(null); }}
          onFullPreview={() => { navigate(`/templates/${previewTemplate.id}/preview`); setPreviewTemplate(null); }}
          activeSiteId={activeSiteId}
          alreadyInSite={previewTemplate ? mySiteTemplateIds.has(previewTemplate.id) : false}
          onAddToSite={handleAddToSite}
          onSetDefault={handleSetDefault}
          adding={previewTemplate ? copying === previewTemplate.id : false}
        />
      </Container>
    );
  }

  // Template list within a category
  const catMeta = CATEGORY_META[selectedCategory.key] || {};
  const catTemplates = selectedCategory.templates || [];
  const isBrowseView = browseTab === 1;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Breadcrumbs separator={<NavNextIcon fontSize="small" />}>
          <Link
            component="button"
            underline="hover"
            color="inherit"
            onClick={() => setSelectedCategory(null)}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            Templates
          </Link>
          {isBrowseView && (
            <Typography color="text.secondary">Browse All</Typography>
          )}
          <Typography color="text.primary" sx={{ fontWeight: 600 }}>
            {catMeta.label || selectedCategory.key}
          </Typography>
        </Breadcrumbs>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => setSelectedCategory(null)} aria-label="Back">
            <BackIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2.5,
                bgcolor: `${catMeta.color || '#666'}12`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: catMeta.color || '#666',
              }}
            >
              {catMeta.icon}
            </Box>
            <Box>
              <Typography variant="h5">
                {catMeta.label || selectedCategory.key}
              </Typography>
              {isBrowseView && (
                <Typography variant="caption" color="text.secondary">
                  Browsing all sites
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
        {!isBrowseView && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate(`/templates/new?category=${selectedCategory.key}`)}
          >
            Create Template
          </Button>
        )}
      </Box>

      {catTemplates.length === 0 && (
        <InfoNote mode="line" severity="info">No templates in this category{isBrowseView ? ' across any site' : ' yet'}.</InfoNote>
      )}

      <Grid container spacing={3}>
        {catTemplates.map((tpl) => renderTemplateCard(tpl, isBrowseView))}
      </Grid>

      {/* Preview dialog */}
      <TemplatePreviewDialog
        template={previewTemplate}
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onOpen={() => { handleOpenTemplate(previewTemplate); setPreviewTemplate(null); }}
        canEdit={previewTemplate ? canEdit(previewTemplate) : false}
        onEdit={() => { navigate(`/templates/${previewTemplate.id}/edit`); setPreviewTemplate(null); }}
        onFullPreview={() => { navigate(`/templates/${previewTemplate.id}/preview`); setPreviewTemplate(null); }}
        activeSiteId={activeSiteId}
        alreadyInSite={previewTemplate ? mySiteTemplateIds.has(previewTemplate.id) : false}
        onAddToSite={handleAddToSite}
        onSetDefault={handleSetDefault}
        adding={previewTemplate ? copying === previewTemplate.id : false}
      />
    </Container>
  );
}
