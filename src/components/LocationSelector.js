import { useMemo, useCallback, useEffect, useRef } from 'react';
import { Grid, TextField, MenuItem } from '@mui/material';

const selectSx = {
  '& .MuiSelect-select': {
    overflow: 'visible',
    whiteSpace: 'nowrap',
    textOverflow: 'clip',
    maxWidth: 'none',
  },
};

/**
 * Reusable cascading location selector: Country -> Site -> Farm Area -> Field.
 *
 * Props:
 *   countries      – array of country objects from master data
 *   values         – Formik values object (must contain country, site, farmArea, field)
 *   errors         – Formik errors object
 *   touched        – Formik touched object
 *   setFieldValue  – Formik setFieldValue function
 *   onCountryChange – optional callback when country changes
 *   onSiteChange    – optional callback when site changes
 *   onFarmAreaChange – optional callback when farm area changes
 *   onFieldChange   – optional callback(fieldObject | null) when field changes
 *   showCountryCode – whether to show country code in display (default false)
 *   fieldLabel      – label for field dropdown (default "Field/NetHouse")
 *   gridSize        – MUI grid size for each selector (default { xs:12, sm:6, md:3 })
 */
export default function LocationSelector({
  countries = [],
  values,
  errors = {},
  touched = {},
  setFieldValue,
  onCountryChange,
  onSiteChange,
  onFarmAreaChange,
  onFieldChange,
  showCountryCode = false,
  fieldLabel = 'Field/NetHouse',
  gridSize = { xs: 12, sm: 6, md: 3 },
  defaultSiteId = '',
}) {
  const prevDefaultSite = useRef('');
  useEffect(() => {
    if (!defaultSiteId || defaultSiteId === prevDefaultSite.current) return;
    for (const c of countries) {
      const s = c.sites?.find((st) => st.id === defaultSiteId);
      if (s) {
        prevDefaultSite.current = defaultSiteId;
        setFieldValue('country', c.id);
        setFieldValue('site', s.id);
        setFieldValue('farmArea', '');
        setFieldValue('field', '');
        onCountryChange?.(c.id);
        onSiteChange?.(s.id);
        onFarmAreaChange?.('');
        onFieldChange?.(null);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSiteId, countries]);
  const selectedCountryData = useMemo(
    () => countries.find((c) => c.id === values.country),
    [countries, values.country]
  );

  const selectedSiteData = useMemo(
    () => selectedCountryData?.sites?.find((s) => s.id === values.site),
    [selectedCountryData, values.site]
  );

  const selectedFarmAreaData = useMemo(
    () => selectedSiteData?.farmAreas?.find((fa) => fa.id === values.farmArea),
    [selectedSiteData, values.farmArea]
  );

  const availableFields = useMemo(
    () => selectedFarmAreaData?.fields || [],
    [selectedFarmAreaData]
  );

  const handleCountryChange = useCallback(
    (e) => {
      const val = e.target.value;
      setFieldValue('country', val);
      setFieldValue('site', '');
      setFieldValue('farmArea', '');
      setFieldValue('field', '');
      onCountryChange?.(val);
      onSiteChange?.('');
      onFarmAreaChange?.('');
      onFieldChange?.(null);
    },
    [setFieldValue, onCountryChange, onSiteChange, onFarmAreaChange, onFieldChange]
  );

  const handleSiteChange = useCallback(
    (e) => {
      const val = e.target.value;
      setFieldValue('site', val);
      setFieldValue('farmArea', '');
      setFieldValue('field', '');
      onSiteChange?.(val);
      onFarmAreaChange?.('');
      onFieldChange?.(null);
    },
    [setFieldValue, onSiteChange, onFarmAreaChange, onFieldChange]
  );

  const handleFarmAreaChange = useCallback(
    (e) => {
      const val = e.target.value;
      setFieldValue('farmArea', val);
      setFieldValue('field', '');
      onFarmAreaChange?.(val);
      onFieldChange?.(null);
    },
    [setFieldValue, onFarmAreaChange, onFieldChange]
  );

  const handleFieldChange = useCallback(
    (e) => {
      const val = e.target.value;
      setFieldValue('field', val);
      const fieldObj = availableFields.find((f) => f.id === val) || null;
      onFieldChange?.(fieldObj);
    },
    [setFieldValue, availableFields, onFieldChange]
  );

  const countryDisplay = useCallback(
    (selected) => {
      if (!selected) return 'Select Zone';
      const c = countries.find((ct) => ct.id === selected);
      if (!c) return 'Select Zone';
      return showCountryCode ? `${c.name} (${c.code})` : c.name;
    },
    [countries, showCountryCode]
  );

  return (
    <>
      <Grid size={gridSize}>
        <TextField
          fullWidth
          select
          label="Zone"
          name="country"
          value={values.country}
          onChange={handleCountryChange}
          error={touched.country && !!errors.country}
          helperText={touched.country && errors.country}
          InputLabelProps={{ shrink: true }}
          SelectProps={{
            displayEmpty: true,
            renderValue: countryDisplay,
          }}
          sx={selectSx}
        >
          {countries.length === 0 && (
            <MenuItem value="" disabled>
              No zones available. Please add zones in Master Data.
            </MenuItem>
          )}
          {countries.map((country) => (
            <MenuItem key={country.id} value={country.id}>
              {showCountryCode ? `${country.name} (${country.code})` : country.name}
            </MenuItem>
          ))}
        </TextField>
      </Grid>

      <Grid size={gridSize}>
        <TextField
          fullWidth
          select
          label="Site"
          name="site"
          value={values.site}
          onChange={handleSiteChange}
          error={touched.site && !!errors.site}
          helperText={touched.site && errors.site}
          disabled={!values.country}
          InputLabelProps={{ shrink: true }}
          SelectProps={{
            displayEmpty: true,
            renderValue: (selected) => {
              if (!selected) return 'Select Site';
              const s = selectedCountryData?.sites?.find((st) => st.id === selected);
              return s ? s.name : 'Select Site';
            },
          }}
          sx={selectSx}
        >
          {!selectedCountryData?.sites?.length && (
            <MenuItem value="" disabled>
              No sites yet
            </MenuItem>
          )}
          {selectedCountryData?.sites?.map((site) => (
            <MenuItem key={site.id} value={site.id}>
              {site.name}
            </MenuItem>
          ))}
        </TextField>
      </Grid>

      <Grid size={gridSize}>
        <TextField
          fullWidth
          select
          label="Farm Area"
          name="farmArea"
          value={values.farmArea}
          onChange={handleFarmAreaChange}
          error={touched.farmArea && !!errors.farmArea}
          helperText={touched.farmArea && errors.farmArea}
          disabled={!values.site}
          InputLabelProps={{ shrink: true }}
          SelectProps={{
            displayEmpty: true,
            renderValue: (selected) => {
              if (!selected) return 'Select Farm Area';
              const fa = selectedSiteData?.farmAreas?.find((f) => f.id === selected);
              return fa ? fa.name : 'Select Farm Area';
            },
          }}
          sx={selectSx}
        >
          {!selectedSiteData?.farmAreas?.length && (
            <MenuItem value="" disabled>
              No farm areas yet
            </MenuItem>
          )}
          {selectedSiteData?.farmAreas?.map((farmArea) => (
            <MenuItem key={farmArea.id} value={farmArea.id}>
              {farmArea.name}
            </MenuItem>
          ))}
        </TextField>
      </Grid>

      <Grid size={gridSize}>
        <TextField
          fullWidth
          select
          label={fieldLabel}
          name="field"
          value={values.field}
          onChange={handleFieldChange}
          error={touched.field && !!errors.field}
          helperText={touched.field && errors.field}
          disabled={!values.farmArea}
          InputLabelProps={{ shrink: true }}
          SelectProps={{
            displayEmpty: true,
            renderValue: (selected) => {
              if (!selected) return `Select ${fieldLabel}`;
              const f = availableFields.find((fl) => fl.id === selected);
              return f ? f.name : `Select ${fieldLabel}`;
            },
          }}
          sx={selectSx}
        >
          {availableFields.length === 0 && (
            <MenuItem value="" disabled>
              No fields yet
            </MenuItem>
          )}
          {availableFields.map((field) => (
            <MenuItem key={field.id} value={field.id}>
              {field.name} {field.type ? `(${field.type})` : ''}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
    </>
  );
}
