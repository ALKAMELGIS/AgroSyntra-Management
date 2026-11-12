import {
  Grid,
  TextField,
  Box,
  InputAdornment,
  Typography,
  Tooltip,
} from '@mui/material';
import {
  WaterDropOutlined as WaterDropIcon,
  CalculateOutlined as CalculateIcon,
  SettingsOutlined as SettingsIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material';

/**
 * Reusable valve form section for EC/PH Entry.
 *
 * Props:
 *   prefix          – Formik field prefix ("valve1" or "valve2")
 *   values          – Formik values[prefix] object
 *   errors          – Formik errors[prefix] object
 *   touched         – Formik touched[prefix] object
 *   handleChange    – Formik handleChange
 *   handleBlur      – Formik handleBlur
 *   dripTestCount   – number (from crop config)
 *   dripperCount    – number (from crop config)
 *   selectedCrop    – string (crop name)
 *   metrics         – { dripVolumeN, percentDrain, totalWaterBasedOnDrip, totalWaterQty }
 *   placeholder     – placeholder for valve number field (e.g., "1, 3, V1")
 *   required        – whether valve number is required
 */
export default function ValveFormSection({
  prefix,
  values,
  errors,
  touched,
  handleChange,
  handleBlur,
  dripTestCount,
  dripperCount,
  selectedCrop,
  metrics,
  placeholder = '1, 3, V1, etc.',
  required = false,
}) {
  const v = values || {};
  const e = errors || {};
  const t = touched || {};
  const { dripVolumeN, percentDrain, totalWaterBasedOnDrip, totalWaterQty } = metrics || {};

  return (
    <>
      {/* Valve Number */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>Valve</span>
                <Tooltip title="Irrigation control point. Each valve controls a section of the field." arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            name={`${prefix}.valveNumber`}
            value={v.valveNumber || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            error={t.valveNumber && !!e.valveNumber}
            helperText={t.valveNumber && e.valveNumber || `Enter valve number (e.g., ${placeholder})`}
            placeholder={placeholder}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SettingsIcon color="action" />
                </InputAdornment>
              ),
            }}
            required={required}
          />
        </Grid>
      </Grid>

      {/* EC/pH Measurements */}
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>EC/pH Measurements</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            type="number"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>EC In</span>
                <Tooltip title="Electrical Conductivity - measures nutrient concentration. In: from irrigation system. Out: from drainage." arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            name={`${prefix}.ecIn`}
            value={v.ecIn || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            error={t.ecIn && !!e.ecIn}
            helperText={t.ecIn && e.ecIn || 'Range: 0.0 - 5.0'}
            inputProps={{ min: 0.0, max: 5.0, step: 0.01 }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            type="number"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>EC Out</span>
                <Tooltip title="Electrical Conductivity - measures nutrient concentration. In: from irrigation system. Out: from drainage." arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            name={`${prefix}.ecOut`}
            value={v.ecOut || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            error={t.ecOut && !!e.ecOut}
            helperText={t.ecOut && e.ecOut || 'Range: 0.0 - 5.0'}
            inputProps={{ min: 0.0, max: 5.0, step: 0.01 }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            type="number"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>pH In</span>
                <Tooltip title="Acidity/Alkalinity scale 0-14. Affects nutrient availability. Ideal: 5.5-6.5 for most crops." arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            name={`${prefix}.phIn`}
            value={v.phIn || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            error={t.phIn && !!e.phIn}
            helperText={t.phIn && e.phIn || 'Range: 4.0 - 9.0'}
            inputProps={{ min: 4.0, max: 9.0, step: 0.01 }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            type="number"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>pH Out</span>
                <Tooltip title="Acidity/Alkalinity scale 0-14. Affects nutrient availability. Ideal: 5.5-6.5 for most crops." arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            name={`${prefix}.phOut`}
            value={v.phOut || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            error={t.phOut && !!e.phOut}
            helperText={t.phOut && e.phOut || 'Range: 4.0 - 9.0'}
            inputProps={{ min: 4.0, max: 9.0, step: 0.01 }}
          />
        </Grid>
      </Grid>

      {/* Water Volume & Drainage */}
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Water Volume & Drainage</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            type="number"
            label="Drip Volume (ml)"
            name={`${prefix}.dripVolume`}
            value={v.dripVolume || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            error={t.dripVolume && !!e.dripVolume}
            helperText={t.dripVolume && e.dripVolume}
            inputProps={{ min: 0, step: 0.01 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <WaterDropIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            type="number"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>{dripTestCount ? `${dripTestCount} Drip Volume (ml)` : 'N Drip Volume (ml)'}</span>
                <Tooltip title={dripTestCount ? `Total water from ${dripTestCount} emitters per grow bag test. Drip Volume x ${dripTestCount}.` : 'Set drip test count in master data for this crop.'} arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            value={dripVolumeN || ''}
            InputProps={{
              readOnly: true,
              startAdornment: (
                <InputAdornment position="start">
                  <CalculateIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            }}
            helperText={dripTestCount ? `Auto-calculated: Drip volume x ${dripTestCount}` : 'Set drip test count in crop master data'}
            sx={{ '& .MuiInputBase-input': { backgroundColor: 'action.hover' } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            type="number"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>Drain Volume (ml)</span>
                <Tooltip title="Drainage collected from the 4 sample growbags. Measures how much water drained out." arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            name={`${prefix}.drainVolume`}
            value={v.drainVolume || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            error={t.drainVolume && !!e.drainVolume}
            helperText={t.drainVolume && e.drainVolume}
            inputProps={{ min: 0, step: 0.01 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <WaterDropIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>%Drain</span>
                <Tooltip title={`Drainage percentage = (Drain Volume / ${dripTestCount || 'N'} Drip Volume) x 100. Ideal: 15-30% for most crops.`} arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            value={percentDrain}
            InputProps={{
              readOnly: true,
              startAdornment: (
                <InputAdornment position="start">
                  <CalculateIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            }}
            helperText={`Auto-calculated: (Drain volume / ${dripTestCount || 'N'} Drip volume) x 100`}
            sx={{ '& .MuiInputBase-input': { backgroundColor: 'action.hover' } }}
          />
        </Grid>
      </Grid>

      {/* Water Quantity */}
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Water Quantity</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            type="number"
            label="Qty Of Water (M³)"
            name={`${prefix}.qtyOfWater`}
            value={v.qtyOfWater || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            error={t.qtyOfWater && !!e.qtyOfWater}
            helperText={t.qtyOfWater && e.qtyOfWater}
            inputProps={{ min: 0, step: 0.001 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <WaterDropIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            type="number"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>Cycle</span>
                <Tooltip title="Number of irrigation cycles per day for this valve." arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            name={`${prefix}.cycle`}
            value={v.cycle || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            error={t.cycle && !!e.cycle}
            helperText={t.cycle && e.cycle}
            inputProps={{ min: 0, step: 1 }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            fullWidth
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>Total Water QTY (M³)</span>
                <Tooltip title="Total irrigation water = Qty Of Water × Cycle" arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            value={totalWaterQty || '0.000'}
            InputProps={{
              readOnly: true,
              startAdornment: (
                <InputAdornment position="start">
                  <CalculateIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            }}
            helperText="Auto-calculated: Qty Of Water × Cycle"
            sx={{ '& .MuiInputBase-input': { backgroundColor: 'action.hover' } }}
          />
        </Grid>
      </Grid>

      {/* Calculations */}
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Calculations</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <TextField
            fullWidth
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>{dripperCount && dripperCount > 0
                  ? 'Total Water Based on Drip Volume (M³)'
                  : 'Total Water Based on Drip Volume (N/A)'}</span>
                <Tooltip title={dripperCount && dripperCount > 0
                  ? `Field total water: (Drip Volume x ${dripperCount.toLocaleString()} drippers) / 1,000,000.`
                  : "This crop doesn't use drip calculation. Use Total Water QTY instead."} arrow>
                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
            }
            value={totalWaterBasedOnDrip !== null ? totalWaterBasedOnDrip : 'N/A'}
            InputProps={{
              readOnly: true,
              startAdornment: (
                <InputAdornment position="start">
                  <CalculateIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            }}
            helperText={dripperCount && dripperCount > 0
              ? `Auto-calculated: (Drip volume x ${dripperCount.toLocaleString()}) / 1,000,000`
              : selectedCrop
                ? `${selectedCrop} uses Total Water QTY only`
                : 'Select a field with a crop assigned'}
            disabled={!dripperCount || dripperCount === 0}
            sx={{
              '& .MuiInputBase-input': {
                backgroundColor: dripperCount && dripperCount > 0 ? 'action.hover' : 'action.disabledBackground',
              },
            }}
          />
        </Grid>
      </Grid>
    </>
  );
}
