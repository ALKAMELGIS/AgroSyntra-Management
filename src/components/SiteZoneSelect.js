import { useMemo } from 'react';
import { TextField, MenuItem, ListSubheader, Box, Typography } from '@mui/material';
import { ChevronRightOutlined as ChevronRight, LocationOnOutlined } from '@mui/icons-material';

function findSiteWithZone(countries, siteId) {
  if (!siteId) return null;
  for (const country of countries || []) {
    const site = country.sites?.find((s) => s.id === siteId);
    if (site) {
      return { site, zoneId: country.id, zoneName: country.name };
    }
  }
  return null;
}

export default function SiteZoneSelect({
  countries = [],
  value,
  onChange,
  label = 'Site',
  size = 'small',
  fullWidth = true,
  allowAllSites = true,
  noAssignmentMessage,
  sx,
}) {
  const hasSites = countries.some((c) => c.sites?.length);

  const renderValue = useMemo(() => {
    return (selected) => {
      if (!selected) {
        return allowAllSites ? <em>All Sites</em> : '';
      }
      const match = findSiteWithZone(countries, selected);
      if (match) {
        return `${match.zoneName} · ${match.site.name}`;
      }
      return selected;
    };
  }, [countries, allowAllSites]);

  if (noAssignmentMessage) {
    return (
      <Typography variant="caption" color="warning.main" sx={{ display: 'block', px: 0.5 }}>
        {noAssignmentMessage}
      </Typography>
    );
  }

  if (!hasSites) return null;

  return (
    <TextField
      select
      size={size}
      fullWidth={fullWidth}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      SelectProps={{
        displayEmpty: true,
        renderValue,
      }}
      InputLabelProps={{ shrink: true }}
      sx={{
        '& .MuiOutlinedInput-root': { bgcolor: 'background.muted' },
        '& .MuiSelect-select': { py: 1, fontSize: '0.8125rem', fontWeight: 600 },
        ...sx,
      }}
    >
      {allowAllSites && (
        <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>
          <em>All Sites</em>
        </MenuItem>
      )}
      {countries.flatMap((country) => {
        const sites = country.sites || [];
        if (sites.length === 0) return [];
        return [
          <ListSubheader
            key={`zone-${country.id}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              fontWeight: 700,
              fontSize: '0.75rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              bgcolor: 'rgba(22, 163, 74, 0.08)',
              color: 'text.primary',
              lineHeight: '32px',
              pointerEvents: 'none',
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            <ChevronRight sx={{ fontSize: 16, color: 'primary.main' }} />
            <Box component="span" sx={{ flex: 1 }}>
              {country.name}
            </Box>
            <Typography
              component="span"
              sx={{ fontSize: '0.6875rem', fontWeight: 600, color: 'text.secondary', letterSpacing: '0.04em' }}
            >
              ZONE
            </Typography>
          </ListSubheader>,
          ...sites.map((s) => (
            <MenuItem
              key={s.id}
              value={s.id}
              sx={{
                pl: 4.5,
                fontWeight: 500,
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <LocationOnOutlined sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
              {s.name}
            </MenuItem>
          )),
        ];
      })}
    </TextField>
  );
}

export { findSiteWithZone };
