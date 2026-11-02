import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControlLabel,
  Checkbox,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Business as OrgIcon,
  Add as AddIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useActAsOrg } from '../../contexts/ActAsOrgContext';
import { useNotification } from '../../contexts/NotificationContext';
import { apiRequest } from '../../utils/api';

const OWNER_ROLES = [
  { value: 'ceo', label: 'CEO' },
  { value: 'farm_manager', label: 'Farm Manager' },
  { value: 'operation_manager', label: 'Operation Manager' },
];

export default function PlatformAdmin() {
  const { user } = useAuth();
  const { organizations, refreshOrganizations, loading: orgsLoading } = useActAsOrg();
  const notify = useNotification();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    slug: '',
    ownerEmail: '',
    ownerRole: 'farm_manager',
    seedSite: true,
  });
  const [creating, setCreating] = useState(false);
  const [recentInvites, setRecentInvites] = useState([]);

  useEffect(() => {
    if (user && !user.isSuperAdmin) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  if (!user?.isSuperAdmin) {
    return null;
  }

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload = {
        name: form.name.trim(),
        ownerEmail: form.ownerEmail.trim(),
        ownerRole: form.ownerRole,
        seedSite: form.seedSite,
      };
      if (form.slug.trim()) payload.slug = form.slug.trim();

      const result = await apiRequest('/admin/organizations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setRecentInvites((prev) => [
        {
          orgName: result.organization?.name || form.name,
          registerUrl: result.invite?.registerUrl,
          ownerEmail: result.invite?.email,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      notify.success(`Organization "${result.organization?.name}" created`);
      setForm({
        name: '',
        slug: '',
        ownerEmail: '',
        ownerRole: 'farm_manager',
        seedSite: true,
      });
      await refreshOrganizations();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const copyInvite = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      notify.success('Invite link copied');
    } catch {
      notify.error('Could not copy link');
    }
  };

  return (
    <Box sx={{ py: 3, px: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h4" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <OrgIcon fontSize="large" /> Platform Admin
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Create farm organizations and send owner invite links. You can create unlimited organizations.
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Create Organization</Typography>
            <Box component="form" onSubmit={handleCreate} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Organization Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                fullWidth
              />
              <TextField
                label="Slug (optional)"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                fullWidth
                helperText="URL-friendly identifier; auto-generated if blank"
              />
              <TextField
                label="Owner Email"
                type="email"
                value={form.ownerEmail}
                onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                required
                fullWidth
              />
              <TextField
                select
                label="Owner Role"
                value={form.ownerRole}
                onChange={(e) => setForm({ ...form, ownerRole: e.target.value })}
                fullWidth
              >
                {OWNER_ROLES.map((r) => (
                  <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={form.seedSite}
                    onChange={(e) => setForm({ ...form, seedSite: e.target.checked })}
                  />
                )}
                label="Seed starter country and site"
              />
              <Button
                type="submit"
                variant="contained"
                startIcon={creating ? <CircularProgress size={18} color="inherit" /> : <AddIcon />}
                disabled={creating || !form.name.trim() || !form.ownerEmail.trim()}
              >
                Create Organization
              </Button>
            </Box>
          </Paper>

          {recentInvites.length > 0 && (
            <Paper sx={{ p: 3, mt: 3 }}>
              <Typography variant="h6" gutterBottom>Recent Invites (this session)</Typography>
              {recentInvites.map((inv) => (
                <Alert
                  key={`${inv.registerUrl}-${inv.createdAt}`}
                  severity="info"
                  sx={{ mb: 1, alignItems: 'flex-start' }}
                  action={(
                    <Tooltip title="Copy invite link">
                      <IconButton size="small" onClick={() => copyInvite(inv.registerUrl)}>
                        <CopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                >
                  <Typography variant="body2" fontWeight={600}>{inv.orgName}</Typography>
                  <Typography variant="caption" display="block">{inv.ownerEmail}</Typography>
                </Alert>
              ))}
            </Paper>
          )}
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>All Organizations</Typography>
            {orgsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Slug</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {organizations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          No organizations yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      organizations.map((org) => (
                        <TableRow key={org.id} hover>
                          <TableCell>{org.name}</TableCell>
                          <TableCell>{org.slug}</TableCell>
                          <TableCell>
                            {org.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell>{org.is_active ? 'Active' : 'Inactive'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
