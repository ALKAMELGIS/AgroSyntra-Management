import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Button,
  Chip,
  Alert,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  Select,
} from '@mui/material';
import {
  ArrowBackOutlined as BackIcon,
  OpenInNewOutlined as OpenIcon,
  ScienceOutlined as ScienceIcon,
  WaterDropOutlined as WaterDropIcon,
  AgricultureOutlined as AgricultureIcon,
  YardOutlined as YardIcon,
  PestControlOutlined as PestIcon,
  DescriptionOutlined as DescriptionIcon,
  SpaOutlined as SpaIcon,
  CloudOutlined as CloudIcon,
  GroupsOutlined as GroupsIcon,
  InfoOutlined as InfoIcon,
  AddOutlined as AddIcon,
  StarOutlined as StarOutlinedIcon,
  Star as StarFilledIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useNotification } from '../contexts/NotificationContext';
import { excelTableSx, GutterCell } from '../components/table/ExcelTable';

const CATEGORY_META = {
  ecph:        { label: 'EC / PH',               icon: <ScienceIcon />,     color: '#1976d2' },
  fertigation: { label: 'Fertigation',            icon: <WaterDropIcon />,   color: '#1f7a4d' },
  harvest:     { label: 'Harvest',                icon: <AgricultureIcon />, color: '#ed6c02' },
  planting:    { label: 'Planting & Transplant',   icon: <YardIcon />,       color: '#9c27b0' },
  pest:        { label: 'Pest Applications',       icon: <PestIcon />,       color: '#d32f2f' },
  scouting:    { label: 'Scouting Reports',        icon: <DescriptionIcon />,color: '#0288d1' },
  biological:  { label: 'Biological Control',      icon: <SpaIcon />,        color: '#388e3c' },
  weather:     { label: 'Weather',                icon: <CloudIcon />,       color: '#5c6bc0' },
  workforce:   { label: 'Workforce',              icon: <GroupsIcon />,      color: '#f57c00' },
};

const SAMPLE_ROWS = 5;

const twoRowHeadSx = {
  '&& thead tr:first-of-type .MuiTableCell-head': { top: 0 },
  '&& thead tr:nth-of-type(2) .MuiTableCell-head': { top: 40 },
};

const calcCellSx = {
  '&&& .MuiTableBody-root .MuiTableCell-root.cell-calc': {
    backgroundColor: 'table.sectionBg',
  },
};

