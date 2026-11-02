import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Tooltip,
  Autocomplete,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  Edit as EditIcon,
  Block as BlockIcon,
  CheckCircle as ActiveIcon,
  PersonAdd as AddIcon,
  Assignment as AssignmentIcon,
  Delete as DeleteIcon,
  Security as PermissionsIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { canManageUser } from '../../utils/adminAccess';
import { apiRequest } from '../../utils/api';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { useNotification } from '../../contexts/NotificationContext';

const ROLES = [
  { value: 'ceo', label: 'CEO', color: 'error' },
  { value: 'farm_manager', label: 'Farm Manager', color: 'warning' },
  { value: 'operation_manager', label: 'Operation Manager', color: 'info' },
  { value: 'agronomist', label: 'Agronomist', color: 'primary' },
  { value: 'pest_agronomist', label: 'Pest Agronomist', color: 'success' },
  { value: 'scouter', label: 'Scouter', color: 'info' },
  { value: 'auditor', label: 'Auditor', color: 'warning' },
  { value: 'operator', label: 'Operator', color: 'secondary' },
  { value: 'worker', label: 'Data Entry Worker', color: 'default' },
  { value: 'intern_student', label: 'Student', color: 'info' },
  { value: 'intern_teacher', label: 'Intern Teacher', color: 'secondary' },
];

