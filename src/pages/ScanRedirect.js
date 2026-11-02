import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography, Alert, Button } from '@mui/material';

export default function ScanRedirect() {
  const { fieldId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (fieldId) {
      sessionStorage.setItem('scannedFieldId', fieldId);
      navigate('/harvest/entry', { state: { preselectedFieldId: fieldId }, replace: true });
    }
  }, [fieldId, navigate]);

  if (!fieldId) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 2 }}>
        <Alert severity="error">Invalid QR code: no field ID found.</Alert>
        <Button variant="contained" onClick={() => navigate('/')}>Go to Dashboard</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <CircularProgress sx={{ mb: 2 }} />
      <Typography>Redirecting to field entry...</Typography>
    </Box>
  );
}
