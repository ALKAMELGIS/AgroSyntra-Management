import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, IconButton, Box, useTheme, useMediaQuery, Menu, MenuItem, Avatar, Divider, CircularProgress, Tooltip, Alert } from '@mui/material';
import { useState, useEffect, lazy, Suspense } from 'react';
import { MenuOutlined as MenuIcon, LogoutOutlined as LogoutIcon, DarkModeOutlined as DarkModeIcon, LightModeOutlined as LightModeIcon, SettingsBrightnessOutlined as SystemModeIcon, SearchOutlined as SearchIcon } from '@mui/icons-material';
import './i18n';
import LanguageSwitcher from './components/LanguageSwitcher';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppThemeProvider, useThemeMode } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ActiveSiteProvider } from './contexts/ActiveSiteContext';
import { ActiveSeasonProvider, useActiveSeason } from './contexts/ActiveSeasonContext';
import { isEndedSeason } from './utils/seasonListDates';
import { ActAsOrgProvider } from './contexts/ActAsOrgContext';
import { AppQueryProvider } from './contexts/QueryContext';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import InstallPrompt from './components/InstallPrompt';
import OfflineQueueBanner from './components/OfflineQueueBanner';
import AppUpdateBanner from './components/AppUpdateBanner';
import CommandPalette from './components/CommandPalette';
import NotificationCenter from './components/NotificationCenter';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import NavAreaTabs from './components/NavAreaTabs';
import {
  drawerWidth,
  DEFAULT_NAV_AREA,
  getVisibleNavAreas,
  resolveNavArea,
  getHubPathForArea,
} from './config/navAreas';
import useAppLayout, { APP_BAR_HEIGHT } from './hooks/useAppLayout';
import {
  getRoleLabel, FIELD_STAFF_MANAGER_ROLES, SHEET_RESTORE_ROLES, INTEGRATION_ADMIN_ROLES, SYSTEM_ADMIN_ROLES,
  MANPOWER_COST_VIEW_ROLES,
} from './utils/roleAccess';
import './App.css';
import { initLeafletSafeMode } from './utils/leafletSafe';

initLeafletSafeMode();

