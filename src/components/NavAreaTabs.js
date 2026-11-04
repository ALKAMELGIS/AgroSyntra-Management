import { Tabs, Tab, Box } from '@mui/material';
import { NAV_AREAS } from '../config/navAreas';
import { useShellLabel } from '../i18n/shellLabels';

export default function NavAreaTabs({ value, onChange, visibleAreaIds }) {
  const L = useShellLabel();
  const tabs = NAV_AREAS.filter((a) => visibleAreaIds.includes(a.id));

  if (tabs.length <= 1) return null;

  return (
    <Box
      sx={{
        width: '100%',
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Tabs
        value={value}
        onChange={(_, v) => onChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Workspace areas"
        sx={{
          minHeight: 44,
          px: { xs: 0, sm: 3, md: 4 },
          '& .MuiTabs-flexContainer': { gap: { xs: 0, sm: 1 } },
          '& .MuiTab-root': {
            minHeight: 44,
            py: 2,
            px: { xs: 3, sm: 3.5 },
          },
          '& .MuiTabs-scrollButtons': { width: 32 },
        }}
      >
        {tabs.map((area) => (
          <Tab key={area.id} value={area.id} label={L(area.label)} />
        ))}
      </Tabs>
    </Box>
  );
}
