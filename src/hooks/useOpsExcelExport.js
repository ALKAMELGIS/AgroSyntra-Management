import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useNotification } from '../contexts/NotificationContext';
import { downloadCompanyExcel } from '../utils/companyExcelExport';

export default function useOpsExcelExport() {
  const { user } = useAuth();
  const { activeSite } = useActiveSite();
  const notify = useNotification();

  return useCallback(
    async (rows, opts = {}) => {
      try {
        await downloadCompanyExcel(rows, {
          ...opts,
          siteName: opts.siteName ?? activeSite?.name ?? '',
          exportedBy: opts.exportedBy ?? user?.name ?? '',
        });
        return true;
      } catch (err) {
        notify.error(err.message || 'Failed to export Excel');
        return false;
      }
    },
    [user, activeSite, notify],
  );
}
