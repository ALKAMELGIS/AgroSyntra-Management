import * as Yup from 'yup';

// Validation schema for valve data
export const valveSchema = Yup.object().shape({
  valveNumber: Yup.string().required('Valve number is required'),
  dripVolume: Yup.number().min(0, 'Drip volume must be positive').required('Drip volume is required'),
  drainVolume: Yup.number().min(0, 'Drain Volume must be positive').required('Drain Volume is required'),
  ecIn: Yup.number()
    .min(0.0, 'EC in must be at least 0.0')
    .max(5.0, 'EC in must be at most 5.0')
    .nullable(),
  ecOut: Yup.number()
    .min(0.0, 'EC out must be at least 0.0')
    .max(5.0, 'EC out must be at most 5.0')
    .nullable(),
  phIn: Yup.number()
    .min(4.0, 'pH in must be at least 4.0')
    .max(9.0, 'pH in must be at most 9.0')
    .nullable(),
  phOut: Yup.number()
    .min(4.0, 'pH out must be at least 4.0')
    .max(9.0, 'pH out must be at most 9.0')
    .nullable(),
  qtyOfWater: Yup.number().min(0, 'Qty Of Water must be positive').nullable(),
  cycle: Yup.number().min(0, 'Cycle must be positive').nullable(),
});

export const validationSchema = Yup.object().shape({
  date: Yup.string().required('Date is required'),
  site: Yup.string().required('Site is required'),
  farmArea: Yup.string().required('Farm Area is required'),
  field: Yup.string().required('Field is required'),
  time: Yup.string().required('Time is required'),
  valve1: valveSchema.required('Valve 1 data is required'),
  valve2: valveSchema.nullable(),
});

/** Color indicator for EC readings */
export const getECColor = (value) => {
  if (value >= 1.5 && value <= 3.0) return 'success';
  if (value >= 1.0 && value < 1.5) return 'warning';
  if (value > 3.0 && value <= 4.0) return 'warning';
  return 'error';
};

/** Color indicator for pH readings */
export const getPHColor = (value) => {
  if (value >= 5.5 && value <= 6.5) return 'success';
  if (value >= 5.0 && value < 5.5) return 'warning';
  if (value > 6.5 && value <= 7.0) return 'warning';
  return 'error';
};

export const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

/**
 * Build a full valve object with calculated fields from raw inputs.
 * Used by the form's handleSubmit and the spreadsheet save.
 */
export function calculateValveData(valve, dripperCount, dripTestCount) {
  if (!valve || !valve.dripVolume) return null;
  const dripVolume = parseFloat(valve.dripVolume) || 0;
  const drainVolume = parseFloat(valve.drainVolume) || 0;
  const testCount = dripTestCount && dripTestCount > 0 ? dripTestCount : null;
  const dripVolumeN = testCount ? dripVolume * testCount : null;
  const percentDrain = dripVolumeN && dripVolumeN > 0 && drainVolume > 0
    ? ((drainVolume / dripVolumeN) * 100).toFixed(2)
    : '0.00';
  const totalWaterBasedOnDrip = (dripVolume > 0 && dripperCount && dripperCount > 0)
    ? ((dripVolume * dripperCount) / 1000000).toFixed(3)
    : null;
  return {
    ...valve,
    dripVolumeN,
    dripVolume12: dripVolumeN,
    percentDrain,
    totalWaterBasedOnDrip: totalWaterBasedOnDrip !== null ? parseFloat(totalWaterBasedOnDrip) : null,
  };
}

/**
 * Calculate derived valve values from raw drip/drain inputs.
 * Returns { dripVolumeN, percentDrain, totalWaterBasedOnDrip }
 */
export function calculateValveMetrics(dripVolume, drainVolume, dripTestCount, dripperCount) {
  const drip = parseFloat(dripVolume) || 0;
  const drain = parseFloat(drainVolume) || 0;

  const dripVolumeN = dripTestCount && dripTestCount > 0 ? drip * dripTestCount : null;

  const percentDrain =
    dripVolumeN && dripVolumeN > 0 && drain > 0
      ? ((drain / dripVolumeN) * 100).toFixed(2)
      : '0.00';

  const totalWaterBasedOnDrip =
    drip > 0 && dripperCount && dripperCount > 0
      ? ((drip * dripperCount) / 1000000).toFixed(3)
      : null;

  return { dripVolumeN, percentDrain, totalWaterBasedOnDrip };
}
