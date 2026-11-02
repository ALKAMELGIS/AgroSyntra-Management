const superAdminEmails = (): Set<string> => {
  const raw = process.env.SUPER_ADMIN_EMAILS || '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
};

export function isSuperAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return superAdminEmails().has(email.toLowerCase());
}
