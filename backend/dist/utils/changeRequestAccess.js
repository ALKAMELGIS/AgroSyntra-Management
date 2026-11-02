"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENTITY_SEASON_REOPEN = exports.ENTITY_MANPOWER_RECORD = exports.ENTITY_PESTICIDE_APPLICATION = exports.ENTITY_BUMBLE_BEE_BOX_INSPECTION = void 0;
exports.canReviewManpowerChangeRequests = canReviewManpowerChangeRequests;
exports.canReviewEntityChangeRequest = canReviewEntityChangeRequest;
exports.getReviewableEntityTypes = getReviewableEntityTypes;
exports.canListChangeRequests = canListChangeRequests;
exports.assertCanReviewEntityChangeRequest = assertCanReviewEntityChangeRequest;
exports.badgeCountForRole = badgeCountForRole;
exports.reviewerRolesForEntityType = reviewerRolesForEntityType;
const errors_1 = require("./errors");
const ipmAccess_1 = require("./ipmAccess");
Object.defineProperty(exports, "ENTITY_BUMBLE_BEE_BOX_INSPECTION", { enumerable: true, get: function () { return ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION; } });
Object.defineProperty(exports, "ENTITY_PESTICIDE_APPLICATION", { enumerable: true, get: function () { return ipmAccess_1.ENTITY_PESTICIDE_APPLICATION; } });
exports.ENTITY_MANPOWER_RECORD = 'manpower_record';
exports.ENTITY_SEASON_REOPEN = 'season_reopen';
const MANPOWER_CHANGE_REVIEW_ROLES = new Set(['operation_manager', 'farm_manager', 'ceo']);
function canReviewManpowerChangeRequests(actor) {
    return (0, ipmAccess_1.isIpmAdmin)(actor) || MANPOWER_CHANGE_REVIEW_ROLES.has(actor.role);
}
function canReviewEntityChangeRequest(actor, entityType) {
    switch (entityType) {
        case ipmAccess_1.ENTITY_PESTICIDE_APPLICATION:
            return actor.role === 'auditor' || (0, ipmAccess_1.isIpmAdmin)(actor);
        case ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION:
            return actor.role === 'pest_agronomist' || (0, ipmAccess_1.isIpmAdmin)(actor);
        case exports.ENTITY_MANPOWER_RECORD:
            return canReviewManpowerChangeRequests(actor);
        case exports.ENTITY_SEASON_REOPEN:
            return actor.role === 'auditor';
        default:
            return false;
    }
}
function getReviewableEntityTypes(actor) {
    const types = [];
    if (canReviewEntityChangeRequest(actor, ipmAccess_1.ENTITY_PESTICIDE_APPLICATION)) {
        types.push(ipmAccess_1.ENTITY_PESTICIDE_APPLICATION);
    }
    if (canReviewEntityChangeRequest(actor, ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION)) {
        types.push(ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION);
    }
    if (canReviewEntityChangeRequest(actor, exports.ENTITY_MANPOWER_RECORD)) {
        types.push(exports.ENTITY_MANPOWER_RECORD);
    }
    if (canReviewEntityChangeRequest(actor, exports.ENTITY_SEASON_REOPEN)) {
        types.push(exports.ENTITY_SEASON_REOPEN);
    }
    return types;
}
function canListChangeRequests(actor) {
    return getReviewableEntityTypes(actor).length > 0;
}
function assertCanReviewEntityChangeRequest(actor, entityType) {
    if (!canReviewEntityChangeRequest(actor, entityType)) {
        switch (entityType) {
            case ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION:
                throw new errors_1.AppError('Only pest agronomists may review bumble bee inspection change requests', 'FORBIDDEN', 403);
            case exports.ENTITY_MANPOWER_RECORD:
                throw new errors_1.AppError('Only operation managers, farm managers, and CEOs may review manpower change requests', 'FORBIDDEN', 403);
            case ipmAccess_1.ENTITY_PESTICIDE_APPLICATION:
            case exports.ENTITY_SEASON_REOPEN:
                throw new errors_1.AppError('Only auditors may review change requests', 'FORBIDDEN', 403);
            default:
                throw new errors_1.AppError('Unsupported change request entity type', 'VALIDATION_ERROR', 400);
        }
    }
}
function badgeCountForRole(actor, counts) {
    let count = 0;
    if (canReviewEntityChangeRequest(actor, ipmAccess_1.ENTITY_PESTICIDE_APPLICATION)) {
        count += counts.pesticideApplicationCount;
    }
    if (canReviewEntityChangeRequest(actor, ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION)) {
        count += counts.bumbleBeeInspectionCount;
    }
    if (canReviewEntityChangeRequest(actor, exports.ENTITY_MANPOWER_RECORD)) {
        count += counts.manpowerRecordCount;
    }
    if (canReviewEntityChangeRequest(actor, exports.ENTITY_SEASON_REOPEN)) {
        count += counts.seasonReopenCount;
    }
    return count;
}
function reviewerRolesForEntityType(entityType) {
    switch (entityType) {
        case ipmAccess_1.ENTITY_PESTICIDE_APPLICATION:
            return ['auditor'];
        case ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION:
            return ['pest_agronomist'];
        case exports.ENTITY_MANPOWER_RECORD:
            return ['operation_manager', 'farm_manager', 'ceo'];
        case exports.ENTITY_SEASON_REOPEN:
            return ['auditor'];
        default: {
            const _exhaustive = entityType;
            return _exhaustive;
        }
    }
}
