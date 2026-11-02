"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canOperateDataEntry = canOperateDataEntry;
exports.canOperateWorkforce = canOperateWorkforce;
exports.canApproveManpowerRecords = canApproveManpowerRecords;
exports.canEditManpowerReference = canEditManpowerReference;
exports.assertCanEditManpowerReference = assertCanEditManpowerReference;
exports.assertCanApproveManpowerRecords = assertCanApproveManpowerRecords;
exports.canModifyManpowerRecord = canModifyManpowerRecord;
exports.assertCanModifyManpowerRecord = assertCanModifyManpowerRecord;
exports.canOperateScouting = canOperateScouting;
exports.assertCanOperateDataEntry = assertCanOperateDataEntry;
exports.assertCanOperateWorkforce = assertCanOperateWorkforce;
exports.assertCanOperateScouting = assertCanOperateScouting;
exports.isSiteScopedRole = isSiteScopedRole;
exports.canManageFieldStaff = canManageFieldStaff;
exports.canCreateHarvestTeamLeader = canCreateHarvestTeamLeader;
const errors_1 = require("./errors");
const DATA_ENTRY_OPERATE = new Set(['worker', 'agronomist']);
const WORKFORCE_OPERATE = new Set(['worker', 'agronomist']);
const MANPOWER_APPROVE = new Set([
    'operation_manager',
    'worker',
    'agronomist',
    'ceo',
    'farm_manager',
]);
const SCOUTING_OPERATE = new Set([
    'scouter',
    'agronomist',
    'pest_agronomist',
    'farm_manager',
    'operation_manager',
    'ceo',
]);
function canOperateDataEntry(role) {
    return DATA_ENTRY_OPERATE.has(role);
}
function canOperateWorkforce(role) {
    return WORKFORCE_OPERATE.has(role);
}
function canApproveManpowerRecords(role) {
    return MANPOWER_APPROVE.has(role);
}
function canEditManpowerReference(role) {
    return role === 'operation_manager';
}
function assertCanEditManpowerReference(actor) {
    if (!canEditManpowerReference(actor.role)) {
        throw new errors_1.AppError('Only Operation Managers can change the manpower activity reference', 'FORBIDDEN', 403);
    }
}
function assertCanApproveManpowerRecords(actor) {
    if (!canApproveManpowerRecords(actor.role)) {
        throw new errors_1.AppError('You do not have permission to approve manpower activity submissions', 'FORBIDDEN', 403);
    }
}
function canModifyManpowerRecord(actor, record) {
    if (canOperateWorkforce(actor.role))
        return true;
    if (record.approval_status === 'pending' && canApproveManpowerRecords(actor.role)) {
        return true;
    }
    return false;
}
function assertCanModifyManpowerRecord(actor, record) {
    if (!canModifyManpowerRecord(actor, record)) {
        throw new errors_1.AppError('You do not have permission to modify this manpower record', 'FORBIDDEN', 403);
    }
}
function canOperateScouting(role) {
    return SCOUTING_OPERATE.has(role);
}
function assertCanOperateDataEntry(actor) {
    if (!canOperateDataEntry(actor.role)) {
        throw new errors_1.AppError('You do not have permission to create or modify operational data entries', 'FORBIDDEN', 403);
    }
}
function assertCanOperateWorkforce(actor) {
    if (!canOperateWorkforce(actor.role)) {
        throw new errors_1.AppError('You do not have permission to create or modify workforce records', 'FORBIDDEN', 403);
    }
}
function assertCanOperateScouting(actor) {
    if (!canOperateScouting(actor.role)) {
        throw new errors_1.AppError('You do not have permission to create or modify scouting reports', 'FORBIDDEN', 403);
    }
}
function isSiteScopedRole(role) {
    return [
        'operation_manager',
        'worker',
        'agronomist',
        'pest_agronomist',
        'scouter',
        'operator',
        'auditor',
    ].includes(role);
}
function canManageFieldStaff(role) {
    return role === 'pest_agronomist'
        || role === 'ceo'
        || role === 'farm_manager'
        || role === 'operation_manager';
}
function canCreateHarvestTeamLeader(role) {
    return role === 'worker';
}
