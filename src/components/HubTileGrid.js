import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardActionArea, CardContent, Grid, Chip, Paper,
} from '@mui/material';
import DashboardSection from './dashboard/DashboardSection';

export default function HubTileGrid({ sections, userName, subtitle }) {
  const navigate = useNavigate();

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', py: 2, px: 1 }}>
      <Paper variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
        <Box
          sx={{
            bgcolor: 'table.headerBg',
            color: 'table.headerText',
            px: 2.5,
            py: 2,
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.35rem', color: 'inherit', mb: 0.5 }}>
            {greeting}, {userName?.split(' ')[0] || 'there'}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ color: 'inherit', opacity: 0.9, mb: 1 }}>
              {subtitle}
            </Typography>
          )}
          <Chip
            label={dateLabel}
            size="small"
            sx={{
              fontWeight: 500,
              fontSize: '0.75rem',
              bgcolor: 'rgba(255,255,255,0.18)',
              color: 'inherit',
              border: 0,
            }}
          />
        </Box>
      </Paper>

      {sections.map((section) => (
        <DashboardSection key={section.title} title={section.title}>
          <Box sx={{ p: 1.5 }}>
            <Grid container spacing={1.25}>
              {section.tiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <Grid item xs={6} sm={4} md={3} key={tile.path}>
                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 1,
                        borderColor: 'divider',
                        transition: 'border-color 0.15s, background-color 0.15s',
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: 'table.rowHover',
                        },
                      }}
                    >
                      <CardActionArea onClick={() => navigate(tile.path)} sx={{ p: 1.5 }}>
                        <CardContent
                          sx={{
                            p: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            gap: 1,
                            '&:last-child': { pb: 0 },
                          }}
                        >
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              borderRadius: 1,
                              bgcolor: 'table.sectionBg',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Icon sx={{ fontSize: 22, color: 'primary.main' }} />
                          </Box>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.primary', lineHeight: 1.3 }}>
                            {tile.label}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        </DashboardSection>
      ))}
    </Box>
  );
}