export default function TemplatePreview() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { activeSiteId } = useActiveSite();
  const notify = useNotification();
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isInSite, setIsInSite] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const all = await apiRequest('/form-templates');
        const found = all.find((t) => t.id === templateId);
        setTemplate(found || null);
      } catch {
        setTemplate(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [templateId]);

  useEffect(() => {
    if (!activeSiteId || !templateId) { setIsInSite(false); setIsDefault(false); return; }
    (async () => {
      try {
        const siteTemplates = await apiRequest(`/form-templates/site/${activeSiteId}`);
        const match = siteTemplates.find((t) => t.id === templateId);
        setIsInSite(!!match);
        setIsDefault(!!match?.is_default);
      } catch {
        setIsInSite(false);
        setIsDefault(false);
      }
    })();
  }, [activeSiteId, templateId]);

  const handleAddToSite = async () => {
    if (!activeSiteId) { notify.error('Select an active site first'); return; }
    setActionLoading(true);
    try {
      if (template.is_system) {
        await apiRequest(`/form-templates/site/${activeSiteId}/add`, {
          method: 'POST',
          body: JSON.stringify({ templateId: template.id }),
        });
      } else {
        await apiRequest(`/form-templates/${template.id}/copy`, {
          method: 'POST',
          body: JSON.stringify({ siteId: activeSiteId }),
        });
      }
      notify.success(`"${template.name}" added to your site`);
      setIsInSite(true);
    } catch (err) {
      notify.error(err.message || 'Failed to add template');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetDefault = async () => {
    if (!activeSiteId) { notify.error('Select an active site first'); return; }
    setActionLoading(true);
    try {
      await apiRequest(`/form-templates/site/${activeSiteId}/default`, {
        method: 'PUT',
        body: JSON.stringify({ templateId: template.id, category: template.category }),
      });
      notify.success(`"${template.name}" set as default`);
      setIsDefault(true);
    } catch (err) {
      notify.error(err.message || 'Failed to set default');
    } finally {
      setActionLoading(false);
    }
  };

  const { columns, sections, sectionMap } = useMemo(() => {
    if (!template?.columns_config) return { columns: [], sections: [], sectionMap: {} };
    const cols = template.columns_config.columns || [];
    const secs = template.columns_config.sections || [];
    const map = {};
    secs.forEach((s) => { map[s.key || s._id] = s.label || s.key; });
    return { columns: cols, sections: secs, sectionMap: map };
  }, [template]);

  if (loading) {
    return (
      <Container maxWidth={false} sx={{ py: 4, px: { xs: 2, md: 4 } }}>
        <Skeleton variant="rounded" height={48} sx={{ mb: 2, maxWidth: 600 }} />
        <Skeleton variant="rounded" height={400} />
      </Container>
    );
  }

  if (!template) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">Template not found.</Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/templates')} sx={{ mt: 2 }}>
          Back to Templates
        </Button>
      </Container>
    );
  }

  const catMeta = CATEGORY_META[template.category];
  const hasColumns = columns.length > 0;

  const renderSectionHeaderRow = () => {
    if (sections.length === 0) return null;
    const cells = [<GutterCell key="row-num-sec" />];
    let i = 0;
    while (i < columns.length) {
      const col = columns[i];
      const secKey = col.sectionId || col.section;
      if (secKey && sectionMap[secKey]) {
        let span = 0;
        while (
          i + span < columns.length &&
          (columns[i + span].sectionId || columns[i + span].section) === secKey
        ) {
          span++;
        }
        cells.push(
          <TableCell key={`sec-${secKey}-${i}`} colSpan={span} align="center">
            {sectionMap[secKey]}
          </TableCell>,
        );
        i += span;
      } else {
        cells.push(<TableCell key={`nosec-${i}`} />);
        i++;
      }
    }
    return <TableRow>{cells}</TableRow>;
  };

  const renderColumnHeaderRow = () => (
    <TableRow>
      <GutterCell />
      {columns.map((col, idx) => (
        <TableCell key={col.key || idx}>
          {col.label || col.key || '(unnamed)'}
          {col.required && <span style={{ color: '#d32f2f' }}> *</span>}
          {col.type === 'calculated' && (
            <Chip label="fx" size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.6rem' }} />
          )}
        </TableCell>
      ))}
    </TableRow>
  );

  const renderCellInput = (col, rowIdx) => {
    const baseProps = { size: 'small', fullWidth: true, variant: 'standard' };
    const sx = { '& .MuiInput-input': { fontSize: '0.8rem', py: 0.5 } };

    switch (col.type) {
      case 'number':
        return (
          <TextField
            {...baseProps}
            type="number"
            placeholder="0"
            sx={sx}
            InputProps={{ disableUnderline: true }}
          />
        );
      case 'date':
        return (
          <TextField
            {...baseProps}
            type="date"
            sx={{ ...sx, '& .MuiInput-input': { ...sx['& .MuiInput-input'], color: 'text.secondary' } }}
            InputProps={{ disableUnderline: true }}
          />
        );
      case 'dropdown': {
        const options = typeof col.options === 'string'
          ? col.options.split(',').map((o) => o.trim()).filter(Boolean)
          : Array.isArray(col.options) ? col.options : [];
        return (
          <Select
            size="small"
            fullWidth
            variant="standard"
            displayEmpty
            defaultValue=""
            sx={{ fontSize: '0.8rem' }}
            disableUnderline
          >
            <MenuItem value="" disabled>
              <Typography variant="body2" color="text.disabled">Select...</Typography>
            </MenuItem>
            {options.map((opt, i) => (
              <MenuItem key={i} value={opt} sx={{ fontSize: '0.8rem' }}>{opt}</MenuItem>
            ))}
          </Select>
        );
      }
      case 'calculated':
        return (
          <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            {col.formula ? `=${col.formula}` : '(auto)'}
          </Typography>
        );
      default:
        return (
          <TextField
            {...baseProps}
            placeholder="..."
            sx={sx}
            InputProps={{ disableUnderline: true }}
          />
        );
    }
  };

  const renderSampleRows = () =>
    Array.from({ length: SAMPLE_ROWS }, (_, rowIdx) => (
      <TableRow key={rowIdx} hover>
        <GutterCell index={rowIdx + 1} />
        {columns.map((col, colIdx) => (
          <TableCell
            key={col.key || colIdx}
            className={col.type === 'calculated' ? 'cell-calc' : undefined}
            sx={{ minWidth: col.width || 130, px: 1, py: 0.5 }}
          >
            {renderCellInput(col, rowIdx)}
          </TableCell>
        ))}
      </TableRow>
    ));

  return (
    <Container maxWidth={false} sx={{ py: 3, px: { xs: 2, md: 4 } }}>
      {/* Preview banner */}
      <Alert
        severity="info"
        icon={<InfoIcon />}
        sx={{ mb: 3, alignItems: 'center' }}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {activeSiteId && !isInSite && (
              <Button
                color="success"
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddToSite}
                disabled={actionLoading}
              >
                {actionLoading ? 'Adding...' : 'Add to my site'}
              </Button>
            )}
            {activeSiteId && isInSite && !isDefault && (
              <Button
                color="warning"
                size="small"
                variant="outlined"
                startIcon={<StarOutlinedIcon />}
                onClick={handleSetDefault}
                disabled={actionLoading}
              >
                Mark as Default
              </Button>
            )}
            {activeSiteId && isInSite && isDefault && (
              <Chip label="Default" size="small" color="warning" icon={<StarFilledIcon />} />
            )}
            {template.route_path && (
              <Button
                color="inherit"
                size="small"
                startIcon={<OpenIcon />}
                onClick={() => navigate(template.route_path)}
              >
                Open Form
              </Button>
            )}
            <Button
              color="inherit"
              size="small"
              startIcon={<BackIcon />}
              onClick={() => navigate('/templates')}
            >
              Back
            </Button>
          </Box>
        }
      >
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          Preview Mode — this is a visual mockup. Data entered here will not be saved.
        </Typography>
      </Alert>

      {/* Template header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        {catMeta && (
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: `${catMeta.color}12`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: catMeta.color,
              flexShrink: 0,
            }}
          >
            {catMeta.icon}
          </Box>
        )}
        <Box sx={{ flexGrow: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
            <Typography variant="h5">
              {template.name}
            </Typography>
            {catMeta && (
              <Chip
                label={catMeta.label}
                size="small"
                sx={{ bgcolor: `${catMeta.color}15`, color: catMeta.color, fontWeight: 600, fontSize: '0.7rem' }}
              />
            )}
            {template.is_system ? (
              <Chip label="Built-in" size="small" variant="outlined" />
            ) : (
              <Chip label="Custom" size="small" color="primary" variant="outlined" />
            )}
          </Box>
          {template.description && (
            <Typography variant="body2" color="text.secondary">{template.description}</Typography>
          )}
          {template.site_name && (
            <Typography variant="caption" color="text.secondary">Site: {template.site_name}</Typography>
          )}
        </Box>
        {hasColumns && (
          <Chip
            label={`${columns.length} columns`}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        )}
      </Box>

      {/* Spreadsheet preview or built-in message */}
      {hasColumns ? (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)' }}>
            <Table size="small" sx={[excelTableSx, sections.length > 0 ? twoRowHeadSx : {}, calcCellSx]}>
              <TableHead>
                {renderSectionHeaderRow()}
                {renderColumnHeaderRow()}
              </TableHead>
              <TableBody>
                {renderSampleRows()}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ) : (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            p: 6,
            textAlign: 'center',
          }}
        >
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            Built-in form with standard layout
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            This is a system template with a dedicated entry page. Click below to open the actual form.
          </Typography>
          {template.route_path && (
            <Button
              variant="contained"
              size="large"
              startIcon={<OpenIcon />}
              onClick={() => navigate(template.route_path)}
            >
              Open Form
            </Button>
          )}
        </Box>
      )}
    </Container>
  );
}