function UserManagement() {
  const { t } = useTranslation();
  const notify = useNotification();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Sites (and their zones) for assignments. Farm areas / fields are no
  // longer assigned directly — site assignment cascades to everything below.
  const [sites, setSites] = useState([]);
  const [zones, setZones] = useState([]);
  
  // Edit dialog state
  const [editDialog, setEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', role: '', isActive: true });
  const [saving, setSaving] = useState(false);

  // Add user dialog state
  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', name: '', password: '', role: 'worker' });

  // Assignment dialog state
  const [assignDialog, setAssignDialog] = useState(false);
  const [assigningUser, setAssigningUser] = useState(null);
  const [zoneFilter, setZoneFilter] = useState('');
  const [selectedSite, setSelectedSite] = useState(null);
  const [userAssignments, setUserAssignments] = useState({ sites: [] });
  // Zone assignments (CEO assigns farm managers to zones)
  const [zoneAssignments, setZoneAssignments] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);

  // Permissions dialog state
  const [permDialog, setPermDialog] = useState(false);
  const [permUser, setPermUser] = useState(null);
  const [permList, setPermList] = useState([]);
  const [permModules] = useState([
    'recipes','inventory','fertigation','ecph','harvest',
    'ipm','tasks','shifts','manpower','weather','gis','costs','reports','api_integrations',
  ]);
  const [permForm, setPermForm] = useState({ module: '', permission: 'write' });

  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiRequest('/users');
      setUsers(data);
    } catch (err) {
      notify.error(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const data = await apiRequest('/users/meta/roles');
      setAssignableRoles(data);
    } catch (err) {
      console.error('Failed to load roles:', err);
    }
  }, []);

  const loadMasterData = useCallback(async () => {
    try {
      const [sitesData, zonesData] = await Promise.all([
        apiRequest('/sites'),
        apiRequest('/countries'),
      ]);
      setSites(sitesData);
      setZones(zonesData);
    } catch (err) {
      console.error('Failed to load master data:', err);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadRoles();
    loadMasterData();
  }, [loadUsers, loadRoles, loadMasterData]);

  const handleEditClick = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    });
    setEditDialog(true);
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      await apiRequest(`/users/${editingUser.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      });
      notify.success('User updated successfully');
      setEditDialog(false);
      loadUsers();
    } catch (err) {
      notify.error(err.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await apiRequest(`/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      notify.success(user.isActive ? 'User deactivated' : 'User activated');
      loadUsers();
    } catch (err) {
      notify.error(err.message || 'Failed to update user status');
    }
  };

  const handleDeleteClick = (user) => {
    setUserToDelete(user);
    setDeleteDialog(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    try {
      await apiRequest(`/users/${userToDelete.id}`, { method: 'DELETE' });
      notify.success('User deleted successfully');
      setDeleteDialog(false);
      setUserToDelete(null);
      loadUsers();
    } catch (err) {
      notify.error(err.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddUser = async () => {
    if (!addForm.email || !addForm.name || !addForm.password) {
      notify.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(addForm),
      });
      notify.success('User created successfully');
      setAddDialog(false);
      setAddForm({ email: '', name: '', password: '', role: 'worker' });
      loadUsers();
    } catch (err) {
      notify.error(err.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  // Permissions functions
  const handlePermClick = async (user) => {
    setPermUser(user);
    setPermForm({ module: '', permission: 'write' });
    try {
      const data = await apiRequest(`/permissions/user/${user.id}`);
      setPermList(data || []);
    } catch { setPermList([]); }
    setPermDialog(true);
  };

  const handleGrantPerm = async () => {
    if (!permForm.module || !permUser) return;
    setSaving(true);
    try {
      await apiRequest('/permissions', {
        method: 'POST',
        body: JSON.stringify({ userId: permUser.id, module: permForm.module, permission: permForm.permission }),
      });
      notify.success(`Granted ${permForm.permission} on ${permForm.module}`);
      const data = await apiRequest(`/permissions/user/${permUser.id}`);
      setPermList(data || []);
      setPermForm({ module: '', permission: 'write' });
    } catch (err) { notify.error(err.message || 'Failed to grant permission'); }
    finally { setSaving(false); }
  };

  const handleRevokePerm = async (id) => {
    try {
      await apiRequest(`/permissions/${id}`, { method: 'DELETE' });
      setPermList((prev) => prev.filter((p) => p.id !== id));
      notify.success('Permission revoked');
    } catch (err) { notify.error(err.message || 'Failed to revoke'); }
  };

  // Assignment functions — we only assign users to Sites. Site assignment
  // cascades down to all farm-areas and fields within that site (handled
  // by AssignmentRepository.getUserAccessibleFieldIds).
  const handleAssignClick = async (user) => {
    setAssigningUser(user);
    setSelectedSite(null);
    setZoneFilter('');

    try {
      const userData = await apiRequest(`/users/${user.id}`);
      setUserAssignments({ sites: userData.assignments?.sites || [] });
    } catch (err) {
      console.error('Failed to load user assignments:', err);
      setUserAssignments({ sites: [] });
    }

    setSelectedZone(null);
    setZoneAssignments([]);
    if (currentUser?.role === 'ceo' && user.role === 'farm_manager') {
      await loadZoneAssignments(user.id);
    }

    setAssignDialog(true);
  };

  const loadZoneAssignments = async (userId) => {
    try {
      const data = await apiRequest(`/assignments/users/${userId}/zones`);
      setZoneAssignments(Array.isArray(data) ? data : data?.data || []);
    } catch (err) {
      setZoneAssignments([]);
      notify.error(err.message || t('zoneAccess.loadZonesFailed'));
    }
  };

  const handleAssignToZone = async () => {
    if (!selectedZone || !assigningUser) return;
    try {
      await apiRequest(`/assignments/users/${assigningUser.id}/zones`, {
        method: 'POST',
        body: JSON.stringify({ countryId: selectedZone.id }),
      });
      notify.success(t('zoneAccess.zoneAssigned'));
      setSelectedZone(null);
      await loadZoneAssignments(assigningUser.id);
    } catch (err) {
      notify.error(err.message || t('zoneAccess.zoneAssignFailed'));
    }
  };

  const handleRemoveFromZone = async (countryId) => {
    if (!assigningUser) return;
    try {
      await apiRequest(`/assignments/users/${assigningUser.id}/zones/${countryId}`, { method: 'DELETE' });
      notify.success(t('zoneAccess.zoneRemoved'));
      await loadZoneAssignments(assigningUser.id);
    } catch (err) {
      notify.error(err.message || t('zoneAccess.zoneRemoveFailed'));
    }
  };

  const handleAssignToSite = async () => {
    if (!selectedSite) return;
    try {
      await apiRequest(`/assignments/sites/${selectedSite.id}/users`, {
        method: 'POST',
        body: JSON.stringify({ userId: assigningUser.id }),
      });
      notify.success('User assigned to site');
      setSelectedSite(null);
      const userData = await apiRequest(`/users/${assigningUser.id}`);
      setUserAssignments({ sites: userData.assignments?.sites || [] });
    } catch (err) {
      notify.error(err.message || 'Failed to assign user');
    }
  };

  const handleRemoveFromSite = async (siteId) => {
    try {
      await apiRequest(`/assignments/sites/${siteId}/users/${assigningUser.id}`, { method: 'DELETE' });
      notify.success('User removed from site');
      const userData = await apiRequest(`/users/${assigningUser.id}`);
      setUserAssignments({ sites: userData.assignments?.sites || [] });
    } catch (err) {
      notify.error(err.message || 'Failed to remove user');
    }
  };

  const getRoleChip = (role) => {
    const roleInfo = ROLES.find((r) => r.value === role) || { label: role, color: 'default' };
    return <Chip label={roleInfo.label} color={roleInfo.color} size="small" />;
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ mb: 3 }}>User Management</Typography>
        <TableSkeleton rows={6} columns={5} />
      </Box>
    );
  }

  // Check if current user can manage users
  const canManageRoles = ['ceo', 'farm_manager', 'operation_manager'].includes(currentUser?.role);
  if (!canManageRoles) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">You don't have permission to access this page.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          User Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddDialog(true)}
          disabled={assignableRoles.length === 0}
        >
          Add User
        </Button>
      </Box>

      <Card>
        <CardContent>
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Login</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{getRoleChip(user.role)}</TableCell>
                    <TableCell>
                      <Chip
                        label={user.isActive ? 'Active' : 'Inactive'}
                        color={user.isActive ? 'success' : 'default'}
                        size="small"
                        variant={user.isActive ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Permissions">
                        <span>
                          {/* Grants only for lower-ranked users, never yourself (enforced by the API). */}
                          <IconButton
                            size="small"
                            onClick={() => handlePermClick(user)}
                            disabled={user.id === currentUser?.id || !canManageUser(currentUser, user)}
                          >
                            <PermissionsIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Manage Site Assignments">
                        <IconButton size="small" onClick={() => handleAssignClick(user)}>
                          <AssignmentIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleEditClick(user)}
                            disabled={!canManageUser(currentUser, user)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {user.id !== currentUser?.id && (
                        <Tooltip title={user.isActive ? 'Deactivate' : 'Activate'}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleActive(user)}
                              color={user.isActive ? 'warning' : 'success'}
                              disabled={!canManageUser(currentUser, user)}
                            >
                            {user.isActive ? (
                              <BlockIcon fontSize="small" />
                            ) : (
                              <ActiveIcon fontSize="small" />
                            )}
                          </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      {user.id !== currentUser?.id && (
                        <Tooltip title="Delete account">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteClick(user)}
                              color="error"
                              disabled={!canManageUser(currentUser, user)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Name"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
          />
          <TextField
            fullWidth
            select
            label="Role"
            value={editForm.role}
            onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
            sx={{ mb: 2 }}
          >
            {assignableRoles.map((role) => (
              <MenuItem key={role.value} value={role.value}>
                {role.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button onClick={handleEditSave} variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addDialog} onClose={() => setAddDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Name"
            value={addForm.name}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={addForm.email}
            onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
            sx={{ mb: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={addForm.password}
            onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
            sx={{ mb: 2 }}
            required
            helperText="Must be at least 8 characters"
          />
          <TextField
            fullWidth
            select
            label="Role"
            value={addForm.role}
            onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
          >
            {assignableRoles.map((role) => (
              <MenuItem key={role.value} value={role.value}>
                {role.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialog(false)}>Cancel</Button>
          <Button onClick={handleAddUser} variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={24} /> : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={assignDialog} onClose={() => setAssignDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Manage Assignments - {assigningUser?.name}
          <Typography variant="body2" color="text.secondary">
            {getRoleChip(assigningUser?.role)}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {currentUser?.role === 'ceo' && assigningUser?.role === 'farm_manager' ? (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                {t('zoneAccess.zonesTitle')}
              </Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('zoneAccess.zonesHelp')}
              </Alert>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Autocomplete
                  options={zones.filter((z) => !zoneAssignments.some((a) => a.countryId === z.id))}
                  getOptionLabel={(o) => o.name || ''}
                  value={selectedZone}
                  onChange={(e, v) => setSelectedZone(v)}
                  renderInput={(params) => <TextField {...params} label={t('zoneAccess.selectZone')} size="small" />}
                  sx={{ flex: 1 }}
                />
                <Button variant="contained" onClick={handleAssignToZone} disabled={!selectedZone}>
                  {t('zoneAccess.assign')}
                </Button>
              </Box>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                {t('zoneAccess.assignedZones')}
              </Typography>
              <List dense>
                {zoneAssignments.map((assignment) => (
                  <ListItem key={assignment.countryId}>
                    <ListItemText primary={assignment.countryName} secondary={assignment.countryCode} />
                    <ListItemSecondaryAction>
                      <Tooltip title={t('zoneAccess.removeZone')}>
                        <IconButton edge="end" size="small" onClick={() => handleRemoveFromZone(assignment.countryId)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
                {zoneAssignments.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                    {t('zoneAccess.noZonesAssignedUser')}
                  </Typography>
                )}
              </List>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>
                {t('zoneAccess.sitesTitle')}
              </Typography>
            </Box>
          ) : null}

          <Alert severity="info" sx={{ mb: 2 }}>
            Assigning a user to a site automatically grants access to every farm area and field within it.
          </Alert>

          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              select size="small" label="Zone" sx={{ minWidth: 180 }}
              value={zoneFilter}
              onChange={(e) => { setZoneFilter(e.target.value); setSelectedSite(null); }}
            >
              <MenuItem value="">All zones</MenuItem>
              {zones.map((z) => (
                <MenuItem key={z.id} value={z.id}>{z.name}</MenuItem>
              ))}
            </TextField>
            <Autocomplete
              options={sites.filter(s =>
                !userAssignments.sites?.some(a => a.siteId === s.id) &&
                (!zoneFilter || s.countryId === zoneFilter)
              )}
              getOptionLabel={(o) => o.name || ''}
              value={selectedSite}
              onChange={(e, v) => setSelectedSite(v)}
              renderInput={(params) => <TextField {...params} label="Select Site" size="small" />}
              sx={{ flex: 1 }}
            />
            <Button variant="contained" onClick={handleAssignToSite} disabled={!selectedSite}>
              Assign
            </Button>
          </Box>

          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            Assigned sites
          </Typography>
          <List dense>
            {userAssignments.sites?.map((assignment) => (
              <ListItem key={assignment.siteId}>
                <ListItemText primary={assignment.siteName} />
                <ListItemSecondaryAction>
                  <IconButton edge="end" size="small" onClick={() => handleRemoveFromSite(assignment.siteId)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
            {(!userAssignments.sites || userAssignments.sites.length === 0) && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No sites assigned
              </Typography>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={permDialog} onClose={() => setPermDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Permissions — {permUser?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Grant extra module access beyond this user's default role permissions.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              select fullWidth size="small" label="Module"
              value={permForm.module}
              onChange={(e) => setPermForm({ ...permForm, module: e.target.value })}
            >
              {permModules.map((m) => (
                <MenuItem key={m} value={m}>{m.replace(/_/g, ' ')}</MenuItem>
              ))}
            </TextField>
            <TextField
              select size="small" label="Level" sx={{ minWidth: 120 }}
              value={permForm.permission}
              onChange={(e) => setPermForm({ ...permForm, permission: e.target.value })}
            >
              <MenuItem value="read">Read</MenuItem>
              <MenuItem value="write">Write</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </TextField>
            <Button variant="contained" size="small" onClick={handleGrantPerm} disabled={saving || !permForm.module}>
              Grant
            </Button>
          </Box>
          {permList.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No extra permissions granted.</Typography>
          ) : (
            <List dense>
              {permList.map((p) => (
                <ListItem key={p.id}>
                  <ListItemText
                    primary={`${p.module.replace(/_/g, ' ')} — ${p.permission}`}
                    secondary={`Granted by ${p.granted_by_name || 'Unknown'}`}
                  />
                  <ListItemSecondaryAction>
                    <IconButton edge="end" size="small" onClick={() => handleRevokePerm(p.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPermDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteDialog} onClose={() => !deleting && setDeleteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent>
          <Typography>
            Delete {userToDelete?.name}? They will be removed from User Management and cannot sign in.
            Historical records are kept.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)} disabled={deleting}>Cancel</Button>
          <Button onClick={handleDeleteUser} variant="contained" color="error" disabled={deleting}>
            {deleting ? <CircularProgress size={24} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UserManagement;
