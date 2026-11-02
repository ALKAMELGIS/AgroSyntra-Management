import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest } from '../utils/api';
import { getActAsOrgId, setActAsOrgId as persistActAsOrgId } from '../utils/authStorage';
import { useAuth } from './AuthContext';
import { useActiveSite } from './ActiveSiteContext';
import { useMasterData } from '../utils/useMasterData';

const ActAsOrgContext = createContext({
  isSuperAdmin: false,
  actAsOrgId: null,
  homeOrg: null,
  activeOrg: null,
  organizations: [],
  isActingAsOrg: false,
  loading: false,
  setActAsOrg: async () => {},
  refreshOrganizations: async () => {},
});

export function ActAsOrgProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const { setActiveSiteId } = useActiveSite();
  const { refresh: refreshMasterData } = useMasterData({ enabled: false });

  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const [actAsOrgId, setActAsOrgIdState] = useState(() => (
    isSuperAdmin ? getActAsOrgId() : null
  ));
  const [organizations, setOrganizations] = useState([]);
  const [homeOrg, setHomeOrg] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshOrganizations = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const orgs = await apiRequest('/admin/organizations');
      setOrganizations(Array.isArray(orgs) ? orgs : []);
    } catch {
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isAuthenticated || !isSuperAdmin) {
      setActAsOrgIdState(null);
      persistActAsOrgId(null);
      setOrganizations([]);
      setHomeOrg(null);
      return;
    }

    const stored = getActAsOrgId();
    setActAsOrgIdState(stored || null);
    refreshOrganizations();
  }, [isAuthenticated, isSuperAdmin, refreshOrganizations]);

  useEffect(() => {
    if (!isSuperAdmin || !user?.organizationId) {
      setHomeOrg(null);
      return;
    }
    const fromList = organizations.find((o) => o.id === user.organizationId);
    if (fromList) {
      setHomeOrg(fromList);
    }
  }, [isSuperAdmin, user?.organizationId, organizations]);

  const setActAsOrg = useCallback(async (orgId) => {
    if (!isSuperAdmin) return;
    const nextId = orgId || null;
    persistActAsOrgId(nextId);
    setActAsOrgIdState(nextId);
    setActiveSiteId('');
    await refreshMasterData();
  }, [isSuperAdmin, setActiveSiteId, refreshMasterData]);

  const activeOrg = useMemo(() => {
    if (!actAsOrgId) return homeOrg;
    return organizations.find((o) => o.id === actAsOrgId) || { id: actAsOrgId, name: 'Organization' };
  }, [actAsOrgId, homeOrg, organizations]);

  const value = useMemo(() => ({
    isSuperAdmin,
    actAsOrgId,
    homeOrg,
    activeOrg,
    organizations,
    isActingAsOrg: Boolean(actAsOrgId),
    loading,
    setActAsOrg,
    refreshOrganizations,
  }), [
    isSuperAdmin,
    actAsOrgId,
    homeOrg,
    activeOrg,
    organizations,
    loading,
    setActAsOrg,
    refreshOrganizations,
  ]);

  return (
    <ActAsOrgContext.Provider value={value}>
      {children}
    </ActAsOrgContext.Provider>
  );
}

export function useActAsOrg() {
  return useContext(ActAsOrgContext);
}

export default ActAsOrgContext;
