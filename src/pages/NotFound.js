import { Box, Typography, Button, Paper } from '@mui/material';
import { SentimentDissatisfiedOutlined as SadIcon, HomeOutlined as HomeIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          textAlign: 'center',
          p: 6,
          maxWidth: 480,
          borderRadius: 2,
        }}
      >
        <SadIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h2" sx={{ fontWeight: 700, mb: 1 }}>
          404
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
          Page not found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          The page you're looking for doesn't exist or has been moved.
        </Typography>
        <Button
          variant="contained"
          startIcon={<HomeIcon />}
          onClick={() => navigate('/dashboard')}
          size="large"
        >
          Back to Dashboard
        </Button>
      </Paper>
    </Box>
  );
}
