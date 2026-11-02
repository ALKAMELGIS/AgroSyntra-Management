import {
  canOperateDataEntry,
  canOperateReports,
  canOperateUserManagement,
  canOperateWorkforce,
  canEditManpowerReference,
  canSubmitManpower,
  canImportManpower,
  canCreateManpowerActivity,
  canManageManpowerRoster,
  canApproveManpowerRecords,
  canModifyManpowerRecord,
  canImportCorrectManpowerRecord,
  canOperateScouting,
  canManageFieldStaff,
  canManageSeasons,
  canEditFields,
  isReadOnlyOnPage,
  isSiteScopedRole,
  getRoleLabel,
  PAGE_KEYS,
  canEditRecipes,
  canWriteOpsStock,
  canRestoreDeletedSheets,
  canEditThresholds,
  canEditGis,
  canManageIntegrations,
  canManageSystemSettings,
  canAuthorTraining,
} from '../utils/roleAccess';
import { LOGO_UPLOAD_ROLES } from '../utils/organizationLogo';
import { getSidebarSections, getVisibleNavAreas } from '../config/navAreas';

describe('roleAccess (frontend)', () => {
  const om = { role: 'operation_manager' };
  const worker = { role: 'worker' };
  const ceo = { role: 'ceo' };
  const farmManager = { role: 'farm_manager' };
  const pestAgronomist = { role: 'pest_agronomist' };
  const agronomist = { role: 'agronomist' };

  it('labels worker as Data Entry Worker', () => {
    expect(getRoleLabel('worker')).toBe('Data Entry Worker');
  });

  it('scopes site picker roles', () => {
    expect(isSiteScopedRole('operation_manager')).toBe(true);
    expect(isSiteScopedRole('worker')).toBe(true);
    // Farm managers see only sites in their zones plus directly assigned sites.
    expect(isSiteScopedRole('farm_manager')).toBe(true);
    expect(isSiteScopedRole('ceo')).toBe(false);
  });

  it('operation_manager is read-only on data entry, IPM, and workforce', () => {
    expect(isReadOnlyOnPage(om, PAGE_KEYS.DATA_ENTRY)).toBe(true);
    expect(isReadOnlyOnPage(om, PAGE_KEYS.IPM)).toBe(true);
    expect(isReadOnlyOnPage(om, PAGE_KEYS.WORKFORCE)).toBe(true);
    expect(canOperateDataEntry(om)).toBe(false);
    expect(canOperateReports(om)).toBe(true);
    expect(canOperateUserManagement(om)).toBe(true);
    expect(canOperateWorkforce(om)).toBe(false);
    expect(canEditManpowerReference(om)).toBe(true);
    expect(canEditManpowerReference(ceo)).toBe(false);
    expect(canEditManpowerReference(worker)).toBe(false);
  });

  it('ceo and farm manager are view-only on data entry, IPM, and workforce', () => {
    for (const user of [ceo, farmManager]) {
      expect(isReadOnlyOnPage(user, PAGE_KEYS.DATA_ENTRY)).toBe(true);
      expect(isReadOnlyOnPage(user, PAGE_KEYS.IPM)).toBe(true);
      expect(isReadOnlyOnPage(user, PAGE_KEYS.WORKFORCE)).toBe(true);
      expect(canOperateDataEntry(user)).toBe(false);
      expect(canOperateWorkforce(user)).toBe(false);
      expect(canOperateUserManagement(user)).toBe(true);
      expect(canOperateReports(user)).toBe(true);
    }
  });

  it('pest agronomist is view-only on data entry but can operate reports', () => {
    expect(isReadOnlyOnPage(pestAgronomist, PAGE_KEYS.DATA_ENTRY)).toBe(true);
    expect(isReadOnlyOnPage(pestAgronomist, PAGE_KEYS.IPM)).toBe(false);
    expect(canOperateDataEntry(pestAgronomist)).toBe(false);
    expect(canOperateReports(pestAgronomist)).toBe(true);
  });

  it('crop agronomist operates data entry and workforce', () => {
    expect(canOperateDataEntry(agronomist)).toBe(true);
    expect(canOperateWorkforce(agronomist)).toBe(true);
    expect(isReadOnlyOnPage(agronomist, PAGE_KEYS.DATA_ENTRY)).toBe(false);
  });

  it('worker operates data entry and workforce but not IPM apply', () => {
    expect(canOperateDataEntry(worker)).toBe(true);
    expect(canOperateWorkforce(worker)).toBe(true);
    expect(isReadOnlyOnPage(worker, PAGE_KEYS.IPM)).toBe(true);
    expect(isReadOnlyOnPage(worker, PAGE_KEYS.DASHBOARD)).toBe(true);
    expect(isReadOnlyOnPage(worker, PAGE_KEYS.DAILY_BRIEF)).toBe(true);
    expect(canOperateUserManagement(worker)).toBe(false);
  });

  it('scouter operates scouting only; IPM otherwise read-only', () => {
    const scouter = { role: 'scouter' };
    expect(getRoleLabel('scouter')).toBe('Scouter');
    expect(isSiteScopedRole('scouter')).toBe(true);
    expect(canOperateScouting(scouter)).toBe(true);
    expect(isReadOnlyOnPage(scouter, PAGE_KEYS.SCOUTING)).toBe(false);
    expect(isReadOnlyOnPage(scouter, PAGE_KEYS.IPM)).toBe(true);
    expect(canOperateWorkforce(scouter)).toBe(false);
  });

  it('operator cannot operate scouting', () => {
    const operator = { role: 'operator' };
    expect(canOperateScouting(operator)).toBe(false);
    expect(isReadOnlyOnPage(operator, PAGE_KEYS.SCOUTING)).toBe(true);
  });

  it('pest agronomist, crop agronomist, operation manager and worker manage field staff', () => {
    expect(canManageFieldStaff(pestAgronomist)).toBe(true);
    expect(canManageFieldStaff(agronomist)).toBe(true);
    expect(canManageFieldStaff(om)).toBe(true);
    expect(canManageFieldStaff(worker)).toBe(true);
  });

  it('ceo, farm manager and field staff cannot manage field staff', () => {
    expect(canManageFieldStaff(ceo)).toBe(false);
    expect(canManageFieldStaff(farmManager)).toBe(false);
    expect(canManageFieldStaff({ role: 'scouter' })).toBe(false);
    expect(canManageFieldStaff({ role: 'operator' })).toBe(false);
    expect(canManageFieldStaff(null)).toBe(false);
  });

  it('Field Staff nav item shows only for the four managing roles', () => {
    const hasFieldStaff = (user) => getVisibleNavAreas(user).includes('ipm')
      && getSidebarSections(user, 'ipm').some((s) => s.items.some((i) => i.path === '/ipm/field-staff'));
    [pestAgronomist, agronomist, om, worker].forEach((u) => expect(hasFieldStaff(u)).toBe(true));
    [ceo, farmManager, { role: 'scouter' }, { role: 'operator' }, { role: 'auditor' }]
      .forEach((u) => expect(hasFieldStaff(u)).toBe(false));
  });

  it('Farm Areas & Crops shows once for managers (Management) and for worker/agronomist (Data Entry)', () => {
    const farmAreaEntries = (user) => getVisibleNavAreas(user)
      .flatMap((area) => getSidebarSections(user, area))
      .flatMap((section) => section.items)
      .filter((item) => item.path === '/manage/farm-areas').length;
    [ceo, farmManager, om, worker, agronomist].forEach((u) => expect(farmAreaEntries(u)).toBe(1));
    [pestAgronomist, { role: 'scouter' }, { role: 'operator' }].forEach((u) => expect(farmAreaEntries(u)).toBe(0));
  });

  const navEntries = (user, path) => getVisibleNavAreas(user)
    .flatMap((area) => getSidebarSections(user, area))
    .flatMap((section) => section.items)
    .filter((item) => item.path === path).length;

  it.each(['/manage/field-types', '/manage/valves'])(
    '%s shows once for managers (Management) and for the worker (Data Entry)',
    (path) => {
      [ceo, farmManager, om, worker].forEach((u) => expect(navEntries(u, path)).toBe(1));
      [agronomist, pestAgronomist, { role: 'scouter' }, { role: 'operator' }]
        .forEach((u) => expect(navEntries(u, path)).toBe(0));
    },
  );

  it('only OM and worker edit fields and valves; farm manager and CEO watch', () => {
    const everyone = [ceo, farmManager, om, worker, agronomist, pestAgronomist, { role: 'scouter' }];
    expect(everyone.filter(canEditFields).map((u) => u.role)).toEqual(['operation_manager', 'worker']);
  });

  describe('operations and admin write roles', () => {
    const operator = { role: 'operator' };
    const auditor = { role: 'auditor' };
    const teacher = { role: 'intern_teacher' };
    const everyone = [ceo, farmManager, om, agronomist, pestAgronomist, worker, operator, auditor, teacher];
    const rolesOf = (fn) => everyone.filter(fn).map((u) => u.role);
    const navCount = (user, path) => getVisibleNavAreas(user)
      .flatMap((area) => getSidebarSections(user, area))
      .flatMap((section) => section.items)
      .filter((item) => item.path === path).length;

    it('write helpers match the API guards', () => {
      expect(rolesOf(canEditRecipes)).toEqual(['operation_manager', 'agronomist', 'worker']);
      expect(rolesOf(canWriteOpsStock)).toEqual(['operation_manager', 'worker']);
      expect(rolesOf(canRestoreDeletedSheets)).toEqual(['operation_manager', 'agronomist', 'worker']);
      expect(rolesOf(canEditThresholds)).toEqual(['ceo', 'operation_manager']);
      expect(rolesOf(canEditGis)).toEqual(['ceo', 'operation_manager']);
      expect(rolesOf(canManageIntegrations)).toEqual(['ceo', 'operation_manager']);
      expect(rolesOf(canManageSystemSettings)).toEqual(['ceo']);
      expect(rolesOf(canAuthorTraining)).toEqual(['intern_teacher']);
      expect(LOGO_UPLOAD_ROLES).toEqual(['ceo', 'farm_manager']);
    });

    it('Recipes shows once for managers, worker and agronomist', () => {
      [ceo, farmManager, om, worker, agronomist].forEach((u) => expect(navCount(u, '/manage/recipes')).toBe(1));
      [pestAgronomist, operator].forEach((u) => expect(navCount(u, '/manage/recipes')).toBe(0));
    });

    it('Inventory and GPS Tracking reach the worker through Data Entry', () => {
      expect(navCount(worker, '/inventory')).toBe(1);
      expect(navCount(worker, '/gps-tracking')).toBe(1);
      expect(navCount(agronomist, '/inventory')).toBe(0);
      [ceo, farmManager, om].forEach((u) => expect(navCount(u, '/inventory')).toBe(1));
    });

    it('Recovery shows for worker, agronomist and operation manager only', () => {
      [worker, agronomist, om].forEach((u) => expect(navCount(u, '/admin/recovery')).toBe(1));
      [ceo, farmManager, pestAgronomist].forEach((u) => expect(navCount(u, '/admin/recovery')).toBe(0));
    });

    it('API keys, webhooks and integrations hide from the farm manager; feature flags are CEO only', () => {
      ['/admin/api-keys', '/admin/webhooks', '/admin/api-integrations'].forEach((path) => {
        expect(navCount(ceo, path)).toBe(1);
        expect(navCount(om, path)).toBe(1);
        expect(navCount(farmManager, path)).toBe(0);
      });
      expect(navCount(ceo, '/admin/feature-flags')).toBe(1);
      [farmManager, om].forEach((u) => expect(navCount(u, '/admin/feature-flags')).toBe(0));
    });
  });

  it('Historical Import: worker/agronomist under Data Entry, operation manager under Admin, never CEO or farm manager', () => {
    const importEntries = (user) => getVisibleNavAreas(user)
      .flatMap((area) => getSidebarSections(user, area).map((section) => ({ area, section })))
      .flatMap(({ section }) => section.items.map((item) => ({ label: section.label, item })))
      .filter(({ item }) => item.path === '/admin/import');
    [worker, agronomist].forEach((u) => {
      const hits = importEntries(u);
      expect(hits).toHaveLength(1);
      expect(hits[0].label).toBe('DATA ENTRY');
    });
    expect(importEntries(om).map((h) => h.label)).toEqual(['ADMIN']);
    [ceo, farmManager, pestAgronomist, { role: 'scouter' }, { role: 'operator' }]
      .forEach((u) => expect(importEntries(u)).toHaveLength(0));
  });

  it('every role except worker and agronomist is read-only on data entry pages', () => {
    ['scouter', 'operator', 'auditor', 'intern_student', 'intern_teacher', 'operation_manager', 'ceo', 'farm_manager', 'pest_agronomist']
      .forEach((role) => expect(isReadOnlyOnPage({ role }, PAGE_KEYS.DATA_ENTRY)).toBe(true));
    [worker, agronomist].forEach((u) => expect(isReadOnlyOnPage(u, PAGE_KEYS.DATA_ENTRY)).toBe(false));
  });

  it('scouting reports are written by scouter, pest agronomist and agronomist only', () => {
    [{ role: 'scouter' }, pestAgronomist, agronomist].forEach((u) => {
      expect(canOperateScouting(u)).toBe(true);
      expect(isReadOnlyOnPage(u, PAGE_KEYS.SCOUTING)).toBe(false);
    });
    [ceo, farmManager, om, worker].forEach((u) => {
      expect(canOperateScouting(u)).toBe(false);
      expect(isReadOnlyOnPage(u, PAGE_KEYS.SCOUTING)).toBe(true);
    });
  });

  it('Excel re-import corrects only own pending or own imported manpower records', () => {
    const me = { role: 'worker', id: 'u-1' };
    expect(canImportCorrectManpowerRecord(me, { created_by: 'u-1', approval_status: 'pending', submission_id: 's' })).toBe(true);
    expect(canImportCorrectManpowerRecord(me, { created_by: 'u-1', approval_status: 'approved', submission_id: null })).toBe(true);
    expect(canImportCorrectManpowerRecord(me, { created_by: 'u-1', approval_status: 'approved', submission_id: 's' })).toBe(false);
    expect(canImportCorrectManpowerRecord(me, { created_by: 'u-2', approval_status: 'pending', submission_id: null })).toBe(false);
    expect(canImportCorrectManpowerRecord(me, undefined)).toBe(false);
    expect(canImportCorrectManpowerRecord({ ...om, id: 'u-1' }, { created_by: 'u-1', approval_status: 'pending' })).toBe(false);
  });

  describe('manpower days', () => {
    const operator = { role: 'operator', id: 'op-1' };
    const everyone = [om, worker, ceo, farmManager, pestAgronomist, agronomist, operator, { role: 'scouter' }];

    it('worker and operator submit; only worker imports; only the operation manager approves', () => {
      expect(everyone.filter(canSubmitManpower).map((u) => u.role)).toEqual(['worker', 'operator']);
      expect(everyone.filter(canImportManpower).map((u) => u.role)).toEqual(['worker']);
      expect(everyone.filter(canApproveManpowerRecords).map((u) => u.role)).toEqual(['operation_manager']);
    });

    it('worker and operation manager add activity names and manage the workers list', () => {
      expect(everyone.filter(canCreateManpowerActivity).map((u) => u.role)).toEqual(['operation_manager', 'worker']);
      expect(everyone.filter(canManageManpowerRoster).map((u) => u.role)).toEqual(['operation_manager', 'worker']);
    });

    it('tasks and shifts stay with worker and agronomist', () => {
      expect(everyone.filter(canOperateWorkforce).map((u) => u.role)).toEqual(['worker', 'agronomist']);
    });

    it('a submitter edits only their own pending records; the operation manager edits any', () => {
      const me = { role: 'worker', id: 'u-1' };
      expect(canModifyManpowerRecord(me, { approval_status: 'pending', created_by: 'u-1' })).toBe(true);
      expect(canModifyManpowerRecord(me, { approval_status: 'approved', created_by: 'u-1' })).toBe(false);
      expect(canModifyManpowerRecord(me, { approval_status: 'pending', created_by: 'u-2' })).toBe(false);
      expect(canModifyManpowerRecord(operator, { approval_status: 'pending', created_by: 'op-1' })).toBe(true);
      expect(canModifyManpowerRecord(om, { approval_status: 'approved', created_by: 'u-2' })).toBe(true);
      [agronomist, ceo, farmManager, pestAgronomist].forEach((user) => {
        expect(canModifyManpowerRecord({ ...user, id: 'u-1' }, { approval_status: 'pending', created_by: 'u-1' })).toBe(false);
      });
    });

    it('pest agronomist is view-only on the workforce pages', () => {
      expect(isReadOnlyOnPage(pestAgronomist, PAGE_KEYS.WORKFORCE)).toBe(true);
      expect(isReadOnlyOnPage(agronomist, PAGE_KEYS.WORKFORCE)).toBe(false);
    });
  });

  it('farm manager and operation manager manage seasons; ceo cannot', () => {
    expect(canManageSeasons(farmManager)).toBe(true);
    expect(canManageSeasons(om)).toBe(true);
    expect(canManageSeasons(ceo)).toBe(false);
    expect(canManageSeasons(agronomist)).toBe(false);
    expect(canManageSeasons(worker)).toBe(false);
  });
});
