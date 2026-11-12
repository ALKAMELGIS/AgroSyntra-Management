import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import FormikSubmitFeedback from '../components/FormikSubmitFeedback';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirmDialog } from '../components/ConfirmDialog';
import {
  Container,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Collapse,
  } from '@mui/material';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { ExpandMoreOutlined as ExpandMore, ExpandLessOutlined as ExpandLess } from '@mui/icons-material';
import { loadMasterData, exportToExcel } from '../utils/masterDataUtils';
import {
  createCountry,
  createSite,
  deleteCountry,
  deleteSite,
  updateCountry,
  updateSite,
} from '../utils/backendApi';
import { apiRequest } from '../utils/api';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../components/table/ExcelTable';
import InfoNote from '../components/InfoNote';
import PageTitle from '../components/PageTitle';
import ExportButton from '../components/ExportButton';
import GisRelationshipConfig from '../components/gis/GisRelationshipConfig';
import { useSearchParams } from 'react-router-dom';
import { Tabs, Tab } from '@mui/material';
import { INTEGRATION_ADMIN_ROLES } from '../utils/roleAccess';

const ZONE_FROZEN_WIDTHS = [220];
const SITE_FROZEN_WIDTHS = [180];

/**
 * Zones & Sites.
 * - CEO: add, rename and delete any zone; add, rename and delete any site.
 * - Farm manager: rename the zones assigned to them; add, rename and delete
 *   sites inside those zones. Everything else is view only.
 * - Other roles: view only.
 * The API enforces the same rules.
 */
