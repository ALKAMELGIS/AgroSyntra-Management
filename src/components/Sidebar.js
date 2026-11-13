import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  useTheme,
  useMediaQuery,
  TextField,
  MenuItem,
  Badge,
  Chip,
  Tooltip,
  CircularProgress,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ButtonBase,
  Collapse,
} from '@mui/material';
import {
  HomeOutlined as HomeIcon,
  ScienceOutlined as ScienceIcon,
  WaterDropOutlined as WaterDropIcon,
  DashboardOutlined as DashboardIcon,
  SettingsOutlined as SettingsIcon,
  AgricultureOutlined as AgricultureIcon,
  AssessmentOutlined as AssessmentIcon,
  DescriptionOutlined as DescriptionIcon,
  LocationOnOutlined as LocationIcon,
  ParkOutlined as ParkIcon,
  LabelOutlined as LabelIcon,
  SettingsInputComponentOutlined as ValvesIcon,
  CloudOutlined as WeatherIcon,
  MapOutlined as MapIcon,
  SatelliteAltOutlined as RemoteSensingIcon,
  AdminPanelSettingsOutlined as AdminIcon,
  GroupOutlined as UsersIcon,
  HistoryOutlined as HistoryIcon,
  AssignmentOutlined as TaskIcon,
  PestControlOutlined as BugReportIcon,
  GpsFixedOutlined as GpsIcon,
  GroupsOutlined as ManpowerIcon,
  EditNoteOutlined as DataEntryIcon,
  Inventory2Outlined as InventoryIcon,
  CalendarMonthOutlined as CalendarIcon,
  YardOutlined as SpaIcon,
  TrendingUpOutlined as TrendingUpIcon,
  SpaOutlined as EcoIcon,
  ViewListOutlined as TemplatesIcon,
  SchoolOutlined as SchoolIcon,
  ElectricBoltOutlined as ElectricBoltIcon,
  SearchOutlined as TraceIcon,
  EditNoteOutlined as ChangeRequestIcon,
  EventNoteOutlined as ActivitySheetIcon,
  ChevronRightRounded as ChevronIcon,
  AutoAwesomeOutlined as AssistantIcon,
  LogoutOutlined as LogoutIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import { useActAsOrg } from '../contexts/ActAsOrgContext';
import { drawerWidth, getSidebarSections } from '../config/navAreas';
import SiteZoneSelect from './SiteZoneSelect';
import { INSIGHT_PATHS } from './InsightsMenu';
import usePhiAuditBadgeCount from '../hooks/usePhiAuditBadgeCount';
import useOperatorWorkOrderBadgeCount from '../hooks/useOperatorWorkOrderBadgeCount';
import useChangeRequestBadgeCount from '../hooks/useChangeRequestBadgeCount';
import useManpowerApprovalBadgeCount from '../hooks/useManpowerApprovalBadgeCount';
import useOrganizationLogo from '../hooks/useOrganizationLogo';
import { canUploadOrgLogo, uploadOrganizationLogo } from '../utils/organizationLogo';
import { useNotification } from '../contexts/NotificationContext';
import { canManageSeasons } from '../utils/roleAccess';
import { apiRequest } from '../utils/api';
import { isSeasonLocked, farmTodayYmd, toSeasonYmd } from '../utils/seasonListDates';
import { useShellLabel } from '../i18n/shellLabels';
import InfoNote from './InfoNote';

const PATH_ICONS = {
  '/': HomeIcon,
  '/summary': DescriptionIcon,
  '/daily-brief': AssessmentIcon,
  '/assistant': AssistantIcon,
  '/dashboard': DashboardIcon,
  '/templates': TemplatesIcon,
  '/ecph-entry': ScienceIcon,
  '/fertigation/entry': WaterDropIcon,
  '/irrigation/entry': WaterDropIcon,
  '/harvest/entry': AgricultureIcon,
  '/admin/crop-history': HistoryIcon,
  '/pump-room': ElectricBoltIcon,
  '/harvest/dashboard': AgricultureIcon,
  '/fertigation/dashboard': WaterDropIcon,
  '/efficiency-dashboard': TrendingUpIcon,
  '/fertigation-harvest': AssessmentIcon,
  '/ecph/reports': ScienceIcon,
  '/fertigation/reports': WaterDropIcon,
  '/harvest/reports': AgricultureIcon,
  '/report-builder': DescriptionIcon,
  '/weather-log': WeatherIcon,
  '/weather-log/map': MapIcon,
  '/remote-sensing': RemoteSensingIcon,
  '/gps-tracking': GpsIcon,
  '/gis-map': MapIcon,
  '/audit/batch-trace': TraceIcon,
  '/audit/phi-audit-log': HistoryIcon,
  '/audit/change-requests': ChangeRequestIcon,
  '/ipm/pesticide-applications': BugReportIcon,
  '/ipm/biological-control-record': SpaIcon,
  '/ipm/bumble-bees': EcoIcon,
  '/ipm/product-catalog': InventoryIcon,
  '/ipm/scouting-reports': DescriptionIcon,
  '/ipm/pest-catalog': BugReportIcon,
  '/ipm/spray-calendar': CalendarIcon,
  '/tasks': TaskIcon,
  '/shift-schedule': HistoryIcon,
  '/manpower-record': ManpowerIcon,
  '/manpower-activity-sheet': ActivitySheetIcon,
  '/manage/countries': LocationIcon,
  '/manage/farm-areas': ParkIcon,
  '/manage/field-types': LabelIcon,
  '/manage/valves': ValvesIcon,
  '/manage/recipes': DescriptionIcon,
  '/manage/seasons': CalendarIcon,
  '/inventory': InventoryIcon,
  '/yield-predictions': AgricultureIcon,
  '/agronomic-reference': ScienceIcon,
  '/admin/api-integrations': SettingsIcon,
  '/admin/integrations/john-deere': SettingsIcon,
  '/internship': SchoolIcon,
  '/internship/grades': AssessmentIcon,
  '/admin/users': UsersIcon,
  '/admin/audit': HistoryIcon,
  '/admin/recovery': HistoryIcon,
  '/admin/backup': SettingsIcon,
  '/admin/import': DataEntryIcon,
  '/admin/health': DashboardIcon,
  '/admin/api-keys': SettingsIcon,
  '/admin/webhooks': SettingsIcon,
  '/admin/feature-flags': SettingsIcon,
  '/admin/organization': AdminIcon,
  '/admin/platform': AdminIcon,
  '/admin/enrollment': SchoolIcon,
};

const END_SEASON_CONFIRM = 'END SEASON';

function Sidebar({ open, mobileOpen, onMobileClose, activeNavArea }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const isDesktop = !isMobile;
  const L = useShellLabel();
  const { user, logout } = useAuth();
  const notify = useNotification();
  const { logoUrl, refresh: refreshLogo } = useOrganizationLogo();
  const logoInputRef = useRef(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const canUploadLogo = canUploadOrgLogo(user?.role);
  const canEndSeason = canManageSeasons(user);
  const [endSeasonOpen, setEndSeasonOpen] = useState(false);
  const [endConfirm, setEndConfirm] = useState('');
  const [endDate, setEndDate] = useState(() => farmTodayYmd());
  const [endingSeason, setEndingSeason] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [requestingReopen, setRequestingReopen] = useState(false);
  const { activeSiteId, setActiveSiteId, countries, allowAllSites, hasSiteAssignment } = useActiveSite();
  const { activeSeasonId, activeSeason, setActiveSeasonId, seasons, isLoaded: seasonLoaded, reloadSeasons } = useActiveSeason();
  const {
    isSuperAdmin,
    actAsOrgId,
    homeOrg,
    activeOrg,
    organizations,
    isActingAsOrg,
    setActAsOrg,
  } = useActAsOrg();

  const handleEndSeason = async () => {
    if (!activeSeasonId || endConfirm !== END_SEASON_CONFIRM) return;
    const startDate = toSeasonYmd(activeSeason?.start_date ?? activeSeason?.startDate);
    const today = farmTodayYmd();
    if (!endDate || (startDate && endDate < startDate) || endDate > today) return;
    setEndingSeason(true);
    try {
      const result = await apiRequest(`/seasons/${activeSeasonId}/close`, {
        method: 'POST',
        body: JSON.stringify({ confirmation: END_SEASON_CONFIRM, endDate }),
      });
      reloadSeasons();
      setEndSeasonOpen(false);
      setEndConfirm('');
      notify.success(`${result?.closed?.name || 'Season'} closed.`);
    } catch (err) {
      notify.error(err.message || 'Could not end the season');
    } finally {
      setEndingSeason(false);
    }
  };

  const handleRequestReopen = async () => {
    if (!activeSeasonId || !reopenReason.trim()) return;
    setRequestingReopen(true);
    try {
      await apiRequest(`/seasons/${activeSeasonId}/reopen-request`, {
        method: 'POST',
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      reloadSeasons();
      setReopenOpen(false);
      setReopenReason('');
      notify.success('Reopen requested. An auditor will review it.');
    } catch (err) {
      notify.error(err.message || 'Could not request a reopen');
    } finally {
      setRequestingReopen(false);
    }
  };

  const seasonStartDate = toSeasonYmd(activeSeason?.start_date ?? activeSeason?.startDate);
  const farmToday = farmTodayYmd();
  const endDateBackdated = Boolean(endDate && endDate < farmToday);
  const endDateInvalid = !endDate
    || (seasonStartDate && endDate < seasonStartDate)
    || endDate > farmToday;

  // Summary & Contents and Daily Brief live behind the top-bar "?" menu.
  const sections = getSidebarSections(user, activeNavArea)
    .map((section) => ({ ...section, items: section.items.filter((item) => !INSIGHT_PATHS.has(item.path)) }))
    .filter((section) => section.items.length > 0);
  const phiAuditBadgeCount = usePhiAuditBadgeCount();
  const changeRequestBadgeCount = useChangeRequestBadgeCount();
  const manpowerApprovalBadgeCount = useManpowerApprovalBadgeCount();
  const operatorWorkOrderCount = useOperatorWorkOrderBadgeCount();

  const pathToBadge = {
    '/ipm/pesticide-applications': { count: operatorWorkOrderCount, color: 'error' },
    '/audit/phi-audit-log': { count: phiAuditBadgeCount, color: 'error' },
    '/audit/change-requests': { count: changeRequestBadgeCount, color: 'success' },
    '/manpower-record': { count: manpowerApprovalBadgeCount, color: 'success' },
  };

  const handleNavigation = (path) => {
    navigate(path);
    if (isMobile) onMobileClose();
  };

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const sectionHasActive = (items) => items.some((item) => isActive(item.path));

  // Section groups fold like the reference sidebar; the open/closed choice is remembered per browser.
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('agrocloud_nav_collapsed') || '{}') || {}; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem('agrocloud_nav_collapsed', JSON.stringify(collapsed)); } catch { /* private mode */ }
  }, [collapsed]);
  const toggleSection = (label) => setCollapsed((c) => ({ ...c, [label]: !c[label] }));
  const openSearch = () => {
    if (isMobile) onMobileClose();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      <Box sx={{ px: 4, height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2.5 }}>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setLogoUploading(true);
            try {
              await uploadOrganizationLogo(file);
              await refreshLogo();
              notify.success('Organization logo updated');
            } catch (err) {
              notify.error(err.message || 'Could not upload logo');
            } finally {
              setLogoUploading(false);
            }
          }}
        />
        <Tooltip title="Upload organization logo" disableHoverListener={!canUploadLogo}>
          <Box
            onClick={canUploadLogo && !logoUploading ? () => logoInputRef.current?.click() : undefined}
            role={canUploadLogo ? 'button' : undefined}
            aria-label={canUploadLogo ? 'Upload organization logo' : undefined}
            sx={{
              width: 34,
              height: 34,
              borderRadius: 1.25,
              bgcolor: logoUrl && !logoUploading ? 'transparent' : 'primary.main',
              backgroundImage: logoUrl && !logoUploading ? 'none' : (t) => `linear-gradient(145deg, ${t.palette.primary.light}, ${t.palette.primary.dark})`,
              boxShadow: (t) => `inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px ${t.palette.mode === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(22,92,58,0.25)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
              overflow: 'hidden',
              cursor: canUploadLogo ? 'pointer' : 'default',
            }}
          >
            {logoUploading ? (
              <CircularProgress size={18} sx={{ color: 'white' }} />
            ) : logoUrl ? (
              <Box
                component="img"
                src={logoUrl}
                alt="Organization logo"
                sx={{ width: 34, height: 34, objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <EcoIcon sx={{ fontSize: 20 }} />
            )}
          </Box>
        </Tooltip>
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', color: 'text.primary', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
            {L('Al Maha Farm')}
          </Typography>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', lineHeight: 1.35 }}>
            {L('Elite Agro Cloud')}
          </Typography>
        </Box>
      </Box>

      <Divider />

      {isSuperAdmin && (
        <Box sx={{ px: 4, pt: 4, pb: 1 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="Organization"
            value={actAsOrgId || ''}
            onChange={(e) => setActAsOrg(e.target.value || null)}
            sx={{
              '& .MuiOutlinedInput-root': { bgcolor: 'background.muted' },
              '& .MuiSelect-select': { py: 1, fontSize: '0.8125rem', fontWeight: 600 },
            }}
          >
            <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>
              {homeOrg?.name ? `My org: ${homeOrg.name}` : 'My organization'}
            </MenuItem>
            {organizations
              .filter((o) => o.id !== user?.organizationId)
              .map((org) => (
                <MenuItem key={org.id} value={org.id} sx={{ fontSize: '0.8125rem' }}>
                  {org.name}
                </MenuItem>
              ))}
          </TextField>
          {isActingAsOrg && activeOrg?.name && (
            <Chip
              size="small"
              color="warning"
              label={`Viewing: ${activeOrg.name}`}
              sx={{ mt: 1, width: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
            />
          )}
        </Box>
      )}

      {(countries || []).some((c) => c.sites?.length) || !hasSiteAssignment ? (
        <Box sx={{ px: 3, pt: 3, pb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
          <SiteZoneSelect
            countries={countries}
            value={activeSiteId}
            onChange={setActiveSiteId}
            allowAllSites={allowAllSites}
            noAssignmentMessage={!hasSiteAssignment ? 'No site assigned — contact your manager.' : undefined}
          />
          {activeSiteId ? (
            <>
            <Typography component="span" sx={{ display: 'block', fontSize: '0.6875rem', color: 'text.secondary', mt: 1.5, mb: 0.5, px: 0.25 }}>
              Season
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              value={seasonLoaded ? (activeSeasonId || '') : ''}
              onChange={(e) => setActiveSeasonId(e.target.value)}
              disabled={!seasonLoaded || seasons.length === 0}
              SelectProps={{ inputProps: { 'aria-label': 'Season' } }}
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: 'background.muted', height: 36, borderRadius: 1.25 },
                '& .MuiSelect-select': { py: 0.75, fontSize: '0.8125rem', fontWeight: 600 },
              }}
            >
              {seasons.length === 0 ? (
                <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>
                  {seasonLoaded ? 'No seasons' : 'Loading…'}
                </MenuItem>
              ) : seasons.map((season) => (
                <MenuItem key={season.id} value={season.id} sx={{ fontSize: '0.8125rem' }}>
                  {season.name}
                  {season.status && season.status !== 'open' ? ` (${String(season.status).replace(/_/g, ' ')})` : ''}
                </MenuItem>
              ))}
            </TextField>
            {seasonLoaded && canEndSeason && !seasons.some((season) => season.status === 'open') ? (
              <Button
                size="small"
                variant="text"
                fullWidth
                sx={{ mt: 0.5, fontSize: '0.75rem', fontWeight: 600 }}
                onClick={() => navigate('/manage/seasons')}
              >
                Start a season
              </Button>
            ) : null}
            {seasonLoaded && seasons.length === 0 && !canEndSeason ? (
              <Button
                size="small"
                variant="text"
                fullWidth
                sx={{ mt: 0.5, fontSize: '0.75rem', fontWeight: 600 }}
                onClick={() => navigate('/manage/seasons')}
              >
                Open Seasons
              </Button>
            ) : null}
            </>
          ) : null}
          {activeSiteId && canEndSeason && activeSeason?.status === 'open' ? (
            <Button
              size="small"
              color="warning"
              variant="outlined"
              fullWidth
              sx={{ mt: 1.5, fontSize: '0.75rem', fontWeight: 600 }}
              onClick={() => {
                setEndConfirm('');
                setEndDate(farmTodayYmd());
                setEndSeasonOpen(true);
              }}
            >
              End season
            </Button>
          ) : null}
          {activeSiteId && canEndSeason && activeSeason?.status === 'closed' && isSeasonLocked(activeSeason) ? (
            <Button
              size="small"
              color="primary"
              variant="outlined"
              fullWidth
              sx={{ mt: 1.5, fontSize: '0.75rem', fontWeight: 600 }}
              onClick={() => { setReopenReason(''); setReopenOpen(true); }}
            >
              Request reopen
            </Button>
          ) : null}
          {activeSiteId && activeSeason?.status === 'reopen_pending' ? (
            <Chip
              size="small"
              color="warning"
              label="Reopen requested"
              sx={{ mt: 1.5, width: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
            />
          ) : null}
        </Box>
      ) : null}

      <Box component="nav" aria-label="Main navigation" sx={{ flexGrow: 1, overflow: 'auto', pt: 2.5, pb: 3, px: 3, overscrollBehavior: 'contain', scrollbarWidth: 'thin' }}>
        <ListItemButton
          onClick={openSearch}
          sx={{ minHeight: 34, borderRadius: 1.5, px: 2.5, py: 1.5, mb: 2, gap: 2.5, color: 'text.secondary', border: '1px solid', borderColor: 'divider' }}
        >
          <TraceIcon sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: '0.8125rem', flex: 1 }}>{L('Search')}</Typography>
          <Box component="kbd" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', px: 1.25, py: 0.25, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', color: 'text.secondary', direction: 'ltr' }}>Ctrl K</Box>
        </ListItemButton>
        {sections.map((section) => {
          const hasActive = sectionHasActive(section.items);
          const isOpen = hasActive || !collapsed[section.label];

          return (
            <Box key={section.label} sx={{ mb: 2.5 }}>
              <ButtonBase
                onClick={() => toggleSection(section.label)}
                aria-expanded={isOpen}
                disabled={hasActive}
                sx={{ width: '100%', justifyContent: 'flex-start', gap: 1, px: 2.5, py: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
              >
                <Typography
                  component="span"
                  sx={{
                    flex: 1,
                    textAlign: 'start',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    letterSpacing: 0,
                    color: hasActive ? 'text.primary' : 'text.secondary',
                  }}
                >
                  {L(section.label)}
                </Typography>
                {!hasActive && (
                  <ChevronIcon sx={{ fontSize: 16, color: 'text.secondary', transition: 'transform 200ms', transform: isOpen ? 'rotate(90deg)' : (theme.direction === 'rtl' ? 'rotate(180deg)' : 'none') }} />
                )}
              </ButtonBase>
              <Collapse in={isOpen} timeout={200}>
              <List disablePadding sx={{ mt: 0.5 }}>
                {section.items.map((item) => {
                  const ItemIcon = PATH_ICONS[item.path] || DashboardIcon;
                  const badge = pathToBadge[item.path];
                  return (
                    <SidebarItem
                      key={item.path}
                      item={{ ...item, text: L(item.text), icon: <ItemIcon /> }}
                      active={isActive(item.path)}
                      onNavigate={handleNavigation}
                      badgeCount={badge?.count ?? 0}
                      badgeColor={badge?.color ?? 'error'}
                    />
                  );
                })}
              </List>
              </Collapse>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <ListItemButton onClick={() => logout && logout()} sx={{ minHeight: 34, borderRadius: 1.5, px: 2.5, py: 1.5, gap: 2.5, color: 'text.secondary' }}>
          <LogoutIcon sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: '0.8125rem' }}>{L('Sign out')}</Typography>
        </ListItemButton>
      </Box>
    </Box>
  );

  // Only the drawer for the current screen size is rendered (the menu used to be
  // built twice — phone drawer and desktop panel — on every device). The phone
  // drawer builds its contents when first opened.
  return (
    <>
      {!isDesktop && (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: false }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
        }}
      >
        {drawerContent}
      </Drawer>
      )}

      {isDesktop && (
      <Drawer
        variant="persistent"
        open={open}
        sx={{
          display: { xs: 'none', md: 'block' },
          width: open ? drawerWidth : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            transition: theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            ...(!open && {
              overflowX: 'hidden',
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
              width: 0,
            }),
          },
        }}
      >
        {drawerContent}
      </Drawer>
      )}

      <Dialog open={endSeasonOpen} onClose={() => !endingSeason && setEndSeasonOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>End {activeSeason?.name || 'this season'}?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This closes the year for the whole site. Everything still growing is uprooted with
            reason &quot;Season closed&quot;. Harvest, sprays, irrigation and manpower stay. Nothing is deleted.
            The year stays on screen until you start a new season. If you start a new year by
            mistake, you cannot reopen this one until you end the new year first.
          </Alert>
          <TextField
            label="End date"
            type="date"
            size="small"
            fullWidth
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: seasonStartDate || undefined, max: farmToday }}
            helperText="Keep today, or pick an earlier last day. This date is stored on the year and used to uproot what is still growing."
            sx={{ mb: 2 }}
          />
          {endDateBackdated ? (
            <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
              Harvest, sprays and other records after {endDate} stay in the app, but this
              year will no longer cover those days in the sidebar range.
            </InfoNote>
          ) : null}
          <Typography variant="body2" sx={{ mb: 1 }}>
            Type <strong>{END_SEASON_CONFIRM}</strong> to confirm.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={endConfirm}
            onChange={(e) => setEndConfirm(e.target.value)}
            placeholder={END_SEASON_CONFIRM}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEndSeasonOpen(false)} disabled={endingSeason}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleEndSeason}
            disabled={endingSeason || endConfirm !== END_SEASON_CONFIRM || endDateInvalid}
          >
            {endingSeason ? 'Ending…' : 'End season'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={reopenOpen} onClose={() => !requestingReopen && setReopenOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request reopen of {activeSeason?.name || 'this season'}?</DialogTitle>
        <DialogContent>
          <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
            An auditor must approve this. Only plantings uprooted as &quot;Season closed&quot; come back.
            Cycle uproots stay finished. Writes stay blocked until the auditor approves.
          </InfoNote>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label="Reason"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReopenOpen(false)} disabled={requestingReopen}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRequestReopen}
            disabled={requestingReopen || !reopenReason.trim()}
          >
            {requestingReopen ? 'Submitting…' : 'Request reopen'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function SidebarItem({ item, active, onNavigate, badgeCount = 0, badgeColor = 'error' }) {
  return (
    <ListItem disablePadding sx={{ mb: 0.25 }}>
      <ListItemButton
        onClick={() => onNavigate(item.path)}
        selected={active}
        aria-current={active ? 'page' : undefined}
        sx={{
          position: 'relative',
          minHeight: 34,
          borderRadius: 1.5,
          px: 2.5,
          py: 1.5,
          gap: 0.5,
          '&.Mui-selected': {
            bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(76,178,126,0.12)' : 'rgba(31,122,77,0.07)'),
          },
          '&.Mui-selected:hover': {
            bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(76,178,126,0.18)' : 'rgba(31,122,77,0.11)'),
          },
          '&::before': {
            content: '""',
            position: 'absolute',
            left: -12,
            top: 9,
            bottom: 9,
            width: 3,
            borderRadius: '0 3px 3px 0',
            bgcolor: 'primary.main',
            opacity: active ? 1 : 0,
            transform: active ? 'scaleY(1)' : 'scaleY(0.4)',
            transition: 'opacity 200ms ease, transform 200ms ease',
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: 28,
            '& .MuiSvgIcon-root': {
              fontSize: 17,
              color: active ? 'primary.main' : 'text.secondary',
              transition: 'color 160ms ease',
            },
          }}
        >
          {badgeCount > 0 ? (
            <Badge badgeContent={badgeCount} color={badgeColor} max={99}>
              {item.icon}
            </Badge>
          ) : (
            item.icon
          )}
        </ListItemIcon>
        <ListItemText
          primary={item.text}
          primaryTypographyProps={{
            fontSize: '0.8125rem',
            fontWeight: active ? 600 : 450,
            color: active ? 'text.primary' : 'text.secondary',
            letterSpacing: '-0.005em',
            // Long names (common in Arabic) wrap to a second line instead of being cut off.
            sx: {
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            },
          }}
          sx={{ my: 0 }}
        />
      </ListItemButton>
    </ListItem>
  );
}

export default Sidebar;
export { drawerWidth };
