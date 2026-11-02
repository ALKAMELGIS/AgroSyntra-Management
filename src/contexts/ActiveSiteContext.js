import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { apiRequest } from '../utils/api';
import { useMasterData } from '../utils/useMasterData';
import { useAuth } from './AuthContext';
import { isSiteScopedRole } from '../utils/roleAccess';
import { siteContextLoaded } from '../utils/siteContextLoaded';

const STORAGE_KEY = 'almaha_active_site';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readStoredSiteId() {
  const stored = localStorage.getItem(STORAGE_KEY) || '';
  if (stored && !UUID_REGEX.test(stored)) {
    localStorage.removeItem(STORAGE_KEY);
    return '';
  }
  return stored;
}

const ActiveSiteContext = createContext({
  activeSiteId: '',
  activeSite: null,
  allSites: [],
  countries: [],
  setActiveSiteId: () => {},
  isLoaded: false,
  allowAllSites: true,
  hasSiteAssignment: true,
  assignedSiteIds: null,
});

function filterCountriesBySites(countries, siteIds) {
  if (!siteIds) return countries || [];
  const allowed = new Set(siteIds);
  return (countries || [])
    .map((country) => ({
      ...country,
      sites: (country.sites || []).filter((site) => allowed.has(site.id)),
    }))
    .filter((country) => country.sites?.length);
}

export function ActiveSiteProvider({ children }) {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [activeSiteId, setActiveSiteIdRaw] = useState(() => readStoredSiteId());
  const [orgDefaultLoaded, setOrgDefaultLoaded] = useState(false);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [assignedSiteIds, setAssignedSiteIds] = useState(null);
  const [isFullAccess, setIsFullAccess] = useState(true);
  const { data: masterData } = useMasterData({ enabled: isAuthenticated && !authLoading });

  useEffect(() => {
    if (!isAuthenticated || authLoading) {
      setAccessLoaded(false);
      return;
    }
    if (!user?.role) return;

    if (!isSiteScopedRole(user.role)) {
      setAssignedSiteIds(null);
      setIsFullAccess(true);
      setAccessLoaded(true);
      return;
    }

    setAccessLoaded(false);
    apiRequest('/assignments/my-access')
      .then((res) => {
        const data = res?.data ?? res;
        setIsFullAccess(Boolean(data?.isFullAccess));
        setAssignedSiteIds(Array.isArray(data?.siteIds) ? data.siteIds : []);
      })
      .catch(() => {
        setIsFullAccess(false);
        setAssignedSiteIds([]);
      })
      .finally(() => setAccessLoaded(true));
  }, [isAuthenticated, authLoading, user?.role, user?.id]);

  const countries = useMemo(
    () => filterCountriesBySites(masterData.countries, isFullAccess ? null : assignedSiteIds),
    [masterData.countries, assignedSiteIds, isFullAccess],
  );

  const allSites = useMemo(() => {
    const sites = [];
    countries?.forEach((c) => {
      c.sites?.forEach((s) => {
        sites.push({ ...s, zoneId: c.id, zoneName: c.name });
      });
    });
    return sites;
  }, [countries]);

  const activeSite = useMemo(
    () => allSites.find((s) => s.id === activeSiteId) || null,
    [allSites, activeSiteId],
  );

  const setActiveSiteId = useCallback((id) => {
    setActiveSiteIdRaw(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!accessLoaded) return;

    if (assignedSiteIds && assignedSiteIds.length === 1) {
      if (activeSiteId !== assignedSiteIds[0]) {
        setActiveSiteId(assignedSiteIds[0]);
      }
      return;
    }

    if (assignedSiteIds && assignedSiteIds.length > 0 && activeSiteId && !assignedSiteIds.includes(activeSiteId)) {
      setActiveSiteId(assignedSiteIds[0]);
    }

    if (assignedSiteIds && assignedSiteIds.length === 0) {
      setActiveSiteId('');
    }
  }, [accessLoaded, assignedSiteIds, activeSiteId, setActiveSiteId]);

  useEffect(() => {
    if (!isAuthenticated || authLoading || !accessLoaded) return;
    if (assignedSiteIds && assignedSiteIds.length > 0) {
      setOrgDefaultLoaded(true);
      return;
    }
    if (activeSiteId || orgDefaultLoaded) {
      setOrgDefaultLoaded(true);
      return;
    }
    apiRequest('/organization')
      .then((org) => {
        const defaultId = org?.settings?.default_site;
        if (defaultId && !activeSiteId) {
          setActiveSiteId(defaultId);
        }
      })
      .catch(() => {})
      .finally(() => setOrgDefaultLoaded(true));
  }, [isAuthenticated, authLoading, activeSiteId, orgDefaultLoaded, setActiveSiteId, accessLoaded, assignedSiteIds]);

  const allowAllSites = isFullAccess || assignedSiteIds === null;
  const hasSiteAssignment = assignedSiteIds === null || assignedSiteIds.length > 0;
  const isLoaded = siteContextLoaded({
    orgDefaultLoaded,
    accessLoaded,
    allSites,
    assignedSiteIds,
  });

  const value = useMemo(() => ({
    activeSiteId,
    activeSite,
    allSites,
    countries,
    setActiveSiteId,
    isLoaded,
    allowAllSites,
    hasSiteAssignment,
    assignedSiteIds,
  }), [activeSiteId, activeSite, allSites, countries, setActiveSiteId, isLoaded, allowAllSites, hasSiteAssignment, assignedSiteIds]);

  return (
    <ActiveSiteContext.Provider value={value}>
      {children}
    </ActiveSiteContext.Provider>
  );
}

export function useActiveSite() {
  return useContext(ActiveSiteContext);
}
