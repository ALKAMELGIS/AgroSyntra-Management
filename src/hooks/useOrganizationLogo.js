import { useCallback, useEffect, useState } from 'react';
import { fetchOrganizationLogoBlob } from '../utils/organizationLogo';

export default function useOrganizationLogo() {
  const [logoUrl, setLogoUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const blob = await fetchOrganizationLogoBlob().catch(() => null);
    setLogoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [refresh]);

  return { logoUrl, loading, refresh };
}
