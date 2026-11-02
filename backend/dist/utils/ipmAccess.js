"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENTITY_BUMBLE_BEE_BOX_INSPECTION = exports.ENTITY_PESTICIDE_APPLICATION = exports.INSPECTION_EDIT_GRACE_MS = void 0;
exports.getIpmAdminEmails = getIpmAdminEmails;
exports.isIpmAdminEmail = isIpmAdminEmail;
exports.isIpmAdmin = isIpmAdmin;
exports.canCreatePesticideApplication = canCreatePesticideApplication;
exports.canApprovePesticideApplication = canApprovePesticideApplication;
exports.canRequestApplicationChange = canRequestApplicationChange;
exports.canDirectEditDeleteApplication = canDirectEditDeleteApplication;
exports.canReviewChangeRequests = canReviewChangeRequests;
exports.canRequestInspectionChange = canRequestInspectionChange;
exports.canReviewInspectionChangeRequests = canReviewInspectionChangeRequests;
exports.canScouterDirectModifyInspection = canScouterDirectModifyInspection;
exports.assertCanRequestInspectionChange = assertCanRequestInspectionChange;
exports.assertScouterDirectInspectionModify = assertScouterDirectInspectionModify;
exports.resolveInitialApproval = resolveInitialApproval;
exports.assertCanCreateApplication = assertCanCreateApplication;
exports.assertCanApproveApplication = assertCanApproveApplication;
exports.assertCanDirectEditDelete = assertCanDirectEditDelete;
exports.assertCanRequestChange = assertCanRequestChange;
exports.assertCanReviewChanges = assertCanReviewChanges;
exports.toIpmActor = toIpmActor;
const errors_1 = require("./errors");
const DEFAULT_ADMIN_EMAILS = ['abdullah@elite.com'];
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function getIpmAdminEmails() {
    const fromEnv = process.env.IPM_ADMIN_EMAILS;
    if (!fromEnv)
        return DEFAULT_ADMIN_EMAILS.map(normalizeEmail);
    return fromEnv.split(',').map((e) => normalizeEmail(e)).filter(Boolean);
}
function isIpmAdminEmail(email) {
    if (!email)
        return false;
    return getIpmAdminEmails().includes(normalizeEmail(email));
}
function isIpmAdmin(actor) {
    return isIpmAdminEmail(actor.email);
}
function canCreatePesticideApplication(actor) {
    return isIpmAdmin(actor) || actor.role === 'pest_agronomist' || actor.role === 'operator';
}
function canApprovePesticideApplication(actor) {
    return isIpmAdmin(actor) || actor.role === 'pest_agronomist';
}
function canRequestApplicationChange(actor) {
    return actor.role === 'pest_agronomist';
}
function canDirectEditDeleteApplication(actor) {
    return isIpmAdmin(actor);
}
function canReviewChangeRequests(actor) {
    return actor.role === 'auditor' || isIpmAdmin(actor);
}
exports.INSPECTION_EDIT_GRACE_MS = 3 * 60 * 1000;
exports.ENTITY_PESTICIDE_APPLICATION = 'pesticide_application';
exports.ENTITY_BUMBLE_BEE_BOX_INSPECTION = 'bumble_bee_box_inspection';
function canRequestInspectionChange(actor) {
    return actor.role === 'scouter';
}
function canReviewInspectionChangeRequests(actor) {
    return actor.role === 'pest_agronomist' || isIpmAdmin(actor);
}
function canScouterDirectModifyInspection(actor, row) {
    if (actor.role !== 'scouter' || !row?.created_by || row.created_by !== actor.userId) {
        return false;
    }
    const created = new Date(row.created_at);
    if (Number.isNaN(created.getTime()))
        return false;
    return Date.now() - created.getTime() <= exports.INSPECTION_EDIT_GRACE_MS;
}
function assertCanRequestInspectionChange(actor) {
    if (!canRequestInspectionChange(actor)) {
        throw new errors_1.AppError('Only scouters may request bumble bee inspection changes', 'FORBIDDEN', 403);
    }
}
function assertScouterDirectInspectionModify(actor, row) {
    if (!canScouterDirectModifyInspection(actor, row)) {
        throw new errors_1.AppError('Direct edit/delete is only allowed within 3 minutes of saving your own inspection', 'FORBIDDEN', 403);
    }
}
function resolveInitialApproval(actor) {
    if (isIpmAdmin(actor) || actor.role === 'pest_agronomist') {
        return { status: 'approved', authorizedBy: actor.userId };
    }
    return { status: 'pending', authorizedBy: null };
}
function assertCanCreateApplication(actor) {
    if (!canCreatePesticideApplication(actor)) {
        throw new errors_1.AppError('Only operators and pest agronomists may create pesticide applications', 'FORBIDDEN', 403);
    }
}
function assertCanApproveApplication(actor) {
    if (!canApprovePesticideApplication(actor)) {
        throw new errors_1.AppError('Only pest agronomists may approve pesticide applications', 'FORBIDDEN', 403);
    }
}
function assertCanDirectEditDelete(actor) {
    if (!canDirectEditDeleteApplication(actor)) {
        throw new errors_1.AppError('Direct edits and deletes require a change request. Submit one for auditor review.', 'FORBIDDEN', 403);
    }
}
function assertCanRequestChange(actor) {
    if (!canRequestApplicationChange(actor)) {
        throw new errors_1.AppError('Only pest agronomists may request application changes', 'FORBIDDEN', 403);
    }
}
function assertCanReviewChanges(actor) {
    if (!canReviewChangeRequests(actor)) {
        throw new errors_1.AppError('Only auditors may review change requests', 'FORBIDDEN', 403);
    }
}
function toIpmActor(user) {
    return { userId: user.userId, email: user.email, role: user.role };
}
