"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const roleAccess_1 = require("../roleAccess");
const errors_1 = require("../errors");
describe('roleAccess', () => {
    describe('canOperateDataEntry', () => {
        it('allows worker and crop agronomist', () => {
            expect((0, roleAccess_1.canOperateDataEntry)('worker')).toBe(true);
            expect((0, roleAccess_1.canOperateDataEntry)('agronomist')).toBe(true);
        });
        it('denies operation_manager, ceo, farm_manager, and pest agronomist', () => {
            expect((0, roleAccess_1.canOperateDataEntry)('operation_manager')).toBe(false);
            expect((0, roleAccess_1.canOperateDataEntry)('ceo')).toBe(false);
            expect((0, roleAccess_1.canOperateDataEntry)('farm_manager')).toBe(false);
            expect((0, roleAccess_1.canOperateDataEntry)('pest_agronomist')).toBe(false);
        });
    });
    describe('canOperateWorkforce', () => {
        it('allows worker and crop agronomist', () => {
            expect((0, roleAccess_1.canOperateWorkforce)('worker')).toBe(true);
            expect((0, roleAccess_1.canOperateWorkforce)('agronomist')).toBe(true);
        });
        it('denies ceo, farm_manager, and operation_manager', () => {
            expect((0, roleAccess_1.canOperateWorkforce)('ceo')).toBe(false);
            expect((0, roleAccess_1.canOperateWorkforce)('farm_manager')).toBe(false);
            expect((0, roleAccess_1.canOperateWorkforce)('operation_manager')).toBe(false);
        });
    });
    describe('canEditManpowerReference', () => {
        it('allows operation_manager only', () => {
            expect((0, roleAccess_1.canEditManpowerReference)('operation_manager')).toBe(true);
            expect((0, roleAccess_1.canEditManpowerReference)('ceo')).toBe(false);
            expect((0, roleAccess_1.canEditManpowerReference)('farm_manager')).toBe(false);
            expect((0, roleAccess_1.canEditManpowerReference)('worker')).toBe(false);
            expect((0, roleAccess_1.canEditManpowerReference)('agronomist')).toBe(false);
        });
    });
    describe('assertCanOperateDataEntry', () => {
        it('throws FORBIDDEN for operation_manager', () => {
            expect(() => (0, roleAccess_1.assertCanOperateDataEntry)({ userId: 'u1', role: 'operation_manager' })).toThrow(errors_1.AppError);
        });
        it('throws FORBIDDEN for ceo', () => {
            expect(() => (0, roleAccess_1.assertCanOperateDataEntry)({ userId: 'u1', role: 'ceo' })).toThrow(errors_1.AppError);
        });
        it('allows worker', () => {
            expect(() => (0, roleAccess_1.assertCanOperateDataEntry)({ userId: 'u1', role: 'worker' })).not.toThrow();
        });
    });
    describe('assertCanOperateWorkforce', () => {
        it('throws FORBIDDEN for ceo', () => {
            expect(() => (0, roleAccess_1.assertCanOperateWorkforce)({ userId: 'u1', role: 'ceo' })).toThrow(errors_1.AppError);
        });
        it('allows worker', () => {
            expect(() => (0, roleAccess_1.assertCanOperateWorkforce)({ userId: 'u1', role: 'worker' })).not.toThrow();
        });
    });
    describe('isSiteScopedRole', () => {
        it('includes operation_manager, worker, and scouter', () => {
            expect((0, roleAccess_1.isSiteScopedRole)('operation_manager')).toBe(true);
            expect((0, roleAccess_1.isSiteScopedRole)('worker')).toBe(true);
            expect((0, roleAccess_1.isSiteScopedRole)('scouter')).toBe(true);
        });
        it('excludes ceo', () => {
            expect((0, roleAccess_1.isSiteScopedRole)('ceo')).toBe(false);
        });
    });
    describe('canOperateScouting', () => {
        it('allows scouter and pest agronomist', () => {
            expect((0, roleAccess_1.canOperateScouting)('scouter')).toBe(true);
            expect((0, roleAccess_1.canOperateScouting)('pest_agronomist')).toBe(true);
        });
        it('denies operator and worker', () => {
            expect((0, roleAccess_1.canOperateScouting)('operator')).toBe(false);
            expect((0, roleAccess_1.canOperateScouting)('worker')).toBe(false);
        });
        it('assertCanOperateScouting throws for operator', () => {
            expect(() => (0, roleAccess_1.assertCanOperateScouting)({ userId: 'u1', role: 'operator' })).toThrow(errors_1.AppError);
        });
    });
});
