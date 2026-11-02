import { useMemo } from 'react';
import { useLocation, Link as RouterLink } from 'react-router-dom';
import { Breadcrumbs, Link, Typography, Box } from '@mui/material';
import { NavigateNext as NavIcon, Home as HomeIcon } from '@mui/icons-material';

/**
 * Route-path to human-readable label mapping.
 * Extend this whenever a new route is added.
 */
const PATH_LABELS = {
  '': 'Home',
  'ecph-entry': 'EC/PH Entry',
  harvest: 'Harvest',
  entry: 'Entry',
  dashboard: 'Dashboard',
  reports: 'Reports',
  fertigation: 'Fertigation',
  'efficiency-dashboard': 'Efficiency Dashboard',
  'weather-log': 'Weather & Soil Data',
  map: 'Map',
  'remote-sensing': 'Remote Sensing',
  'gis-map': 'GIS Map',
  manage: 'Master Data',
  countries: 'Zones & Sites',
  'farm-areas': 'Farm Areas & Crops',
  'field-types': 'Field Types & Names',
  valves: 'Valves Configuration',
  recipes: 'Recipes',
  seasons: 'Seasons',
  admin: 'Admin',
  users: 'User Management',
  audit: 'Audit Log',
  tasks: 'Tasks',
  notifications: 'Notifications',
  'report-builder': 'Report Builder',
};

function labelFor(segment) {
  return PATH_LABELS[segment] || segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Auto-generated breadcrumbs based on the current route.
 * Renders nothing on the home page.
 */
export default function AppBreadcrumbs() {
  const location = useLocation();

  const crumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return [];

    return segments.map((seg, idx) => {
      const path = '/' + segments.slice(0, idx + 1).join('/');
      return { label: labelFor(seg), path, isLast: idx === segments.length - 1 };
    });
  }, [location.pathname]);

  if (crumbs.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Breadcrumbs separator={<NavIcon fontSize="small" />} aria-label="breadcrumb">
        <Link
          component={RouterLink}
          to="/"
          underline="hover"
          color="inherit"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <HomeIcon sx={{ fontSize: 18 }} />
          Home
        </Link>
        {crumbs.map((crumb) =>
          crumb.isLast ? (
            <Typography key={crumb.path} color="text.primary" fontWeight={500}>
              {crumb.label}
            </Typography>
          ) : (
            <Link
              key={crumb.path}
              component={RouterLink}
              to={crumb.path}
              underline="hover"
              color="inherit"
            >
              {crumb.label}
            </Link>
          )
        )}
      </Breadcrumbs>
    </Box>
  );
}
