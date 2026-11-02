const DEFAULT_PLATFORM_ADMIN_EMAILS = ['abdullah@elite.com'];

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function isPlatformAdminEmail(email) {
  if (!email) return false;
  return DEFAULT_PLATFORM_ADMIN_EMAILS.map(normalizeEmail).includes(normalizeEmail(email));
}

export function canManageUser(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false;
  if (currentUser.id === targetUser.id) return true;
  if (isPlatformAdminEmail(currentUser.email)) return true;
  const hierarchy = {
    ceo: 5,
    farm_manager: 4,
    operation_manager: 3,
    agronomist: 2,
    pest_agronomist: 2,
    intern_teacher: 2,
    auditor: 2,
    operator: 1,
    scouter: 1,
    worker: 1,
    intern_student: 0,
  };
  const currentLevel = hierarchy[currentUser.role] ?? 0;
  const targetLevel = hierarchy[targetUser.role] ?? 0;
  return currentLevel > targetLevel;
}
