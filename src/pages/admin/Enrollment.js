import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, Button, Chip, Select, MenuItem, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  IconButton, LinearProgress,
} from '@mui/material';
import { PersonAddOutlined as PersonAdd, EditOutlined as Edit } from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import InfoNote from '../../components/InfoNote';

export default function Enrollment() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [newRole, setNewRole] = useState('intern_student');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest('/users'),
    select: (res) => res.data || [],
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }) => apiRequest(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      setDialogOpen(false);
      setEditUser(null);
    },
  });

  const internUsers = users.filter(u => ['intern_student', 'intern_teacher'].includes(u.role));
  const otherUsers = users.filter(u => !['intern_student', 'intern_teacher'].includes(u.role));

  const handleAssign = (user) => {
    setEditUser(user);
    setNewRole(user.role);
    setDialogOpen(true);
  };

  const roleColor = (role) => {
    switch (role) {
      case 'intern_student': return 'info';
      case 'intern_teacher': return 'secondary';
      default: return 'default';
    }
  };

  if (isLoading) return <LinearProgress />;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Internship Enrollment
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Assign users as intern students or teachers for the training program.
      </Typography>

      <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>Enrolled Interns ({internUsers.length})</Typography>
      {internUsers.length > 0 ? (
        <Paper sx={{ mb: 4 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {internUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Chip label={u.role === 'intern_student' ? 'Student' : 'Teacher'} color={roleColor(u.role)} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleAssign(u)} aria-label="Edit">
                      <Edit fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : (
        <InfoNote mode="line" severity="info" sx={{ mb: 4 }}>No interns enrolled yet. Assign roles below.</InfoNote>
      )}

      <Typography variant="h6" sx={{ mb: 2 }}>All Users — Assign Internship Roles</Typography>
      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Current Role</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {otherUsers.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Chip label={u.role} size="small" /></TableCell>
                <TableCell align="right">
                  <Button size="small" startIcon={<PersonAdd />} onClick={() => handleAssign(u)}>
                    Assign
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign Internship Role</DialogTitle>
        <DialogContent>
          {editUser && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                User: {editUser.name} ({editUser.email})
              </Typography>
              <FormControl fullWidth margin="normal">
                <InputLabel id="enrollment-new-role-label-1">New Role</InputLabel>
                <Select labelId="enrollment-new-role-label-1" value={newRole} onChange={(e) => setNewRole(e.target.value)} label="New Role">
                  <MenuItem value="intern_student">Intern Student</MenuItem>
                  <MenuItem value="intern_teacher">Intern Teacher</MenuItem>
                  <MenuItem value="worker">Worker (remove intern role)</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => updateRoleMutation.mutate({ userId: editUser.id, role: newRole })}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
