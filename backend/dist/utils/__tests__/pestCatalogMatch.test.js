"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pestCatalogMatch_1 = require("../pestCatalogMatch");
const catalog = [
    { id: 'thrips', name: 'Thrips', category: 'pest', organization_id: 'org-1' },
    { id: 'mite', name: 'Spider Mite', category: 'pest', organization_id: 'org-1' },
    { id: 'pythium', name: 'Pythium spp.', category: 'disease', organization_id: null },
    { id: 'thrips-spot', name: 'Thrips Spot', category: 'pest', organization_id: 'org-1' },
    { id: 'combo', name: 'Red Spider Mite & Thrips ( Spot )', category: 'pest', organization_id: 'org-1' },
];
describe('normalizePestCatalogName', () => {
    it('strips punctuation so spider mite ( matches Spider Mite', () => {
        expect((0, pestCatalogMatch_1.normalizePestCatalogName)('spider mite (')).toBe('spider mite');
        expect((0, pestCatalogMatch_1.normalizePestCatalogName)('Spider Mite')).toBe('spider mite');
        expect((0, pestCatalogMatch_1.compactPestCatalogName)('spider mite (')).toBe('spidermite');
    });
});
describe('findExistingCatalogEntry', () => {
    it('treats punctuation-only extras as an exact catalog hit', () => {
        expect((0, pestCatalogMatch_1.findExistingCatalogEntry)('spider mite (', catalog)?.id).toBe('mite');
    });
    it('auto-matches a unique one-letter misspelling', () => {
        expect((0, pestCatalogMatch_1.findExistingCatalogEntry)('spider met', catalog)?.id).toBe('mite');
    });
    it('does not auto-match Phytium to Pythium spp.', () => {
        expect((0, pestCatalogMatch_1.findExistingCatalogEntry)('Phytium', catalog)).toBeNull();
    });
    it('does not treat a spot name as the original pest', () => {
        expect((0, pestCatalogMatch_1.findExistingCatalogEntry)('Thrips Spot', catalog)?.id).toBe('thrips-spot');
    });
    it('prefers the org copy when several exact names exist', () => {
        const dupes = [
            { id: 'shared', name: 'Phytium', category: 'disease', organization_id: null },
            { id: 'org', name: 'Phytium', category: 'disease', organization_id: 'org-1' },
        ];
        expect((0, pestCatalogMatch_1.pickExistingCatalogEntry)(dupes, 'org-1', 'disease')?.id).toBe('org');
    });
});
describe('hideCatalogStrategy', () => {
    it('deactivates org copies and hides shared foundation rows per farm', () => {
        expect((0, pestCatalogMatch_1.hideCatalogStrategy)({ organization_id: 'org-1' }, 'org-1')).toBe('deactivate');
        expect((0, pestCatalogMatch_1.hideCatalogStrategy)({ organization_id: null }, 'org-1')).toBe('org_hidden');
        expect((0, pestCatalogMatch_1.hideCatalogStrategy)({ organization_id: 'other' }, 'org-1')).toBe('forbidden');
    });
});
describe('expandCatalogIdsForQuery', () => {
    const links = [
        { memberId: 'thrips-spot', groupId: 'thrips' },
        { memberId: 'combo', groupId: 'thrips' },
        { memberId: 'combo', groupId: 'mite' },
    ];
    it('includes spots and combos when searching for Thrips', () => {
        const ids = (0, pestCatalogMatch_1.expandCatalogIdsForQuery)('Thrips', catalog, links);
        expect(ids).toEqual(expect.arrayContaining(['thrips', 'thrips-spot', 'combo']));
    });
    it('builds justification labels for expanded ids', () => {
        expect((0, pestCatalogMatch_1.justificationLabelsForIds)(['thrips', 'thrips-spot'], catalog)).toEqual([
            'Pest : Thrips',
            'Pest : Thrips Spot',
        ]);
    });
});
describe('catalogJustificationLabel', () => {
    it('prefixes pest names', () => {
        expect((0, pestCatalogMatch_1.catalogJustificationLabel)({ name: 'Thrips', category: 'pest' })).toBe('Pest : Thrips');
    });
});
