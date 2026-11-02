const DEFAULT_PLATFORM_ADMIN_EMAILS = ['abdullah@elite.com'];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getPlatformAdminEmails(): string[] {
  const fromEnv = process.env.PLATFORM_ADMIN_EMAILS;
  if (!fromEnv) return DEFAULT_PLATFORM_ADMIN_EMAILS.map(normalizeEmail);
  return fromEnv.split(',').map((e) => normalizeEmail(e)).filter(Boolean);
}

export function isPlatformAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return getPlatformAdminEmails().includes(normalizeEmail(email));
}
