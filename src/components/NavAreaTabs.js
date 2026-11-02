import { Tabs, Tab, Box } from '@mui/material';
import { NAV_AREAS } from '../config/navAreas';

export default function NavAreaTabs({ value, onChange, visibleAreaIds }) {
  const tabs = NAV_AREAS.filter((a) => visibleAreaIds.includes(a.id));

  if (tabs.length <= 1) return null;

  return (
    <Box
      sx={{
        width: '100%',
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Tabs
        value={value}
        onChange={(_, v) => onChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 40,
          px: 1,
          '& .MuiTab-root': {
            minHeight: 40,
            py: 0.75,
            px: 2,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8125rem',
          },
        }}
      >
        {tabs.map((area) => (
          <Tab key={area.id} value={area.id} label={area.label} />
        ))}
      </Tabs>
    </Box>
  );
}
