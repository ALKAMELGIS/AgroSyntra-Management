import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { apiRequest } from '../utils/api';
import { useAuth } from './AuthContext';
import { useActiveSite } from './ActiveSiteContext';
import { isSeasonLocked, pickDefaultSeasonId } from '../utils/seasonListDates';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(siteId) {
  return `almaha_active_season:${siteId}`;
}

function readStoredSeasonId(siteId) {
  if (!siteId) return '';
  const stored = localStorage.getItem(storageKey(siteId)) || '';
  if (stored && !UUID_REGEX.test(stored)) {
    localStorage.removeItem(storageKey(siteId));
    return '';
  }
  return stored;
}

const ActiveSeasonContext = createContext({
  activeSeasonId: '',
  activeSeason: null,
  seasons: [],
  setActiveSeasonId: () => {},
  reloadSeasons: () => {},
  isLoaded: false,
  isSeasonReadOnly: false,
});

export function ActiveSeasonProvider({ children }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { activeSiteId, isLoaded: siteLoaded } = useActiveSite();
  const [seasons, setSeasons] = useState([]);
  const [activeSeasonId, setActiveSeasonIdRaw] = useState('');
  const [fetchedSiteId, setFetchedSiteId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reloadSeasons = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  const setActiveSeasonId = useCallback((id, siteId = activeSiteId) => {
    setActiveSeasonIdRaw(id || '');
    if (!siteId) return;
    if (id) localStorage.setItem(storageKey(siteId), id);
    else localStorage.removeItem(storageKey(siteId));
  }, [activeSiteId]);

  useEffect(() => {
    if (!siteLoaded || authLoading) return;

    if (!isAuthenticated || !activeSiteId) {
      setSeasons([]);
      setActiveSeasonIdRaw('');
      setFetchedSiteId(activeSiteId || '');
      return;
    }

    let cancelled = false;
    setSeasons([]);
    setActiveSeasonIdRaw('');
    setFetchedSiteId(null);
    apiRequest(`/seasons?site_id=${encodeURIComponent(activeSiteId)}`)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setSeasons(list);
        const nextId = pickDefaultSeasonId(list, readStoredSeasonId(activeSiteId));
        setActiveSeasonId(nextId, activeSiteId);
        setFetchedSiteId(activeSiteId);
      })
      .catch(() => {
        if (cancelled) return;
        setSeasons([]);
        setActiveSeasonIdRaw('');
        setFetchedSiteId(activeSiteId);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading, activeSiteId, siteLoaded, setActiveSeasonId, reloadToken]);

  const activeSeason = useMemo(
    () => seasons.find((s) => s.id === activeSeasonId) || null,
    [seasons, activeSeasonId],
  );

  const isLoaded = siteLoaded && fetchedSiteId !== null && fetchedSiteId === (activeSiteId || '');

  const isSeasonReadOnly = isSeasonLocked(activeSeason);

  const value = useMemo(() => ({
    activeSeasonId,
    activeSeason,
    seasons,
    setActiveSeasonId,
    reloadSeasons,
    isLoaded,
    isSeasonReadOnly,
  }), [activeSeasonId, activeSeason, seasons, setActiveSeasonId, reloadSeasons, isLoaded, isSeasonReadOnly]);

  return (
    <ActiveSeasonContext.Provider value={value}>
      {children}
    </ActiveSeasonContext.Provider>
  );
}

export function useActiveSeason() {
  return useContext(ActiveSeasonContext);
}
