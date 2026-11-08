import { useMemo, useEffect, useState } from 'react';
import { readRecentPages, RECENT_PAGES_EVENT } from '../utils/recentPages';
import { getSidebarSections, AREA_SECTIONS } from '../config/navAreas';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import HubTileGrid from '../components/HubTileGrid';
import {
  DashboardOutlined as DashboardIcon,
  AssessmentOutlined as AssessmentIcon,
  MapOutlined as MapIcon,
  NotificationsOutlined as NotificationsIcon,
  ScienceOutlined as ScienceIcon,
  WaterDropOutlined as WaterDropIcon,
  AgricultureOutlined as AgricultureIcon,
  DescriptionOutlined as DescriptionIcon,
  BugReportOutlined as BugReportIcon,
  CalendarMonthOutlined as CalendarIcon,
  SpaOutlined as SpaIcon,
  TrendingUpOutlined as TrendingUpIcon,
  LabelOutlined as LabelIcon,
  ParkOutlined as ParkIcon,
  PeopleOutlined as PeopleIcon,
  InventoryOutlined as InventoryIcon,
  AssignmentOutlined as TaskIcon,
  HistoryOutlined as HistoryIcon,
  GroupsOutlined as ManpowerIcon,
  MenuBookOutlined as MenuBookIcon,
} from '@mui/icons-material';

const MANAGERS = ['ceo', 'farm_manager', 'operation_manager'];

const SECTIONS = [
  {
    title: 'Core',
    tiles: [
      { label: 'Summary & Contents', path: '/summary', icon: MenuBookIcon, color: '#5d4037', bg: 'rgba(93,64,55,0.1)' },
      { label: 'Analytics Dashboard', path: '/dashboard', icon: DashboardIcon, color: '#1976d2', bg: 'rgba(25,118,210,0.08)' },
      { label: 'Daily Brief', path: '/daily-brief', icon: AssessmentIcon, color: '#7b1fa2', bg: 'rgba(123,31,162,0.08)' },
      { label: 'GIS Map', path: '/gis-map', icon: MapIcon, color: '#1f7a4d', bg: 'rgba(46,125,50,0.08)' },
      { label: 'Notifications', path: '/notifications', icon: NotificationsIcon, color: '#a84b07', bg: 'rgba(230,81,0,0.08)' },
    ],
  },
  {
    title: 'Data Entry',
    tiles: [
      { label: 'EC/pH Entry', path: '/ecph-entry', icon: ScienceIcon, color: '#00838f', bg: 'rgba(0,131,143,0.08)' },
      { label: 'Fertigation Entry', path: '/fertigation/entry', icon: WaterDropIcon, color: '#1565c0', bg: 'rgba(21,101,192,0.08)' },
      { label: 'Harvest Entry', path: '/harvest/entry', icon: AgricultureIcon, color: '#33691e', bg: 'rgba(51,105,30,0.08)' },
      { label: 'Templates', path: '/templates', icon: DescriptionIcon, color: '#4527a0', bg: 'rgba(69,39,160,0.08)' },
    ],
  },
  {
    title: 'IPM / Crop Protection',
    tiles: [
      { label: 'Pesticide Applications', path: '/ipm/pesticide-applications', icon: BugReportIcon, color: '#c62828', bg: 'rgba(198,40,40,0.08)' },
      { label: 'Scouting Reports', path: '/ipm/scouting-reports', icon: DescriptionIcon, color: '#ad1457', bg: 'rgba(173,20,87,0.08)' },
      { label: 'Spray Calendar', path: '/ipm/spray-calendar', icon: CalendarIcon, color: '#a84b07', bg: 'rgba(230,81,0,0.08)' },
      { label: 'Biological Control', path: '/ipm/biological-control-record', icon: SpaIcon, color: '#1f7a4d', bg: 'rgba(46,125,50,0.08)' },
    ],
  },
  {
    title: 'Reports & Dashboards',
    tiles: [
      { label: 'Harvest Dashboard', path: '/harvest/dashboard', icon: AgricultureIcon, color: '#33691e', bg: 'rgba(51,105,30,0.08)' },
      { label: 'Fertigation Dashboard', path: '/fertigation/dashboard', icon: WaterDropIcon, color: '#1565c0', bg: 'rgba(21,101,192,0.08)' },
      { label: 'Efficiency', path: '/efficiency-dashboard', icon: TrendingUpIcon, color: '#f57c00', bg: 'rgba(245,124,0,0.08)' },
      { label: 'Report Builder', path: '/report-builder', icon: DescriptionIcon, color: '#5e35b1', bg: 'rgba(94,53,177,0.08)' },
    ],
  },
  {
    title: 'Workforce',
    tiles: [
      { label: 'Tasks', path: '/tasks', icon: TaskIcon, color: '#6a1b9a', bg: 'rgba(106,27,154,0.08)' },
      { label: 'Shift Schedule', path: '/shift-schedule', icon: HistoryIcon, color: '#00695c', bg: 'rgba(0,105,92,0.08)' },
      { label: 'Manpower Record', path: '/manpower-record', icon: ManpowerIcon, color: '#4e342e', bg: 'rgba(78,52,46,0.08)' },
    ],
  },
  {
    title: 'Management',
    roles: MANAGERS,
    tiles: [
      { label: 'Field Types & Names', path: '/manage/field-types', icon: LabelIcon, color: '#37474f', bg: 'rgba(55,71,79,0.08)' },
      { label: 'Farm Areas & Crops', path: '/manage/farm-areas', icon: ParkIcon, color: '#1f7a4d', bg: 'rgba(46,125,50,0.08)' },
      { label: 'Agronomic Reference', path: '/agronomic-reference', icon: ScienceIcon, color: '#00838f', bg: 'rgba(0,131,143,0.08)' },
      { label: 'Inventory', path: '/inventory', icon: InventoryIcon, color: '#f57c00', bg: 'rgba(245,124,0,0.08)' },
      { label: 'User Management', path: '/admin/users', icon: PeopleIcon, color: '#1565c0', bg: 'rgba(21,101,192,0.08)' },
    ],
  },
];

function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;

  useEffect(() => {
    if (role === 'intern_student' || role === 'intern_teacher') {
      navigate('/internship', { replace: true });
    }
  }, [role, navigate]);

  const [recentRaw, setRecentRaw] = useState(readRecentPages);
  useEffect(() => {
    const sync = () => setRecentRaw(readRecentPages());
    window.addEventListener(RECENT_PAGES_EVENT, sync);
    return () => window.removeEventListener(RECENT_PAGES_EVENT, sync);
  }, []);

  // Only offer pages this user can still open (roles can change between visits).
  const recent = useMemo(() => {
    const allowed = new Set();
    Object.keys(AREA_SECTIONS).forEach((areaId) => {
      getSidebarSections(user, areaId).forEach((section) => section.items.forEach((it) => allowed.add(it.path)));
    });
    return recentRaw.filter((r) => allowed.has(r.path));
  }, [recentRaw, user]);

  const visibleSections = useMemo(() => {
    return SECTIONS.filter(s => !s.roles || s.roles.includes(role));
  }, [role]);

  return (
    <HubTileGrid sections={visibleSections} recent={recent} />
  );
}

export default Home;
