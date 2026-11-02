/** Optional workforce fields: activity, target, actual, hours — missing detection. */



function isNonEmpty(value) {

  return value != null && String(value).trim() !== '';

}



export function isMissingActivity(value) {

  if (value == null) return true;

  return String(value).trim() === '';

}



export function isMissingTarget(value) {

  if (value === '' || value == null) return true;

  const n = Number(value);

  return Number.isNaN(n);

}



export function isMissingActual(value) {

  if (value === '' || value == null) return true;

  const n = Number(value);

  return Number.isNaN(n);

}



/**

 * @param {{ workHours?, work_hours?, startTime?, start_time?, endTime?, end_time? }} record

 */

export function isMissingHours(record) {

  if (!record) return true;

  const wh = record.workHours ?? record.work_hours;

  if (wh !== '' && wh != null && !Number.isNaN(Number(wh))) {

    return false;

  }

  const start = record.startTime ?? record.start_time;

  const end = record.endTime ?? record.end_time;

  if (start && end) {

    const toMin = (t) => {

      const s = String(t).substring(0, 5);

      const [h, m] = s.split(':').map(Number);

      return h * 60 + m;

    };

    const mins = toMin(end) - toMin(start);

    return mins <= 0;

  }

  return true;

}



/** True when the block has no optional or mandatory field values. */

export function blockIsBlank(blk) {

  if (!blk) return true;

  const fields = [

    blk.activity,

    blk.location,

    blk.section,

    blk.startTime,

    blk.endTime,

    blk.target,

    blk.actual,

    blk.unit,

    blk.variety,

  ];

  return !fields.some(isNonEmpty);

}



export function blockTimesValid(blk) {

  if (!blk || !isNonEmpty(blk.startTime) || !isNonEmpty(blk.endTime)) return false;

  const toMin = (t) => {

    const s = String(t).substring(0, 5);

    const [h, m] = s.split(':').map(Number);

    return h * 60 + m;

  };

  return toMin(blk.endTime) - toMin(blk.startTime) > 0;

}



/** Mandatory per block: location, section, variety, start/end times; unit when activity set. */

export function blockMeetsRequiredFields(blk) {

  if (!blk) return false;

  if (!isNonEmpty(blk.location)) return false;

  if (!isNonEmpty(blk.section)) return false;

  if (!isNonEmpty(blk.variety)) return false;

  if (!blockTimesValid(blk)) return false;

  if (isNonEmpty(blk.activity) && !isNonEmpty(blk.unit)) return false;

  return true;

}



/** User-facing message for the first failed mandatory rule. */

export function getBlockValidationError(blk) {

  if (!blk) return 'Activity block is incomplete';

  if (!isNonEmpty(blk.location)) return 'Location is required';

  if (!isNonEmpty(blk.section)) return 'Section is required';

  if (!isNonEmpty(blk.variety)) return 'Variety is required';

  if (!isNonEmpty(blk.startTime) || !isNonEmpty(blk.endTime)) {

    return 'Start and end times are required';

  }

  if (!blockTimesValid(blk)) return 'End time must be after start time';

  if (isNonEmpty(blk.activity) && !isNonEmpty(blk.unit)) {

    return 'Unit is required when activity is filled';

  }

  return 'Activity block is incomplete';

}

/** Per-field messages for inline mandatory errors; empty when block is blank (unless force). */
export function getBlockMandatoryErrors(blk, options = {}) {
  if (!blk) return {};
  if (!options.force && blockIsBlank(blk)) return {};
  const errors = {};
  if (!isNonEmpty(blk.location)) errors.location = 'Required';
  if (!isNonEmpty(blk.section)) errors.section = 'Required';
  if (!isNonEmpty(blk.variety)) errors.variety = 'Required';
  if (!isNonEmpty(blk.startTime)) errors.startTime = 'Required';
  if (!isNonEmpty(blk.endTime)) errors.endTime = 'Required';
  if (isNonEmpty(blk.startTime) && isNonEmpty(blk.endTime) && !blockTimesValid(blk)) {
    errors.endTime = 'Must be after start';
  }
  if (isNonEmpty(blk.activity) && !isNonEmpty(blk.unit)) {
    errors.unit = 'Required with activity';
  }
  return errors;
}

export function isMandatoryValueEmpty(value) {
  return !isNonEmpty(value);
}

export function importRowToBlock(row, baseIndex) {

  const base = baseIndex;

  const get = (i) => row[base + i];

  return {

    activity: get(0),

    unit: get(1),

    variety: get(2),

    location: get(3),

    section: get(4),

    startTime: get(5),

    endTime: get(6),

    target: get(7),

    actual: get(8),

  };

}



export function importRowIsBlank(row, baseIndex) {

  return blockIsBlank(importRowToBlock(row, baseIndex));

}



export function importRowMeetsRequiredFields(row, baseIndex) {

  const blk = importRowToBlock(row, baseIndex);

  return blockMeetsRequiredFields(blk);

}



export function formatOptionalHours(record) {

  if (isMissingHours(record)) return null;

  const wh = record.workHours ?? record.work_hours;

  if (wh !== '' && wh != null && !Number.isNaN(Number(wh))) {

    return Number(wh);

  }

  const start = record.startTime ?? record.start_time;

  const end = record.endTime ?? record.end_time;

  const toMin = (t) => {

    const s = String(t).substring(0, 5);

    const [h, m] = s.split(':').map(Number);

    return h * 60 + m;

  };

  return +(((toMin(end) - toMin(start)) / 60).toFixed(2));

}


