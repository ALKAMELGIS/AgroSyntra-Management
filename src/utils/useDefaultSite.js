import { useState, useEffect } from 'react';
import { apiRequest } from './api';

let cachedDefaultSite = undefined;

export function useDefaultSite() {
  const [defaultSiteId, setDefaultSiteId] = useState(cachedDefaultSite || '');
  const [loading, setLoading] = useState(cachedDefaultSite === undefined);

  useEffect(() => {
    if (cachedDefaultSite !== undefined) return;
    apiRequest('/organization')
      .then((data) => {
        const siteId = data?.settings?.default_site || '';
        cachedDefaultSite = siteId;
        setDefaultSiteId(siteId);
      })
      .catch(() => { cachedDefaultSite = ''; })
      .finally(() => setLoading(false));
  }, []);

  return { defaultSiteId, isLoading: loading };
}
