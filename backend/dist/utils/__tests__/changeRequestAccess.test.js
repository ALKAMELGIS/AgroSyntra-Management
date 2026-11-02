"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const changeRequestAccess_1 = require("../changeRequestAccess");
const auditor = { userId: 'a1', email: 'auditor@test.com', role: 'auditor' };
const ceo = { userId: 'c1', email: 'ceo@test.com', role: 'ceo' };
describe('changeRequestAccess season reopen', () => {
    it('lets only auditors review season reopen requests', () => {
        expect((0, changeRequestAccess_1.canReviewEntityChangeRequest)(auditor, changeRequestAccess_1.ENTITY_SEASON_REOPEN)).toBe(true);
        expect((0, changeRequestAccess_1.canReviewEntityChangeRequest)(ceo, changeRequestAccess_1.ENTITY_SEASON_REOPEN)).toBe(false);
    });
    it('includes season reopen in the auditor review list', () => {
        expect((0, changeRequestAccess_1.getReviewableEntityTypes)(auditor)).toContain(changeRequestAccess_1.ENTITY_SEASON_REOPEN);
        expect((0, changeRequestAccess_1.getReviewableEntityTypes)(ceo)).not.toContain(changeRequestAccess_1.ENTITY_SEASON_REOPEN);
    });
    it('adds pending season reopens to the auditor badge only', () => {
        const counts = {
            pesticideApplicationCount: 1,
            bumbleBeeInspectionCount: 0,
            manpowerRecordCount: 2,
            seasonReopenCount: 4,
            totalCount: 7,
        };
        expect((0, changeRequestAccess_1.badgeCountForRole)(auditor, counts)).toBe(5);
        expect((0, changeRequestAccess_1.badgeCountForRole)(ceo, counts)).toBe(2);
    });
    it('does not treat CEO as an IPM-admin reviewer of pesticide apps unless the email is admin', () => {
        expect((0, changeRequestAccess_1.canReviewEntityChangeRequest)(ceo, changeRequestAccess_1.ENTITY_PESTICIDE_APPLICATION)).toBe(false);
    });
});