// Lazy-loaded page components (code splitting)
const Home = lazy(() => import('./pages/Home'));
const AreaHub = lazy(() => import('./pages/AreaHub'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const MicrosoftCallback = lazy(() => import('./pages/MicrosoftCallback'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const AuditLog = lazy(() => import('./pages/admin/AuditLog'));
const Recovery = lazy(() => import('./pages/admin/Recovery'));
const DataBackup = lazy(() => import('./pages/admin/DataBackup'));
const HistoricalImport = lazy(() => import('./pages/admin/HistoricalImport'));
const CropHistory = lazy(() => import('./pages/admin/CropHistory'));
const SystemHealth = lazy(() => import('./pages/admin/SystemHealth'));
const ApiIntegrations = lazy(() => import('./pages/admin/ApiIntegrations'));
const ECPHEntry = lazy(() => import('./pages/ECPHEntry'));
const HarvestEntry = lazy(() => import('./pages/HarvestEntry'));
const HarvestDashboard = lazy(() => import('./pages/harvest/HarvestDashboard'));
const HarvestReports = lazy(() => import('./pages/HarvestReports'));
const ECPHReports = lazy(() => import('./pages/ECPHReports'));
const FertigationReports = lazy(() => import('./pages/FertigationReports'));
const FertigationEntry = lazy(() => import('./pages/fertigation/FertigationEntry'));
const IrrigationEntry = lazy(() => import('./pages/irrigation/IrrigationEntry'));
const IrrigationDashboard = lazy(() => import('./pages/irrigation/IrrigationDashboard'));
const FertigationDashboard = lazy(() => import('./pages/fertigation/FertigationDashboard'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CountriesSitesManagement = lazy(() => import('./pages/CountriesSitesManagement'));
const FarmAreasCropsManagement = lazy(() => import('./pages/FarmAreasCropsManagement'));
const FieldTypesNamesManagement = lazy(() => import('./pages/FieldTypesNamesManagement'));
const ValvesConfiguration = lazy(() => import('./pages/ValvesConfiguration'));
const RecipesManagement = lazy(() => import('./pages/RecipesManagement'));
const SeasonsManagement = lazy(() => import('./pages/SeasonsManagement'));
const Inventory = lazy(() => import('./pages/Inventory'));
const EfficiencyDashboard = lazy(() => import('./pages/EfficiencyDashboard'));
const WeatherLogEntry = lazy(() => import('./pages/WeatherLogEntry'));
const WeatherMap = lazy(() => import('./pages/WeatherMap'));
const RemoteSensing = lazy(() => import('./pages/RemoteSensing'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Tasks = lazy(() => import('./pages/Tasks'));
const ReportBuilder = lazy(() => import('./pages/ReportBuilder'));
const ShiftSchedule = lazy(() => import('./pages/ShiftSchedule'));
const ManpowerRecord = lazy(() => import('./pages/ManpowerRecord'));
const ManpowerCost = lazy(() => import('./pages/ManpowerCost'));
const ManpowerActivitySheet = lazy(() => import('./pages/ManpowerActivitySheet'));
const ManpowerEntry = lazy(() => import('./pages/ManpowerEntry'));
const ApiKeys = lazy(() => import('./pages/admin/ApiKeys'));
const Webhooks = lazy(() => import('./pages/admin/Webhooks'));
const YieldPredictions = lazy(() => import('./pages/YieldPredictions'));
const OrganizationSettings = lazy(() => import('./pages/admin/OrganizationSettings'));
const PlatformAdmin = lazy(() => import('./pages/admin/PlatformAdmin'));
const GPSTracking = lazy(() => import('./pages/GPSTracking'));
const PesticideApplications = lazy(() => import('./pages/ipm/PesticideApplications'));
const BiologicalControlRecord = lazy(() => import('./pages/ipm/BiologicalControlRecord'));
const BumbleBees = lazy(() => import('./pages/ipm/BumbleBees'));
const ProductCatalog = lazy(() => import('./pages/ipm/ProductCatalog'));
const ScoutingReports = lazy(() => import('./pages/ipm/ScoutingReports'));
const ScoutingReportPrintView = lazy(() => import('./pages/ipm/ScoutingReportPrintView'));
const PestCatalog = lazy(() => import('./pages/ipm/PestCatalog'));
const SprayCalendar = lazy(() => import('./pages/ipm/SprayCalendar'));
const FieldStaffManagement = lazy(() => import('./pages/ipm/FieldStaffManagement'));
const TeamLeaderSprayCalendar = lazy(() => import('./pages/TeamLeaderSprayCalendar'));
const WorkOrderPrintView = lazy(() => import('./pages/ipm/WorkOrderPrintView'));
const PhiAuditLog = lazy(() => import('./pages/ipm/PhiAuditLog'));
const BatchTrace = lazy(() => import('./pages/audit/BatchTrace'));
const ChangeRequests = lazy(() => import('./pages/audit/ChangeRequests'));
const GISMap = lazy(() => import('./pages/GISMap'));
const AgronomicReference = lazy(() => import('./pages/AgronomicReference'));
const DailyBrief = lazy(() => import('./pages/DailyBrief'));
const SummaryContents = lazy(() => import('./pages/SummaryContents'));
const FertigationHarvestCorrelation = lazy(() => import('./pages/FertigationHarvestCorrelation'));
const ScanRedirect = lazy(() => import('./pages/ScanRedirect'));
const FeatureFlags = lazy(() => import('./pages/admin/FeatureFlags'));
const Templates = lazy(() => import('./pages/Templates'));
const TemplateEditor = lazy(() => import('./pages/TemplateEditor'));
const TemplatePreview = lazy(() => import('./pages/TemplatePreview'));
const InternshipModules = lazy(() => import('./pages/internship/InternshipModules'));
const InternshipModule = lazy(() => import('./pages/internship/InternshipModule'));
const InternshipLesson = lazy(() => import('./pages/internship/InternshipLesson'));
const InternshipQuiz = lazy(() => import('./pages/internship/InternshipQuiz'));
const InternshipGrades = lazy(() => import('./pages/internship/InternshipGrades'));
const InternshipProgress = lazy(() => import('./pages/internship/InternshipProgress'));
const InternshipAITutor = lazy(() => import('./pages/internship/InternshipAITutor'));
const TeacherPanel = lazy(() => import('./pages/internship/TeacherPanel'));
const Enrollment = lazy(() => import('./pages/admin/Enrollment'));
const PumpRoom = lazy(() => import('./pages/PumpRoom'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Suspense fallback for lazy-loaded routes
function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
      <CircularProgress />
    </Box>
  );
}

function RouteGuard({ children }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function RoleGuard({ roles, children }) {
  const { user } = useAuth();
  if (roles && roles.length > 0 && !roles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function guarded(Component, roles) {
  if (roles) {
    return <RouteGuard><RoleGuard roles={roles}><Component /></RoleGuard></RouteGuard>;
  }
  return <RouteGuard><Component /></RouteGuard>;
}

const MANAGERS = ['ceo', 'farm_manager', 'operation_manager'];
const NON_PEST = ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'];
/** Manpower Record page: everyone in NON_PEST plus the pest agronomist (read-only). */
const MANPOWER_RECORD_VIEWERS = [...NON_PEST, 'pest_agronomist'];
/** Daily Activity Sheet: data entry worker and operator (server stores it pending). */
const MANPOWER_SUBMITTERS = ['worker', 'operator'];
const INTERN_ALL = ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'intern_teacher', 'intern_student'];
const INTERN_TEACHER = ['ceo', 'farm_manager', 'operation_manager', 'intern_teacher'];
const FIELD_STAFF_MANAGERS = FIELD_STAFF_MANAGER_ROLES;

function SearchBar() {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const openCommandPalette = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  };

  if (isPhone) {
    return (
      <Tooltip title="Search">
        <IconButton size="small" onClick={openCommandPalette} aria-label="Search data" sx={{ color: 'text.secondary' }}>
          <SearchIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Box
      onClick={openCommandPalette}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'background.default',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        px: { sm: 2, md: 3 },
        py: 1.5,
        cursor: 'pointer',
        minWidth: { sm: 200, md: 340 },
        flex: { sm: 1, md: 'none' },
        maxWidth: { sm: 360, md: 420 },
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: 'text.disabled' },
      }}
    >
      <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.disabled', flexGrow: 1, userSelect: 'none' }} noWrap>
        Search Data...
      </Typography>
      <Box
        sx={{
          display: { xs: 'none', sm: 'flex' },
          alignItems: 'center',
          gap: 0.5,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1.5,
          px: 1.5,
          py: 0.25,
        }}
      >
        <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', fontWeight: 500, fontFamily: 'monospace' }}>
          Ctrl K
        </Typography>
      </Box>
    </Box>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { mode, toggleTheme } = useThemeMode();
  const [anchorEl, setAnchorEl] = useState(null);

  const themeIcons = { light: <LightModeIcon sx={{ fontSize: 18 }} />, dark: <DarkModeIcon sx={{ fontSize: 18 }} />, system: <SystemModeIcon sx={{ fontSize: 18 }} /> };
  const themeLabels = { light: 'Light Mode', dark: 'Dark Mode', system: 'System Theme' };

  const handleMenu = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const handleLogout = () => { handleClose(); logout(); };
  const handleTheme = () => { toggleTheme(); };

  if (!user) return null;

  const roleLabels = {
    ceo: 'CEO',
    farm_manager: 'Farm Manager',
    operation_manager: 'Operations Manager',
    agronomist: 'Agronomist',
    pest_agronomist: 'Pest Agronomist',
    scouter: getRoleLabel('scouter'),
    worker: getRoleLabel('worker'),
    operator: 'Operator',
    auditor: 'Auditor',
    intern_student: 'Student',
    intern_teacher: 'Intern Teacher',
  };

  return (
    <>
      <Box
        onClick={handleMenu}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          cursor: 'pointer',
          px: 2,
          py: 1,
          borderRadius: 2,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.8125rem', fontWeight: 600 }}>
          {user.name?.charAt(0)?.toUpperCase() || 'U'}
        </Avatar>
        <Box sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }} noWrap>
            {user.name || 'User'}
          </Typography>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', lineHeight: 1.3 }} noWrap>
            {roleLabels[user.role] || user.role || 'Worker'}
          </Typography>
        </Box>
      </Box>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        slotProps={{ paper: { sx: { minWidth: 200, mt: 1 } } }}
      >
        <MenuItem disabled sx={{ opacity: '1 !important' }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{user.name}</Typography>
            <Typography variant="caption" color="text.secondary">{user.email}</Typography>
          </Box>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleTheme}>
          {themeIcons[mode]}
          <Typography sx={{ ml: 2, fontSize: '0.8125rem' }}>{themeLabels[mode]}</Typography>
        </MenuItem>
        <Box sx={{ px: 2, py: 1 }}>
          <LanguageSwitcher />
        </Box>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <LogoutIcon sx={{ fontSize: 18 }} />
          <Typography sx={{ ml: 2, fontSize: '0.8125rem' }}>Sign out</Typography>
        </MenuItem>
      </Menu>
    </>
  );
}

// Authenticated layout with sidebar
function AuthenticatedLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navArea, setNavArea] = useState(DEFAULT_NAV_AREA);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeSeason, isSeasonReadOnly } = useActiveSeason();
  const themeMUI = useTheme();
  const visibleNavAreas = getVisibleNavAreas(user);
  const showNavTabs = visibleNavAreas.length > 1;
  const { isMobile, topBarHeight, contentPadding, contentMinHeight } = useAppLayout({ showNavTabs });

  useEffect(() => {
    setNavArea((current) => resolveNavArea(location.pathname, user, current));
  }, [location.pathname, user]);

  const handleNavAreaChange = (nextArea) => {
    if (visibleNavAreas.includes(nextArea)) {
      setNavArea(nextArea);
      navigate(getHubPathForArea(nextArea));
    }
  };

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setSidebarOpen(!sidebarOpen);
    }
  };

  const handleMobileClose = () => {
    setMobileOpen(false);
  };

  return (
    <Box sx={{ display: 'flex' }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          width: { md: `calc(100% - ${sidebarOpen ? drawerWidth : 0}px)` },
          ml: { md: `${sidebarOpen ? drawerWidth : 0}px` },
          pt: 'env(safe-area-inset-top, 0px)',
          transition: themeMUI.transitions.create(['width', 'margin'], {
            easing: themeMUI.transitions.easing.sharp,
            duration: themeMUI.transitions.duration.leavingScreen,
          }),
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ minHeight: `${APP_BAR_HEIGHT}px !important`, gap: 1 }}>
          <IconButton
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 1, color: 'text.secondary' }}
            size="small"
          >
            <MenuIcon fontSize="small" />
          </IconButton>

          <SearchBar />

          <Box sx={{ flexGrow: 1 }} />
          <NotificationCenter />
          <UserMenu />
        </Toolbar>

        {showNavTabs && (
          <NavAreaTabs
            value={navArea}
            onChange={handleNavAreaChange}
            visibleAreaIds={visibleNavAreas}
          />
        )}
      </AppBar>

      <Sidebar
        open={sidebarOpen}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
        activeNavArea={navArea}
      />

      {/* Command Palette */}
      <CommandPalette />

      {/* Main Content */}
      <Box
        component="main"
        className="page-content"
        sx={{
          flexGrow: 1,
          p: contentPadding,
          pb: {
            xs: `calc(${themeMUI.spacing(1)} + env(safe-area-inset-bottom, 0px))`,
            sm: `calc(${themeMUI.spacing(2)} + env(safe-area-inset-bottom, 0px))`,
            md: `calc(${themeMUI.spacing(3)} + env(safe-area-inset-bottom, 0px))`,
          },
          width: { md: `calc(100% - ${sidebarOpen ? drawerWidth : 0}px)` },
          transition: themeMUI.transitions.create(['width', 'margin'], {
            easing: themeMUI.transitions.easing.sharp,
            duration: themeMUI.transitions.duration.leavingScreen,
          }),
          mt: `${topBarHeight}px`,
          minHeight: contentMinHeight,
        }}
      >
        {isSeasonReadOnly && activeSeason ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {activeSeason.status === 'reopen_pending'
              ? `${activeSeason.name} is waiting for an auditor to reopen it. You can look at this season, but you cannot record new work until it is approved.`
              : isEndedSeason(activeSeason)
                ? `${activeSeason.name} is closed. You can look and export, but you cannot change rows. Start a new season or request reopen.`
                : `${activeSeason.name} is locked. Request reopen so an auditor can unlock data entry for this year.`}
          </Alert>
        ) : null}
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={guarded(Home)} />
            <Route path="/hub/:areaId" element={guarded(AreaHub)} />
            <Route path="/summary" element={guarded(SummaryContents)} />
            <Route path="/ecph-entry" element={guarded(ECPHEntry, NON_PEST)} />
            <Route path="/harvest-entry" element={<Navigate to="/harvest/entry" replace />} />
            <Route path="/harvest/entry" element={guarded(HarvestEntry, NON_PEST)} />
            <Route path="/harvest/dashboard" element={guarded(HarvestDashboard)} />
            <Route path="/harvest/reports" element={guarded(HarvestReports)} />
            <Route path="/ecph/reports" element={guarded(ECPHReports)} />
            <Route path="/fertigation/reports" element={guarded(FertigationReports)} />
            <Route path="/fertigation/entry" element={guarded(FertigationEntry, NON_PEST)} />
            <Route path="/irrigation/entry" element={guarded(IrrigationEntry, NON_PEST)} />
            <Route path="/irrigation/dashboard" element={guarded(IrrigationDashboard)} />
            <Route path="/fertigation/dashboard" element={guarded(FertigationDashboard)} />
            <Route path="/efficiency-dashboard" element={guarded(EfficiencyDashboard)} />
            <Route path="/weather-log" element={guarded(WeatherLogEntry, NON_PEST)} />
            <Route path="/weather-log/map" element={guarded(WeatherMap)} />
            <Route path="/remote-sensing" element={guarded(RemoteSensing)} />
            <Route path="/dashboard" element={guarded(Dashboard)} />
            <Route path="/manage/countries" element={guarded(CountriesSitesManagement, MANAGERS)} />
            <Route path="/manage/farm-areas" element={guarded(FarmAreasCropsManagement, [...MANAGERS, 'agronomist', 'worker'])} />
            <Route path="/manage/field-types" element={guarded(FieldTypesNamesManagement, [...MANAGERS, 'worker'])} />
            <Route path="/manage/valves" element={guarded(ValvesConfiguration, [...MANAGERS, 'worker'])} />
            <Route path="/manage/recipes" element={guarded(RecipesManagement, [...MANAGERS, 'agronomist', 'worker'])} />
            <Route path="/manage/seasons" element={guarded(SeasonsManagement, MANAGERS)} />
            <Route path="/inventory" element={guarded(Inventory, [...MANAGERS, 'worker'])} />
            <Route path="/admin/users" element={guarded(UserManagement, MANAGERS)} />
            <Route path="/admin/audit" element={guarded(AuditLog, MANAGERS)} />
            <Route path="/admin/recovery" element={guarded(Recovery, SHEET_RESTORE_ROLES)} />
            <Route path="/admin/backup" element={guarded(DataBackup, MANAGERS)} />
            <Route path="/admin/import" element={guarded(HistoricalImport, ['operation_manager', 'worker', 'agronomist'])} />
            <Route path="/admin/crop-history" element={guarded(CropHistory, NON_PEST)} />
            <Route path="/pump-room" element={guarded(PumpRoom, NON_PEST)} />
            <Route path="/templates" element={guarded(Templates)} />
            <Route path="/templates/new" element={guarded(TemplateEditor)} />
            <Route path="/templates/:templateId/edit" element={guarded(TemplateEditor)} />
            <Route path="/templates/:templateId/preview" element={guarded(TemplatePreview)} />
            <Route path="/admin/health" element={guarded(SystemHealth, MANAGERS)} />
            <Route path="/admin/api-integrations" element={guarded(ApiIntegrations, INTEGRATION_ADMIN_ROLES)} />
            <Route path="/notifications" element={guarded(Notifications)} />
            <Route path="/tasks" element={guarded(Tasks, NON_PEST)} />
            <Route path="/report-builder" element={guarded(ReportBuilder)} />
            <Route path="/shift-schedule" element={guarded(ShiftSchedule, NON_PEST)} />
            <Route path="/manpower-record" element={guarded(ManpowerRecord, MANPOWER_RECORD_VIEWERS)} />
            <Route path="/manpower-cost" element={guarded(ManpowerCost, MANPOWER_COST_VIEW_ROLES)} />
            <Route path="/manpower-activity-sheet" element={guarded(ManpowerActivitySheet, MANPOWER_SUBMITTERS)} />
            <Route path="/admin/api-keys" element={guarded(ApiKeys, INTEGRATION_ADMIN_ROLES)} />
            <Route path="/admin/webhooks" element={guarded(Webhooks, INTEGRATION_ADMIN_ROLES)} />
            <Route path="/admin/organization" element={guarded(OrganizationSettings, MANAGERS)} />
            <Route path="/admin/platform" element={guarded(PlatformAdmin)} />
            <Route path="/admin/feature-flags" element={guarded(FeatureFlags, SYSTEM_ADMIN_ROLES)} />
            <Route path="/yield-predictions" element={guarded(YieldPredictions, MANAGERS)} />
            <Route path="/gps-tracking" element={guarded(GPSTracking, NON_PEST)} />
            <Route path="/gis-map" element={guarded(GISMap)} />
            <Route path="/agronomic-reference" element={guarded(AgronomicReference, MANAGERS)} />
            <Route path="/daily-brief" element={guarded(DailyBrief)} />
            <Route path="/fertigation-harvest" element={guarded(FertigationHarvestCorrelation)} />
            <Route path="/scan/:fieldId" element={guarded(ScanRedirect)} />
            <Route path="/ipm/pesticide-applications" element={guarded(PesticideApplications)} />
            <Route path="/ipm/biological-control" element={<Navigate to="/ipm/biological-control-record" replace />} />
            <Route path="/ipm/biological-control-record" element={guarded(BiologicalControlRecord)} />
            <Route path="/ipm/bumble-bees" element={guarded(BumbleBees)} />
            <Route path="/ipm/product-catalog" element={guarded(ProductCatalog)} />
            <Route path="/ipm/scouting-reports" element={guarded(ScoutingReports)} />
            <Route path="/ipm/scouting-reports/:id/print" element={guarded(ScoutingReportPrintView)} />
            <Route path="/ipm/pest-catalog" element={guarded(PestCatalog)} />
            <Route path="/ipm/spray-calendar" element={guarded(SprayCalendar)} />
            <Route path="/ipm/field-staff" element={guarded(FieldStaffManagement, FIELD_STAFF_MANAGERS)} />
            <Route path="/ipm/work-orders/:id/print" element={guarded(WorkOrderPrintView)} />
            <Route path="/audit/batch-trace" element={guarded(BatchTrace)} />
            <Route path="/audit/change-requests" element={guarded(ChangeRequests)} />
            <Route path="/audit/ipm-change-requests" element={<Navigate to="/audit/change-requests" replace />} />
            <Route path="/audit/phi-audit-log" element={guarded(PhiAuditLog)} />
            <Route path="/ipm/phi-audit-log" element={guarded(PhiAuditLog)} />
            <Route path="/internship" element={guarded(InternshipModules, INTERN_ALL)} />
            <Route path="/internship/module/:moduleId" element={guarded(InternshipModule, INTERN_ALL)} />
            <Route path="/internship/lesson/:lessonId" element={guarded(InternshipLesson, INTERN_ALL)} />
            <Route path="/internship/quiz/:quizId" element={guarded(InternshipQuiz, INTERN_ALL)} />
            <Route path="/internship/grades" element={guarded(InternshipGrades, INTERN_ALL)} />
            <Route path="/internship/progress" element={guarded(InternshipProgress, INTERN_ALL)} />
            <Route path="/internship/ai-tutor/:moduleId" element={guarded(InternshipAITutor, INTERN_ALL)} />
            <Route path="/internship/teacher" element={guarded(TeacherPanel, INTERN_TEACHER)} />
            <Route path="/admin/enrollment" element={guarded(Enrollment, MANAGERS)} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Box>
    </Box>
  );
}

function App() {
  return (
    <AppQueryProvider>
      <AppThemeProvider>
        <NotificationProvider>
          <AuthProvider>
            <ActiveSiteProvider>
            <ActiveSeasonProvider>
            <ActAsOrgProvider>
            <BrowserRouter>
            <OfflineBanner />
            <InstallPrompt />
            <AppUpdateBanner />
            <OfflineQueueBanner />
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/auth/microsoft/callback" element={<MicrosoftCallback />} />
                  <Route path="/worker-login" element={<Navigate to="/login?mode=team-leader" replace />} />
                  <Route path="/manpower-entry" element={<ManpowerEntry />} />
                  <Route path="/team-leader/spray-calendar" element={<TeamLeaderSprayCalendar />} />
                
                {/* Protected routes */}
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout />
                    </ProtectedRoute>
                  }
                />
                </Routes>
              </Suspense>
            </ErrorBoundary>
            </BrowserRouter>
            </ActAsOrgProvider>
            </ActiveSeasonProvider>
            </ActiveSiteProvider>
          </AuthProvider>
        </NotificationProvider>
      </AppThemeProvider>
    </AppQueryProvider>
  );
}

export default App;