function CountriesSitesManagement() {
  const { t } = useTranslation();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [data, setData] = useState({ countries: [], crops: [], fieldTypes: [] });
  const [loading, setLoading] = useState(true);
  const [countryDialog, setCountryDialog] = useState(false);
  const [siteDialog, setSiteDialog] = useState({ open: false, countryId: null });
  const [renameDialog, setRenameDialog] = useState({ open: false, kind: null, id: null, name: '' });
  const [renaming, setRenaming] = useState(false);
  const [expandedCountries, setExpandedCountries] = useState({});
  const [managedZoneIds, setManagedZoneIds] = useState([]);
  // Settings tab: the zones/sites themselves, or the GIS layer configuration that builds them.
  const [searchParams, setSearchParams] = useSearchParams();
  const canConfigureGis = INTEGRATION_ADMIN_ROLES.includes(user?.role);
  const tab = canConfigureGis && searchParams.get('tab') === 'gis' ? 'gis' : 'zones';
  const setTab = (v) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'gis') next.set('tab', 'gis'); else next.delete('tab');
    setSearchParams(next, { replace: true });
  };

  const role = user?.role;
  const isCeo = role === 'ceo';
  const isFarmManager = role === 'farm_manager';

  const countrySchema = useMemo(() => Yup.object().shape({
    name: Yup.string().required(t('zoneAccess.zoneNameRequired')),
    code: Yup.string().required(t('zoneAccess.zoneCodeRequired')).max(10, t('zoneAccess.zoneCodeMax')),
  }), [t]);

  const siteSchema = useMemo(() => Yup.object().shape({
    name: Yup.string().required(t('zoneAccess.siteNameRequired')),
    location: Yup.string().required(t('zoneAccess.locationRequired')),
    totalArea: Yup.number().min(0, t('zoneAccess.totalAreaPositive')).required(t('zoneAccess.totalAreaRequired')),
  }), [t]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    const loaded = await loadMasterData();
    setData(loaded);
    setLoading(false);
  }, []);

  // After a change, also refresh the shared master data (site picker etc.).
  const refreshAll = async () => {
    await refreshData();
    queryClient.invalidateQueries({ queryKey: ['masterData'] });
  };

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!isFarmManager) {
      setManagedZoneIds([]);
      return;
    }
    apiRequest('/assignments/my-access')
      .then((res) => {
        const access = res?.data ?? res;
        setManagedZoneIds(Array.isArray(access?.managedZoneIds) ? access.managedZoneIds : []);
      })
      .catch(() => setManagedZoneIds([]));
  }, [isFarmManager, user?.id]);

  const managedZones = useMemo(() => new Set(managedZoneIds), [managedZoneIds]);
  const canCreateZone = isCeo;
  const canDeleteZone = isCeo;
  const canManageZone = (countryId) => isCeo || (isFarmManager && managedZones.has(countryId));
  const hasAnyAction = isCeo || (isFarmManager && managedZoneIds.length > 0);

  const handleAddCountry = async (values, { resetForm }) => {
    try {
      await createCountry({ name: values.name, code: values.code });
      await refreshAll();
      notify.success(t('zoneAccess.zoneAdded'));
      setCountryDialog(false);
      resetForm();
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleAddSite = async (values, { resetForm }) => {
    try {
      await createSite({
        countryId: siteDialog.countryId,
        name: values.name,
        location: values.location,
        totalArea: values.totalArea,
      });
      await refreshAll();
      notify.success(t('zoneAccess.siteAdded'));
      setSiteDialog({ open: false, countryId: null });
      resetForm();
    } catch (error) {
      notify.error(error.message);
    }
  };

  const openRename = (kind, item) => {
    setRenameDialog({ open: true, kind, id: item.id, name: item.name || '' });
  };

  const closeRename = () => {
    if (renaming) return;
    setRenameDialog({ open: false, kind: null, id: null, name: '' });
  };

  const handleRename = async () => {
    const name = renameDialog.name.trim();
    if (!name) return;
    setRenaming(true);
    try {
      if (renameDialog.kind === 'zone') {
        await updateCountry(renameDialog.id, { name });
        notify.success(t('zoneAccess.zoneRenamed'));
      } else {
        await updateSite(renameDialog.id, { name });
        notify.success(t('zoneAccess.siteRenamed'));
      }
      setRenameDialog({ open: false, kind: null, id: null, name: '' });
      await refreshAll();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteCountry = async (countryId) => {
    if (await confirm(t('zoneAccess.confirmDeleteZone'), { title: t('zoneAccess.deleteZone'), severity: 'error' })) {
      try {
        await deleteCountry(countryId);
        await refreshAll();
        notify.success(t('zoneAccess.zoneDeleted'));
      } catch (error) {
        notify.error(error.message);
      }
    }
  };

  const handleDeleteSite = async (siteId) => {
    if (await confirm(t('zoneAccess.confirmDeleteSite'), { title: t('zoneAccess.deleteSite') })) {
      try {
        await deleteSite(siteId);
        await refreshAll();
        notify.success(t('zoneAccess.siteDeleted'));
      } catch (error) {
        notify.error(error.message);
      }
    }
  };

  const toggleCountryExpansion = (countryId) => {
    setExpandedCountries((prev) => ({
      ...prev,
      [countryId]: !prev[countryId],
    }));
  };

  const handleExport = () => {
    const exportData = data.countries.map((country) => ({
      Zone: country.name,
      Code: country.code,
      'Number of Sites': country.sites.length,
      Sites: country.sites.map((s) => `${s.name} (${s.location})`).join('; '),
    }));
    exportToExcel(exportData, 'Zones_and_Sites');
    notify.success(t('zoneAccess.exported'));
  };

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box>
          <PageTitle sx={{ mb: 3 }}>{t('zoneAccess.title')}</PageTitle>
          <TableSkeleton rows={5} columns={4} />
        </Box>
      </Container>
    );
  }

  let scopeNote = null;
  if (isFarmManager) {
    scopeNote = managedZoneIds.length > 0 ? t('zoneAccess.fmScopeNote') : t('zoneAccess.fmNoZones');
  } else if (!isCeo) {
    scopeNote = t('zoneAccess.viewOnlyNote');
  }

  return (
    <Container maxWidth={tab === 'gis' ? false : 'lg'} disableGutters={tab === 'gis'}>
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: canConfigureGis ? 1.5 : 3, gap: 2, flexWrap: 'wrap' }}>
          <PageTitle>{t('zoneAccess.title')}</PageTitle>
          {tab === 'zones' && <ExportButton label={t('zoneAccess.exportExcel')} onClick={handleExport} />}
        </Box>

        {canConfigureGis && (
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}>
            <Tab value="zones" label="Zones & Sites" />
            <Tab value="gis" label="GIS configuration" />
          </Tabs>
        )}

        {tab === 'gis' ? <GisRelationshipConfig /> : (<>

        {scopeNote ? (
          <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>{scopeNote}</InfoNote>
        ) : null}

        {canCreateZone ? (
          <Box sx={{ mb: 3 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => setCountryDialog(true)}
            >
              {t('zoneAccess.addZone')}
            </Button>
          </Box>
        ) : null}

        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 320px)' }}>
          <Table size="small" sx={[excelTableSx, freezeColumnsSx(ZONE_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell className="col-frozen-0">{t('zoneAccess.zoneName')}</TableCell>
                <TableCell>{t('zoneAccess.code')}</TableCell>
                <TableCell className="col-numeric">{t('zoneAccess.sitesCount')}</TableCell>
                {hasAnyAction ? <TableCell>{t('zoneAccess.actions')}</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.countries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    {t('zoneAccess.noZones')}
                  </TableCell>
                </TableRow>
              ) : (
                data.countries.map((country, idx) => {
                  const manageable = canManageZone(country.id);
                  return (
                    <Fragment key={country.id}>
                      <TableRow hover>
                        <GutterCell index={idx + 1} />
                        <TableCell className="col-frozen-0" title={country.name}>
                          <IconButton
                            size="small"
                            onClick={() => toggleCountryExpansion(country.id)}
                           aria-label={expandedCountries[country.id] ? 'Collapse row' : 'Expand row'}>
                            {expandedCountries[country.id] ? <ExpandLess /> : <ExpandMore />}
                          </IconButton>
                          {country.name}
                        </TableCell>
                        <TableCell>{country.code}</TableCell>
                        <TableCell className="col-numeric">{country.sites.length}</TableCell>
                        {hasAnyAction ? (
                          <TableCell>
                            {manageable ? (
                              <>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  color="primary"
                                  onClick={() => setSiteDialog({ open: true, countryId: country.id })}
                                  sx={{ mr: 1 }}
                                >
                                  {t('zoneAccess.addSite')}
                                </Button>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => openRename('zone', country)}
                                  sx={{ mr: 1 }}
                                >
                                  {t('zoneAccess.rename')}
                                </Button>
                              </>
                            ) : null}
                            {canDeleteZone ? (
                              <Button
                                variant="outlined"
                                size="small"
                                color="error"
                                onClick={() => handleDeleteCountry(country.id)}
                              >
                                {t('zoneAccess.delete')}
                              </Button>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={5} sx={{ py: 0 }}>
                          <Collapse in={expandedCountries[country.id]} timeout="auto" unmountOnExit>
                            <Box sx={{ m: 2 }}>
                              <Typography variant="subtitle2" gutterBottom>
                                {t('zoneAccess.sites')}
                              </Typography>
                              {country.sites.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                  {t('zoneAccess.noSites')}
                                </Typography>
                              ) : (
                                <Table size="small" sx={[excelTableSx, freezeColumnsSx(SITE_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
                                  <TableHead>
                                    <TableRow>
                                      <GutterCell />
                                      <TableCell className="col-frozen-0">{t('zoneAccess.siteName')}</TableCell>
                                      <TableCell>{t('zoneAccess.location')}</TableCell>
                                      <TableCell className="col-numeric">{t('zoneAccess.totalArea')}</TableCell>
                                      {manageable ? <TableCell>{t('zoneAccess.actions')}</TableCell> : null}
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {country.sites.map((site, sIdx) => (
                                      <TableRow key={site.id} hover>
                                        <GutterCell index={sIdx + 1} />
                                        <TableCell className="col-frozen-0" title={site.name}>{site.name}</TableCell>
                                        <TableCell>{site.location}</TableCell>
                                        <TableCell className="col-numeric">{site.totalArea}</TableCell>
                                        {manageable ? (
                                          <TableCell>
                                            <Button
                                              variant="outlined"
                                              size="small"
                                              onClick={() => openRename('site', site)}
                                              sx={{ mr: 1 }}
                                            >
                                              {t('zoneAccess.rename')}
                                            </Button>
                                            <Button
                                              variant="outlined"
                                              size="small"
                                              color="error"
                                              onClick={() => handleDeleteSite(site.id)}
                                            >
                                              {t('zoneAccess.delete')}
                                            </Button>
                                          </TableCell>
                                        ) : null}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        </>)}

        {/* Add Zone Dialog */}
        <Dialog open={countryDialog} onClose={() => setCountryDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{t('zoneAccess.addZone')}</DialogTitle>
          <Formik
            initialValues={{ name: '', code: '' }}
            validationSchema={countrySchema}
            onSubmit={handleAddCountry}
          >
            {({ values, errors, touched, handleChange, handleBlur, resetForm }) => (
              <Form>
                <FormikSubmitFeedback />
                <DialogContent>
                  <Grid container spacing={2}>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        label={t('zoneAccess.zoneName')}
                        name="name"
                        value={values.name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.name && !!errors.name}
                        helperText={touched.name && errors.name}
                      />
                    </Grid>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        label={t('zoneAccess.codeHint')}
                        name="code"
                        value={values.code}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.code && !!errors.code}
                        helperText={touched.code && errors.code}
                      />
                    </Grid>
                  </Grid>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => { setCountryDialog(false); resetForm(); }}>
                    {t('zoneAccess.cancel')}
                  </Button>
                  <Button type="submit" variant="contained" color="primary">
                    {t('zoneAccess.addZone')}
                  </Button>
                </DialogActions>
              </Form>
            )}
          </Formik>
        </Dialog>

        {/* Add Site Dialog */}
        <Dialog open={siteDialog.open} onClose={() => setSiteDialog({ open: false, countryId: null })} maxWidth="sm" fullWidth>
          <DialogTitle>{t('zoneAccess.addSite')}</DialogTitle>
          <Formik
            initialValues={{ name: '', location: '', totalArea: '' }}
            validationSchema={siteSchema}
            onSubmit={handleAddSite}
          >
            {({ values, errors, touched, handleChange, handleBlur, resetForm }) => (
              <Form>
                <FormikSubmitFeedback />
                <DialogContent>
                  <Grid container spacing={2}>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        label={t('zoneAccess.siteName')}
                        name="name"
                        value={values.name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.name && !!errors.name}
                        helperText={touched.name && errors.name}
                      />
                    </Grid>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        label={t('zoneAccess.location')}
                        name="location"
                        value={values.location}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.location && !!errors.location}
                        helperText={touched.location && errors.location}
                      />
                    </Grid>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        type="number"
                        label={t('zoneAccess.totalArea')}
                        name="totalArea"
                        value={values.totalArea}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.totalArea && !!errors.totalArea}
                        helperText={touched.totalArea && errors.totalArea}
                        inputProps={{ min: 0, step: 0.01 }}
                      />
                    </Grid>
                  </Grid>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => { setSiteDialog({ open: false, countryId: null }); resetForm(); }}>
                    {t('zoneAccess.cancel')}
                  </Button>
                  <Button type="submit" variant="contained" color="primary">
                    {t('zoneAccess.addSite')}
                  </Button>
                </DialogActions>
              </Form>
            )}
          </Formik>
        </Dialog>

        {/* Rename Zone / Site Dialog */}
        <Dialog open={renameDialog.open} onClose={closeRename} maxWidth="sm" fullWidth>
          <DialogTitle>
            {renameDialog.kind === 'zone' ? t('zoneAccess.renameZone') : t('zoneAccess.renameSite')}
          </DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              autoFocus
              sx={{ mt: 1 }}
              label={renameDialog.kind === 'zone' ? t('zoneAccess.zoneName') : t('zoneAccess.siteName')}
              value={renameDialog.name}
              onChange={(e) => setRenameDialog((prev) => ({ ...prev, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
              error={!renameDialog.name.trim()}
              helperText={!renameDialog.name.trim() ? t('zoneAccess.nameRequired') : ' '}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeRename} disabled={renaming}>{t('zoneAccess.cancel')}</Button>
            <Button
              variant="contained"
              onClick={handleRename}
              disabled={renaming || !renameDialog.name.trim()}
            >
              {t('zoneAccess.save')}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
      {confirmDialog}
    </Container>
  );
}

export default CountriesSitesManagement;
