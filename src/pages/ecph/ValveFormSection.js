import { TextField } from '@mui/material';
import { FormGrid, GroupLabel, HintLabel, calcFieldSx, span } from '../../components/form/FormLayout';

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
 *
 * Layout: one dense grid, four fields per row on desktop and two on phones,
 * in the order the reading is taken (valve → EC/pH → drip/drain → water).
 * Ranges and formulas live in the placeholder and the label hint instead of an
 * always-visible helper line, so each row is one input tall.
 */
const EC_HINT = 'Electrical conductivity: nutrient concentration. In = irrigation line, Out = drainage. Range 0.0–5.0';
const PH_HINT = 'Acidity scale. Affects nutrient availability; ideal 5.5–6.5 for most crops. Range 4.0–9.0';

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
  const err = (k) => (t[k] && e[k]) || undefined;
  const hasDrip = !!(dripperCount && dripperCount > 0);

  const num = (key, label, inputProps, extra = {}) => (
    <TextField
      fullWidth
      type="number"
      label={label}
      name={`${prefix}.${key}`}
      value={v[key] || ''}
      onChange={handleChange}
      onBlur={handleBlur}
      error={!!err(key)}
      helperText={err(key)}
      inputProps={{ inputMode: 'decimal', ...inputProps }}
      {...extra}
    />
  );

  return (
    <FormGrid columns={{ xs: 2, md: 4 }}>
      <TextField
        fullWidth
        label={<HintLabel hint="Irrigation control point. Each valve controls a section of the field.">Valve</HintLabel>}
        name={`${prefix}.valveNumber`}
        value={v.valveNumber || ''}
        onChange={handleChange}
        onBlur={handleBlur}
        error={!!err('valveNumber')}
        helperText={err('valveNumber')}
        placeholder={placeholder}
        required={required}
      />
      {num('cycle', <HintLabel hint="Number of irrigation cycles per day for this valve.">Cycle</HintLabel>, { min: 0, step: 1, inputMode: 'numeric' })}
      {num('qtyOfWater', 'Qty of water (m³)', { min: 0, step: 0.001 })}
      <TextField
        fullWidth
        label={<HintLabel hint="Qty of water × Cycle">Total water qty (m³)</HintLabel>}
        value={totalWaterQty || '0.000'}
        InputProps={{ readOnly: true }}
        sx={calcFieldSx}
      />

      <GroupLabel>EC / pH</GroupLabel>
      {num('ecIn', <HintLabel hint={EC_HINT}>EC in</HintLabel>, { min: 0, max: 5, step: 0.01 }, { placeholder: '0.0 – 5.0' })}
      {num('ecOut', <HintLabel hint={EC_HINT}>EC out</HintLabel>, { min: 0, max: 5, step: 0.01 }, { placeholder: '0.0 – 5.0' })}
      {num('phIn', <HintLabel hint={PH_HINT}>pH in</HintLabel>, { min: 4, max: 9, step: 0.01 }, { placeholder: '4.0 – 9.0' })}
      {num('phOut', <HintLabel hint={PH_HINT}>pH out</HintLabel>, { min: 4, max: 9, step: 0.01 }, { placeholder: '4.0 – 9.0' })}

      <GroupLabel>Drip and drainage</GroupLabel>
      {num('dripVolume', 'Drip volume (ml)', { min: 0, step: 0.01 })}
      <TextField
        fullWidth
        label={(
          <HintLabel hint={dripTestCount ? `Drip volume × ${dripTestCount} emitters per grow-bag test` : 'Set the drip test count in crop master data'}>
            {dripTestCount ? `${dripTestCount}× drip volume (ml)` : 'N× drip volume (ml)'}
          </HintLabel>
        )}
        value={dripVolumeN || ''}
        placeholder={dripTestCount ? '' : 'Set test count'}
        InputLabelProps={{ shrink: true }}
        InputProps={{ readOnly: true }}
        sx={calcFieldSx}
      />
      {num('drainVolume', <HintLabel hint="Drainage collected from the sample grow bags">Drain volume (ml)</HintLabel>, { min: 0, step: 0.01 })}
      <TextField
        fullWidth
        label={<HintLabel hint={`(Drain volume ÷ ${dripTestCount || 'N'}× drip volume) × 100. Ideal 15–30% for most crops`}>Drain %</HintLabel>}
        value={percentDrain}
        InputProps={{ readOnly: true }}
        sx={calcFieldSx}
      />

      <TextField
        fullWidth
        label={(
          <HintLabel hint={hasDrip
            ? `(Drip volume × ${dripperCount.toLocaleString()} drippers) ÷ 1,000,000`
            : "This crop doesn't use drip calculation; use Total water qty"}
          >
            Total water from drip (m³)
          </HintLabel>
        )}
        value={totalWaterBasedOnDrip !== null && totalWaterBasedOnDrip !== undefined ? totalWaterBasedOnDrip : ''}
        placeholder={hasDrip ? '' : (selectedCrop ? `${selectedCrop}: not drip based` : 'Select a field with a crop')}
        InputLabelProps={{ shrink: true }}
        InputProps={{ readOnly: true }}
        disabled={!hasDrip}
        sx={{ ...calcFieldSx, ...span({ xs: 2, md: 2 }) }}
      />
    </FormGrid>
  );
}
