import {
  badgeCountForRole,
  canReviewEntityChangeRequest,
  ENTITY_BIO_FIELD_SETUP,
  ENTITY_MANPOWER_RECORD,
  ENTITY_PESTICIDE_APPLICATION,
  ENTITY_SEASON_REOPEN,
  getReviewableEntityTypes,
  reviewerRolesForEntityType,
} from '../changeRequestAccess';
import { IpmActor } from '../ipmAccess';

const auditor: IpmActor = { userId: 'a1', email: 'auditor@test.com', role: 'auditor' };
const ceo: IpmActor = { userId: 'c1', email: 'ceo@test.com', role: 'ceo' };

describe('changeRequestAccess season reopen', () => {
  it('lets only auditors review season reopen requests', () => {
    expect(canReviewEntityChangeRequest(auditor, ENTITY_SEASON_REOPEN)).toBe(true);
    expect(canReviewEntityChangeRequest(ceo, ENTITY_SEASON_REOPEN)).toBe(false);
  });

  it('includes season reopen in the auditor review list', () => {
    expect(getReviewableEntityTypes(auditor)).toContain(ENTITY_SEASON_REOPEN);
    expect(getReviewableEntityTypes(ceo)).not.toContain(ENTITY_SEASON_REOPEN);
  });

  it('adds pending season reopens to the auditor badge only', () => {
    const counts = {
      pesticideApplicationCount: 1,
      bumbleBeeInspectionCount: 0,
      manpowerRecordCount: 2,
      seasonReopenCount: 4,
      totalCount: 7,
    };
    expect(badgeCountForRole(auditor, counts)).toBe(5);
    // Manpower change requests go to the operation manager only.
    expect(badgeCountForRole(ceo, counts)).toBe(0);
    expect(badgeCountForRole({ userId: 'o1', email: 'om@test.com', role: 'operation_manager' }, counts)).toBe(2);
  });

  it('lets only the operation manager review manpower change requests', () => {
    const om: IpmActor = { userId: 'o1', email: 'om@test.com', role: 'operation_manager' };
    expect(canReviewEntityChangeRequest(om, ENTITY_MANPOWER_RECORD)).toBe(true);
    for (const role of ['ceo', 'farm_manager', 'agronomist', 'worker', 'operator', 'pest_agronomist'] as const) {
      expect(canReviewEntityChangeRequest({ userId: 'x', email: 'x@test.com', role }, ENTITY_MANPOWER_RECORD)).toBe(false);
    }
    expect(reviewerRolesForEntityType(ENTITY_MANPOWER_RECORD)).toEqual(['operation_manager']);
  });

  it('lets the pest agronomist review biological control table deletes and counts them in the badge', () => {
    const pestAgronomist: IpmActor = { userId: 'p1', email: 'pa@test.com', role: 'pest_agronomist' };
    const scouter: IpmActor = { userId: 's1', email: 's@test.com', role: 'scouter' };
    expect(canReviewEntityChangeRequest(pestAgronomist, ENTITY_BIO_FIELD_SETUP)).toBe(true);
    expect(canReviewEntityChangeRequest(scouter, ENTITY_BIO_FIELD_SETUP)).toBe(false);
    expect(canReviewEntityChangeRequest(auditor, ENTITY_BIO_FIELD_SETUP)).toBe(false);
    expect(getReviewableEntityTypes(pestAgronomist)).toContain(ENTITY_BIO_FIELD_SETUP);
    const counts = {
      pesticideApplicationCount: 1,
      bumbleBeeInspectionCount: 2,
      manpowerRecordCount: 0,
      seasonReopenCount: 0,
      bioFieldSetupCount: 3,
      totalCount: 6,
    };
    expect(badgeCountForRole(pestAgronomist, counts)).toBe(5);
    expect(badgeCountForRole(auditor, counts)).toBe(1);
  });

  it('does not treat CEO as an IPM-admin reviewer of pesticide apps unless the email is admin', () => {
    expect(canReviewEntityChangeRequest(ceo, ENTITY_PESTICIDE_APPLICATION)).toBe(false);
  });
});
