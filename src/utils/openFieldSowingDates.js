import { isOpenFieldType } from './fieldTypeHelpers';

/**
 * Open field is sown in place: seeding date and transplanting date are the
 * same calendar day. Greenhouse / nethouse keep them independent.
 */
export function applyOpenFieldSowingDates(fieldType, seedingDate, transplantDate, changedKey) {
  const seeding = seedingDate || '';
  const transplant = transplantDate || '';
  if (!isOpenFieldType(fieldType)) {
    return { seedingDate: seeding, transplantDate: transplant };
  }
  if (changedKey === 'transplantDate') {
    const day = transplant || seeding;
    return { seedingDate: day, transplantDate: day };
  }
  const day = seeding || transplant;
  return { seedingDate: day, transplantDate: day };
}
