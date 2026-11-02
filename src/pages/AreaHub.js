import { useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import HubTileGrid from '../components/HubTileGrid';
import {
  NAV_AREAS,
  getAreaHubSections,
  getVisibleNavAreas,
  getHubPathForArea,
} from '../config/navAreas';

export default function AreaHub() {
  const { areaId } = useParams();
  const { user } = useAuth();

  const visibleAreas = getVisibleNavAreas(user);
  const areaMeta = NAV_AREAS.find((a) => a.id === areaId);
  const allowed = areaId && visibleAreas.includes(areaId);

  const sections = useMemo(() => {
    if (!allowed) return [];
    return getAreaHubSections(user, areaId);
  }, [allowed, user, areaId]);

  if (!allowed) {
    const fallback = visibleAreas[0];
    if (fallback) {
      return <Navigate to={getHubPathForArea(fallback)} replace />;
    }
    return <Navigate to="/" replace />;
  }

  if (sections.length === 0) {
    return <Navigate to="/" replace />;
  }

  return (
    <HubTileGrid
      sections={sections}
      userName={user?.name}
      subtitle={areaMeta ? `${areaMeta.label} — choose a module` : undefined}
    />
  );
}
