"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const plantingSegmentTokens_1 = require("../plantingSegmentTokens");
describe('canonicalizeSegmentToken', () => {
    it('normalizes bay spellings to B{n}', () => {
        for (const raw of ['B1', 'b1', 'bay 1', 'Bay-1', 'BAY   1', 'b01']) {
            expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)(raw)).toBe('B1');
        }
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('Bay 10')).toBe('B10');
    });
    it('normalizes valve spellings to V{n}', () => {
        for (const raw of ['V2', 'v2', 'valve 2', 'Valve-2', 'v02']) {
            expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)(raw)).toBe('V2');
        }
    });
    it('normalizes spots, numbered and bare', () => {
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('S')).toBe('S');
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('spot')).toBe('S');
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('Spot 3')).toBe('S3');
    });
    it('normalizes whole-field spellings to the ALL sentinel', () => {
        for (const raw of ['ALL', 'all', 'All Segments', '*']) {
            expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)(raw)).toBe(plantingSegmentTokens_1.ALL_SEGMENTS);
        }
    });
    it('keeps a bare number bare rather than guessing valve or bay', () => {
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('10')).toBe('10');
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('10')).not.toBe('V10');
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('10')).not.toBe('B10');
    });
    it('preserves unrecognized text instead of dropping it', () => {
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('North block')).toBe('North block');
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('  South   plot ')).toBe('South plot');
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('V')).toBe('V');
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('South')).toBe('South');
    });
    it('returns empty for blank input and never invents a segment', () => {
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('')).toBe('');
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)('   ')).toBe('');
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)(null)).toBe('');
        expect((0, plantingSegmentTokens_1.canonicalizeSegmentToken)(undefined)).toBe('');
    });
});
describe('parseSegmentTokens', () => {
    it('splits on commas and ampersands', () => {
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)('V1,V2,V3')).toEqual(['V1', 'V2', 'V3']);
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)('V1 & V2')).toEqual(['V1', 'V2']);
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)('Bay 1, bay-2 & B3')).toEqual(['B1', 'B2', 'B3']);
    });
    it('preserves first-appearance order and deduplicates', () => {
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)('V3, V1, v3, valve 1')).toEqual(['V3', 'V1']);
    });
    it('collapses a row mentioning ALL to the sentinel alone', () => {
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)('ALL, V1')).toEqual([plantingSegmentTokens_1.ALL_SEGMENTS]);
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)('V1, all segments')).toEqual([plantingSegmentTokens_1.ALL_SEGMENTS]);
    });
    it('returns no tokens for blank segments and invents nothing', () => {
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)('')).toEqual([]);
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)(null)).toEqual([]);
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)(' , , ')).toEqual([]);
    });
    it('keeps mixed recognized and free-text segments', () => {
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)('V1, North block, B2')).toEqual(['V1', 'North block', 'B2']);
    });
});
describe('round trip', () => {
    it('serializing parsed tokens reparses to the same tokens', () => {
        for (const raw of [
            'V1,V2,V3',
            'Bay 1 & bay-2',
            'V1, North block, B2',
            'Spot 3, S, V4',
            '10, V1',
            'ALL',
        ]) {
            const once = (0, plantingSegmentTokens_1.parseSegmentTokens)(raw);
            const twice = (0, plantingSegmentTokens_1.parseSegmentTokens)((0, plantingSegmentTokens_1.serializeSegmentTokens)(once));
            expect(twice).toEqual(once);
        }
    });
    it('loses no segment count through a round trip', () => {
        const tokens = (0, plantingSegmentTokens_1.parseSegmentTokens)('V1, V2, North block, Bay 7, 10');
        expect(tokens).toHaveLength(5);
        expect((0, plantingSegmentTokens_1.parseSegmentTokens)((0, plantingSegmentTokens_1.serializeSegmentTokens)(tokens))).toHaveLength(5);
    });
});
describe('splitSegmentTokens', () => {
    it('keeps the unselected segment active on a partial uproot', () => {
        expect((0, plantingSegmentTokens_1.splitSegmentTokens)('V1,V2,V3', ['V1', 'V2'])).toEqual({
            removed: ['V1', 'V2'],
            remaining: ['V3'],
        });
    });
    it('matches removal requests written in another spelling', () => {
        expect((0, plantingSegmentTokens_1.splitSegmentTokens)('V1,V2,V3', ['valve 1', 'v02'])).toEqual({
            removed: ['V1', 'V2'],
            remaining: ['V3'],
        });
    });
    it('removes everything when the request is ALL', () => {
        expect((0, plantingSegmentTokens_1.splitSegmentTokens)('V1,V2,V3', ['ALL'])).toEqual({
            removed: ['V1', 'V2', 'V3'],
            remaining: [],
        });
        expect((0, plantingSegmentTokens_1.splitSegmentTokens)('V1,V2', ['*'])).toEqual({
            removed: ['V1', 'V2'],
            remaining: [],
        });
    });
    it('removes nothing when the request is empty', () => {
        expect((0, plantingSegmentTokens_1.splitSegmentTokens)('V1,V2', [])).toEqual({
            removed: [],
            remaining: ['V1', 'V2'],
        });
    });
    it('ignores requested segments the row does not have', () => {
        expect((0, plantingSegmentTokens_1.splitSegmentTokens)('V1,V2', ['V9'])).toEqual({
            removed: [],
            remaining: ['V1', 'V2'],
        });
    });
    it('splits free-text segments as exactly as recognized ones', () => {
        expect((0, plantingSegmentTokens_1.splitSegmentTokens)('V1, North block', ['North block'])).toEqual({
            removed: ['North block'],
            remaining: ['V1'],
        });
    });
    it('expands an ALL row against the field segment list for a partial uproot', () => {
        expect((0, plantingSegmentTokens_1.splitSegmentTokens)('ALL', ['V1'], { universe: ['V1', 'V2', 'V3'] })).toEqual({ removed: ['V1'], remaining: ['V2', 'V3'] });
    });
    it('clears an ALL row without needing the field list when uprooting ALL', () => {
        expect((0, plantingSegmentTokens_1.splitSegmentTokens)('ALL', ['ALL'])).toEqual({
            removed: [plantingSegmentTokens_1.ALL_SEGMENTS],
            remaining: [],
        });
    });
    it('refuses to partially uproot an ALL row without the field segment list', () => {
        expect(() => (0, plantingSegmentTokens_1.splitSegmentTokens)('ALL', ['V1'])).toThrow(plantingSegmentTokens_1.AmbiguousSegmentSplitError);
        expect(() => (0, plantingSegmentTokens_1.splitSegmentTokens)('ALL', ['V1'])).toThrow(/without the field segment list/);
    });
    it('never leaves a segment in both halves of the split', () => {
        const { removed, remaining } = (0, plantingSegmentTokens_1.splitSegmentTokens)('V1,V2,V3,B4', ['V2', 'B4']);
        expect(removed.filter((token) => remaining.includes(token))).toEqual([]);
        expect([...removed, ...remaining].sort()).toEqual(['B4', 'V1', 'V2', 'V3']);
    });
});
