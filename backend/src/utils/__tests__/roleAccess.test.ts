import {
  canOperateDataEntry,
  canOperateWorkforce,
  canOperateScouting,
  canEditManpowerReference,
  canSubmitManpower,
  canImportManpower,
  canCreateManpowerActivity,
  canManageManpowerRoster,
  assertCanCreateManpowerActivity,
  assertCanManageManpowerRoster,
  canApproveManpowerRecords,
  canModifyManpowerRecord,
  assertCanSubmitManpower,
  assertCanImportManpower,
  assertCanApproveManpowerRecords,
  assertCanModifyManpowerRecord,
  assertCanOperateDataEntry,
  assertCanOperateWorkforce,
  assertCanOperateScouting,
  isSiteScopedRole,
  canManageFieldStaff,
} from '../roleAccess';
import { AppError } from '../errors';

describe('roleAccess', () => {
  describe('canOperateDataEntry', () => {
    it('allows worker and crop agronomist', () => {
      expect(canOperateDataEntry('worker')).toBe(true);
      expect(canOperateDataEntry('agronomist')).toBe(true);
    });

    it('denies operation_manager, ceo, farm_manager, and pest agronomist', () => {
      expect(canOperateDataEntry('operation_manager')).toBe(false);
      expect(canOperateDataEntry('ceo')).toBe(false);
      expect(canOperateDataEntry('farm_manager')).toBe(false);
      expect(canOperateDataEntry('pest_agronomist')).toBe(false);
    });
  });

  describe('canOperateWorkforce', () => {
    it('allows worker and crop agronomist', () => {
      expect(canOperateWorkforce('worker')).toBe(true);
      expect(canOperateWorkforce('agronomist')).toBe(true);
    });

    it('denies ceo, farm_manager, and operation_manager', () => {
      expect(canOperateWorkforce('ceo')).toBe(false);
      expect(canOperateWorkforce('farm_manager')).toBe(false);
      expect(canOperateWorkforce('operation_manager')).toBe(false);
    });
  });

  describe('canEditManpowerReference', () => {
    it('allows operation_manager only', () => {
      expect(canEditManpowerReference('operation_manager')).toBe(true);
      expect(canEditManpowerReference('ceo')).toBe(false);
      expect(canEditManpowerReference('farm_manager')).toBe(false);
      expect(canEditManpowerReference('worker')).toBe(false);
      expect(canEditManpowerReference('agronomist')).toBe(false);
    });
  });

  describe('manpower permissions', () => {
    const ALL_ROLES = [
      'ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist',
      'scouter', 'worker', 'operator', 'auditor', 'intern_student', 'intern_teacher',
    ] as const;

    it('only worker and operator submit manpower days', () => {
      const allowed = ALL_ROLES.filter((role) => canSubmitManpower(role));
      expect(allowed).toEqual(['worker', 'operator']);
      expect(() => assertCanSubmitManpower({ userId: 'u1', role: 'agronomist' })).toThrow(AppError);
      expect(() => assertCanSubmitManpower({ userId: 'u1', role: 'operator' })).not.toThrow();
    });

    it('only worker imports manpower from Excel', () => {
      const allowed = ALL_ROLES.filter((role) => canImportManpower(role));
      expect(allowed).toEqual(['worker']);
      expect(() => assertCanImportManpower({ userId: 'u1', role: 'operator' })).toThrow(AppError);
      expect(() => assertCanImportManpower({ userId: 'u1', role: 'agronomist' })).toThrow(AppError);
    });

    it('only the operation manager approves manpower', () => {
      const allowed = ALL_ROLES.filter((role) => canApproveManpowerRecords(role));
      expect(allowed).toEqual(['operation_manager']);
      for (const role of ['worker', 'agronomist', 'ceo', 'farm_manager', 'pest_agronomist', 'operator'] as const) {
        expect(() => assertCanApproveManpowerRecords({ userId: 'u1', role })).toThrow(AppError);
      }
    });

    it('worker and operation manager add activity names and manage the workers list', () => {
      expect(ALL_ROLES.filter((role) => canCreateManpowerActivity(role))).toEqual(['operation_manager', 'worker']);
      expect(ALL_ROLES.filter((role) => canManageManpowerRoster(role))).toEqual(['operation_manager', 'worker']);
      for (const role of ['agronomist', 'ceo', 'farm_manager', 'pest_agronomist', 'operator'] as const) {
        expect(() => assertCanCreateManpowerActivity({ userId: 'u1', role })).toThrow(AppError);
        expect(() => assertCanManageManpowerRoster({ userId: 'u1', role })).toThrow(AppError);
      }
      // Pivot column / reference stay operation-manager only.
      expect(canEditManpowerReference('worker')).toBe(false);
    });

    it('does not change who operates tasks and shifts', () => {
      expect(canOperateWorkforce('agronomist')).toBe(true);
      expect(canOperateWorkforce('worker')).toBe(true);
      expect(canOperateWorkforce('operator')).toBe(false);
    });

    describe('canModifyManpowerRecord', () => {
      const own = (status: string) => ({ approval_status: status, created_by: 'u1' });
      const others = (status: string) => ({ approval_status: status, created_by: 'u2' });

      it('lets a submitter edit only their own pending records', () => {
        for (const role of ['worker', 'operator'] as const) {
          const actor = { userId: 'u1', role };
          expect(canModifyManpowerRecord(actor, own('pending'))).toBe(true);
          expect(canModifyManpowerRecord(actor, own('approved'))).toBe(false);
          expect(canModifyManpowerRecord(actor, own('rejected'))).toBe(false);
          expect(canModifyManpowerRecord(actor, others('pending'))).toBe(false);
          expect(canModifyManpowerRecord(actor, { approval_status: 'pending', created_by: null })).toBe(false);
        }
      });

      it('lets the operation manager edit any record', () => {
        const om = { userId: 'om', role: 'operation_manager' as const };
        expect(canModifyManpowerRecord(om, others('pending'))).toBe(true);
        expect(canModifyManpowerRecord(om, others('approved'))).toBe(true);
      });

      it('blocks agronomist, ceo, farm manager and pest agronomist', () => {
        for (const role of ['agronomist', 'ceo', 'farm_manager', 'pest_agronomist'] as const) {
          const actor = { userId: 'u1', role };
          expect(canModifyManpowerRecord(actor, own('pending'))).toBe(false);
          expect(() => assertCanModifyManpowerRecord(actor, own('pending'))).toThrow(AppError);
        }
      });
    });
  });

  describe('assertCanOperateDataEntry', () => {
    it('throws FORBIDDEN for operation_manager', () => {
      expect(() => assertCanOperateDataEntry({ userId: 'u1', role: 'operation_manager' })).toThrow(AppError);
    });

    it('throws FORBIDDEN for ceo', () => {
      expect(() => assertCanOperateDataEntry({ userId: 'u1', role: 'ceo' })).toThrow(AppError);
    });

    it('allows worker', () => {
      expect(() => assertCanOperateDataEntry({ userId: 'u1', role: 'worker' })).not.toThrow();
    });
  });

  describe('assertCanOperateWorkforce', () => {
    it('throws FORBIDDEN for ceo', () => {
      expect(() => assertCanOperateWorkforce({ userId: 'u1', role: 'ceo' })).toThrow(AppError);
    });

    it('allows worker', () => {
      expect(() => assertCanOperateWorkforce({ userId: 'u1', role: 'worker' })).not.toThrow();
    });
  });

  describe('isSiteScopedRole', () => {
    it('includes operation_manager, worker, and scouter', () => {
      expect(isSiteScopedRole('operation_manager')).toBe(true);
      expect(isSiteScopedRole('worker')).toBe(true);
      expect(isSiteScopedRole('scouter')).toBe(true);
    });

    it('excludes ceo', () => {
      expect(isSiteScopedRole('ceo')).toBe(false);
    });
  });

  describe('canOperateScouting', () => {
    it('allows scouter and pest agronomist', () => {
      expect(canOperateScouting('scouter')).toBe(true);
      expect(canOperateScouting('pest_agronomist')).toBe(true);
    });

    it('denies operator and worker', () => {
      expect(canOperateScouting('operator')).toBe(false);
      expect(canOperateScouting('worker')).toBe(false);
    });

    it('assertCanOperateScouting throws for operator', () => {
      expect(() => assertCanOperateScouting({ userId: 'u1', role: 'operator' })).toThrow(AppError);
    });
  });

  describe('canManageFieldStaff', () => {
    it('allows pest agronomist, crop agronomist, operation manager and worker', () => {
      for (const role of ['pest_agronomist', 'agronomist', 'operation_manager', 'worker'] as const) {
        expect(canManageFieldStaff(role)).toBe(true);
      }
    });

    it('denies ceo, farm manager and field staff themselves', () => {
      for (const role of ['ceo', 'farm_manager', 'scouter', 'operator'] as const) {
        expect(canManageFieldStaff(role)).toBe(false);
      }
    });
  });
});
