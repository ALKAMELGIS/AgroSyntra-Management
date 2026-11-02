"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scoutingInfestation_1 = require("../scoutingInfestation");
describe('scoutingInfestation', () => {
    it('computes Capsicum nethouse example: 30000 × 0.10 / 340 = 8.82%', () => {
        expect((0, scoutingInfestation_1.computePestInfestationPct)(30000, 0.1, 340)).toBe(8.82);
    });
    it('returns null when sampling units or plant count invalid', () => {
        expect((0, scoutingInfestation_1.computePestInfestationPct)(0, 0.1, 340)).toBeNull();
        expect((0, scoutingInfestation_1.computePestInfestationPct)(30000, 0.1, 0)).toBeNull();
    });
    it('sums segment averages per pest and applies same percent to all rows', () => {
        const observations = [
            {
                pestName: 'Thrips (T)',
                category: 'insect',
                average: 0.05,
                count1: 1,
            },
            {
                pestName: 'Thrips (T)',
                category: 'insect',
                average: 0.05,
                count1: 1,
            },
        ];
        const result = (0, scoutingInfestation_1.applyInfestationToObservations)(observations, 30000, 340);
        expect(result[0].percent).toBe(8.82);
        expect(result[1].percent).toBe(8.82);
    });
    it('derives headline as max pest infestation percent', () => {
        const observations = [
            { pestName: 'Aphids (A)', category: 'insect', percent: 3.5, pestDiseaseId: 'a' },
            { pestName: 'Thrips (T)', category: 'insect', percent: 8.82 },
        ];
        const headline = (0, scoutingInfestation_1.deriveHeadlineFromObservations)(observations);
        expect(headline.headlinePct).toBe(8.82);
        expect(headline.headlineCustom).toBe('Thrips (T)');
    });
});
