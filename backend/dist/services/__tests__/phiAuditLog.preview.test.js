"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harvestPhiPreview_1 = require("../../utils/harvestPhiPreview");
describe('harvestClashesPhi', () => {
    const sprayAt = new Date(2026, 8, 1, 10, 0, 0);
    const phiEndsAt = new Date(2026, 8, 1, 15, 0, 0);
    it('does not clash when harvest starts before the spray', () => {
        expect((0, harvestPhiPreview_1.harvestClashesPhi)(new Date(2026, 8, 1, 8, 0, 0), sprayAt, phiEndsAt)).toBe(false);
    });
    it('does not clash when harvest starts after PHI ends', () => {
        expect((0, harvestPhiPreview_1.harvestClashesPhi)(new Date(2026, 8, 1, 16, 0, 0), sprayAt, phiEndsAt)).toBe(false);
    });
    it('clashes when harvest is after spray start and still in PHI', () => {
        expect((0, harvestPhiPreview_1.harvestClashesPhi)(new Date(2026, 8, 1, 11, 0, 0), sprayAt, phiEndsAt)).toBe(true);
    });
    it('clashes at the spray start and not at the PHI end', () => {
        expect((0, harvestPhiPreview_1.harvestClashesPhi)(sprayAt, sprayAt, phiEndsAt)).toBe(true);
        expect((0, harvestPhiPreview_1.harvestClashesPhi)(phiEndsAt, sprayAt, phiEndsAt)).toBe(false);
    });
});
describe('harvestRowClashesPhi', () => {
    const phiEnd = '2026-09-01T11:00:00.000Z'; // 15:00 Asia/Dubai
    it('treats 08:00 harvest vs 10:00 spray as no clash', () => {
        expect((0, harvestPhiPreview_1.harvestRowClashesPhi)({
            harvestDate: '2026-09-01',
            harvestStartTime: '08:00',
            sprayDate: '2026-09-01',
            sprayStartTime: '10:00',
            phiEnd,
        })).toBe(false);
    });
    it('treats 16:00 harvest vs PHI ending 15:00 as no clash', () => {
        expect((0, harvestPhiPreview_1.harvestRowClashesPhi)({
            harvestDate: '2026-09-01',
            harvestStartTime: '16:00',
            sprayDate: '2026-09-01',
            sprayStartTime: '10:00',
            phiEnd,
        })).toBe(false);
    });
    it('treats 11:00 harvest vs 10:00 spray still in PHI as a clash', () => {
        expect((0, harvestPhiPreview_1.harvestRowClashesPhi)({
            harvestDate: '2026-09-01',
            harvestStartTime: '11:00',
            sprayDate: '2026-09-01',
            sprayStartTime: '10:00',
            phiEnd,
        })).toBe(true);
    });
    it('falls back to date-only when harvest has no start time', () => {
        expect((0, harvestPhiPreview_1.harvestRowClashesPhi)({
            harvestDate: '2026-09-01',
            harvestStartTime: null,
            sprayDate: '2026-09-01',
            sprayStartTime: '10:00',
            phiEnd,
        })).toBe(false);
        expect((0, harvestPhiPreview_1.harvestRowClashesPhi)({
            harvestDate: '2026-08-31',
            harvestStartTime: null,
            sprayDate: '2026-08-30',
            sprayStartTime: '10:00',
            phiEnd: '2026-09-01T11:00:00.000Z',
        })).toBe(true);
    });
});
describe('phiEndIso farm local', () => {
    it('keeps 7:30 AM Dubai after 3 PHI days', () => {
        const iso = (0, harvestPhiPreview_1.phiEndIso)('2025-12-28', '07:30', '08:30', 3);
        expect(iso).toBe('2025-12-31T03:30:00.000Z');
        expect((0, harvestPhiPreview_1.farmLocalPartsFromInstant)(iso)).toEqual({ ymd: '2025-12-31', hm: '07:30' });
    });
    it('uses start time when end is blank', () => {
        expect((0, harvestPhiPreview_1.phiEndIso)('2025-12-28', '07:30', '', 3)).toBe('2025-12-31T03:30:00.000Z');
    });
    it('does not clash when harvest is after PHI end the same morning', () => {
        expect((0, harvestPhiPreview_1.harvestRowClashesPhi)({
            harvestDate: '2025-12-31',
            harvestStartTime: '08:45',
            sprayDate: '2025-12-28',
            sprayStartTime: '07:30',
            phiEnd: '2025-12-31T03:30:00.000Z',
        })).toBe(false);
        expect((0, harvestPhiPreview_1.harvestRowClashesPhi)({
            harvestDate: '2025-12-31',
            harvestStartTime: '07:00',
            sprayDate: '2025-12-28',
            sprayStartTime: '07:30',
            phiEnd: '2025-12-31T03:30:00.000Z',
        })).toBe(true);
    });
});
describe('harvest PHI preview copy', () => {
    it('formats a standout banner with product and PHI end date', () => {
        const banner = (0, harvestPhiPreview_1.formatHarvestPhiPreviewBanner)([
            {
                applicationId: 'a1',
                fieldName: 'NH 06',
                productName: 'Switch',
                sprayDate: '2026-08-20',
                phiEndDate: '2026-09-03',
                daysViolated: 2,
            },
        ]);
        expect(banner).toContain('Clash — NH 06 is still in PHI');
        expect(banner).toContain('Switch (spray 20/08/2026, PHI ends 03/09/2026)');
        expect(banner).toContain('PHI Audit');
    });
    it('formats en-GB dates', () => {
        expect((0, harvestPhiPreview_1.formatDateEnGb)('2026-09-03')).toBe('03/09/2026');
    });
});
