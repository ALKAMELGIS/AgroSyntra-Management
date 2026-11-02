"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlatformAdminEmails = getPlatformAdminEmails;
exports.isPlatformAdminEmail = isPlatformAdminEmail;
const DEFAULT_PLATFORM_ADMIN_EMAILS = ['abdullah@elite.com'];
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function getPlatformAdminEmails() {
    const fromEnv = process.env.PLATFORM_ADMIN_EMAILS;
    if (!fromEnv)
        return DEFAULT_PLATFORM_ADMIN_EMAILS.map(normalizeEmail);
    return fromEnv.split(',').map((e) => normalizeEmail(e)).filter(Boolean);
}
function isPlatformAdminEmail(email) {
    if (!email)
        return false;
    return getPlatformAdminEmails().includes(normalizeEmail(email));
}
