"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const openFieldSowing_1 = require("../openFieldSowing");
describe('isOpenFieldTypeName', () => {
    it('treats Open Field and Farm Plots as sowing-in-place', () => {
        expect((0, openFieldSowing_1.isOpenFieldTypeName)('Open Field')).toBe(true);
        expect((0, openFieldSowing_1.isOpenFieldTypeName)('farm plots')).toBe(true);
    });
    it('leaves greenhouse and nethouse alone', () => {
        expect((0, openFieldSowing_1.isOpenFieldTypeName)('Greenhouse')).toBe(false);
        expect((0, openFieldSowing_1.isOpenFieldTypeName)('Nethouse')).toBe(false);
        expect((0, openFieldSowing_1.isOpenFieldTypeName)(null)).toBe(false);
    });
});
describe('coerceOpenFieldPlantingDates', () => {
    it('sets transplant date to seeding date for open field', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{ name: 'Open Field' }] }),
        };
        const out = await (0, openFieldSowing_1.coerceOpenFieldPlantingDates)({ fieldId: 'field-1', seedingDate: '2026-03-10', transplantDate: null }, null, db);
        expect(out.transplantDate).toBe('2026-03-10');
    });
    it('does not overwrite greenhouse transplant date', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{ name: 'Greenhouse' }] }),
        };
        const out = await (0, openFieldSowing_1.coerceOpenFieldPlantingDates)({ fieldId: 'field-1', seedingDate: '2026-01-01', transplantDate: '2026-02-01' }, null, db);
        expect(out.transplantDate).toBe('2026-02-01');
    });
});
