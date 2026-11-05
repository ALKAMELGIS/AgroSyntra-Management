import { useState, useEffect } from 'react';
import { Box, Typography, Alert, CircularProgress } from '@mui/material';
import { apiRequest } from '../utils/api';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import DailyActivitySheet from '../components/manpower/DailyActivitySheet';
import InfoNote from '../components/InfoNote';

export default function ManpowerActivitySheet() {
  const { activeSiteId } = useActiveSite();
  const [activities, setActivities] = useState([]);
  const [references, setReferences] = useState([]);
  const [fields, setFields] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!activeSiteId) {
      setActivities([]);
      setReferences([]);
      setFields([]);
      setWorkers([]);
      setLoadError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    const site = encodeURIComponent(activeSiteId);
    Promise.all([
      apiRequest(`/manpower/admin/activities?site_id=${site}`),
      apiRequest(`/manpower/admin/fields-with-variety?site_id=${site}`),
      apiRequest(`/manpower/activity-references?site_id=${site}`).catch(() => []),
      apiRequest(`/manpower/workers?site_id=${site}&active_only=true`),
    ]).then(([acts, flds, refs, wrks]) => {
      if (cancelled) return;
      setActivities(acts || []);
      setFields(flds || []);
      setReferences(refs || []);
      setWorkers(wrks || []);
    }).catch((err) => {
      if (!cancelled) setLoadError(err.message || 'Failed to load activity sheet data');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeSiteId]);

  const handleSubmit = async (records) => {
    setSubmitting(true);
    try {
      await apiRequest('/manpower/admin/records/bulk', {
        method: 'POST',
        // The server always stores typed days as pending for the operation manager.
        body: JSON.stringify({ records }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const checkOverlaps = async (date, workerIds) => {
    if (!workerIds.length) return [];
    return apiRequest(
      `/manpower/admin/records/overlaps?date=${encodeURIComponent(date)}&worker_ids=${workerIds.join(',')}`,
    );
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <Typography variant="h4" sx={{ fontSize: { xs: '1.25rem', md: '2.125rem' }, mb: 0.5 }}>
        Daily Activity Sheet
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Same sheet team leaders use. Submissions stay pending until an operation manager approves them.
      </Typography>

      {!activeSiteId && (
        <InfoNote mode="line" severity="info">Select an Active Site to load fields and workers.</InfoNote>
      )}
      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {activeSiteId && !loading && !loadError && (
        <DailyActivitySheet
          activities={activities}
          references={references}
          fields={fields}
          workers={workers}
          onSubmit={handleSubmit}
          checkOverlaps={checkOverlaps}
          submitting={submitting}
        />
      )}
    </Box>
  );
}
