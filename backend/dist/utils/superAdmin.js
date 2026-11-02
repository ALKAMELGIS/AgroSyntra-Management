"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSuperAdminEmail = isSuperAdminEmail;
const superAdminEmails = () => {
    const raw = process.env.SUPER_ADMIN_EMAILS || '';
    return new Set(raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean));
};
function isSuperAdminEmail(email) {
    if (!email)
        return false;
    return superAdminEmails().has(email.toLowerCase());
}
