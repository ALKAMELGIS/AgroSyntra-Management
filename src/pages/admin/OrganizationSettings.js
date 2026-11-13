import { useState, useEffect } from 'react';
import {
  Container, Paper, Typography, Box, Grid, Card, CardContent, TextField, Button,
  Chip, Divider, Switch, FormControlLabel, MenuItem,
} from '@mui/material';
import { SettingsOutlined as SettingsIcon, GroupOutlined as UsersIcon,
  SaveOutlined as SaveIcon,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import PageTitle from '../../components/PageTitle';

export default function OrganizationSettings() {
  const [org, setOrg] = useState(null);
  const [form, setForm] = useState({ name: '', slug: '' });
  const [settings, setSettings] = useState({
    allow_registration: true,
    default_currency: 'AED',
    timezone: 'Asia/Dubai',
    language: 'en',
  });
  const [loading, setLoading] = useState(true);
  const notify = useNotification();
  const { user } = useAuth();
  const { allSites, setActiveSiteId } = useActiveSite();

  useEffect(() => {
    // Load organization data
    apiRequest('/organization')
      .then((data) => {
        if (data) {
          setOrg(data);
          setForm({ name: data.name || '', slug: data.slug || '' });
          if (data.settings) setSettings({ ...settings, ...data.settings });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      const safeSettings = { ...settings };
      delete safeSettings.logo_url;
      delete safeSettings.logo_storage_key;
      await apiRequest('/organization', {
        method: 'PUT',
        body: JSON.stringify({ name: form.name, settings: safeSettings }),
      });
      if (settings.default_site) setActiveSiteId(settings.default_site);
      notify.success('Organization settings saved');
    } catch (err) {
      notify.error(err.message);
    }
  };

  if (loading) return null;

  return (
    <Container maxWidth="lg">
      <PageTitle sx={{ mb: 1 }}>
        Organization Settings
      </PageTitle>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SettingsIcon /> General
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Organization Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                fullWidth
              />
              <TextField
                label="Slug"
                value={form.slug}
                disabled
                fullWidth
                helperText="URL-friendly identifier (cannot be changed)"
              />
              <TextField
                label="Default Currency"
                value={settings.default_currency}
                onChange={(e) => setSettings({ ...settings, default_currency: e.target.value })}
              />
              <TextField
                label="Timezone"
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              />
              <TextField
                select
                label="Default Site"
                value={settings.default_site || ''}
                onChange={(e) => setSettings({ ...settings, default_site: e.target.value })}
                helperText="Pre-fills site dropdowns across all pages (can still be changed)"
                SelectProps={{ displayEmpty: true }}
               InputLabelProps={{ shrink: true }}>
                <MenuItem value=""><em>None (manual selection)</em></MenuItem>
                {allSites.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.allow_registration}
                    onChange={(e) => setSettings({ ...settings, allow_registration: e.target.checked })}
                  />
                }
                label="Allow new user registration"
              />
            </Box>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} sx={{ mt: 2 }}>
              Save Settings
            </Button>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <UsersIcon /> Organization Info
            </Typography>
            {org && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>Organization ID</Typography>
                <Typography variant="body1" sx={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', mb: 2 }}>{org.id}</Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>Created</Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {org.created_at ? new Date(org.created_at).toLocaleDateString() : 'Unknown'}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>Status</Typography>
                <Chip label={org.is_active ? 'Active' : 'Inactive'} color={org.is_active ? 'success' : 'default'} />
              </Box>
            )}
          </Paper>

          <Paper sx={{ p: { xs: 3, sm: 4 }, mt: 2 }}>
            <Typography variant="h6" gutterBottom>Your Role</Typography>
            <Chip
              label={user?.role?.replace('_', ' ').toUpperCase() || 'Unknown'}
              color="primary"
              size="medium"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Only CEOs can modify organization settings.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
