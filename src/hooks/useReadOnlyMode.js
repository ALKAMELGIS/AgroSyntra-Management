import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import { isReadOnlyOnPage } from '../utils/roleAccess';

export default function useReadOnlyMode(pageKey) {
  const { user } = useAuth();
  const { isSeasonReadOnly } = useActiveSeason();
  return useMemo(
    () => isReadOnlyOnPage(user, pageKey) || isSeasonReadOnly,
    [user, pageKey, isSeasonReadOnly],
  );
}
