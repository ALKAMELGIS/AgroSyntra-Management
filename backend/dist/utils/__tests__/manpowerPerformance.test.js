"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const manpowerPerformance_1 = require("../manpowerPerformance");
function row(partial) {
    return {
        date: '2026-08-21',
        crop: 'Tomato Plum',
        variety: 'Arancia RZ',
        activity: 'Harvesting',
        location: 'NH-01',
        section: 'A',
        workerId: 'w1',
        workerCategory: 'Casual',
        workerName: 'John',
        employeeId: '4427',
        hours: 8,
        hoursMissing: false,
        actual: 10,
        unit: 'boxes',
        hasActual: true,
        totalHours: 8,
        ...partial,
    };
}
describe('manpowerPerformance matchReference', () => {
    const refs = [
        { activity: 'Harvesting', crop: 'Tomato Plum', variety: 'Arancia RZ', unit: 'boxes', target: 12 },
        { activity: 'Harvesting', crop: 'Tomato Plum', variety: '', unit: 'boxes', target: 10 },
        { activity: 'Harvesting', crop: '', variety: '', unit: 'boxes', target: 8 },
        { activity: 'Pruning', crop: 'Tomato Plum', variety: '', unit: 'plants', target: null },
    ];
    it('prefers variety-specific then crop then activity-only', () => {
        expect((0, manpowerPerformance_1.matchReference)(refs, 'Harvesting', 'Tomato Plum', 'Arancia RZ')?.target).toBe(12);
        expect((0, manpowerPerformance_1.matchReference)(refs, 'Harvesting', 'Tomato Plum', 'Sven RZ')?.target).toBe(10);
        expect((0, manpowerPerformance_1.matchReference)(refs, 'Harvesting', 'Eggplant', '')?.target).toBe(8);
    });
    it('skips rows with no target', () => {
        expect((0, manpowerPerformance_1.matchReference)(refs, 'Pruning', 'Tomato Plum', '')).toBeNull();
    });
    it('does not fall through to a looser target when the specific row has a blank target', () => {
        const mixed = [
            { activity: 'Harvesting', crop: 'Tomato Plum', variety: '', unit: 'boxes', target: null },
            { activity: 'Harvesting', crop: '', variety: '', unit: 'boxes', target: 8 },
        ];
        expect((0, manpowerPerformance_1.matchReference)(mixed, 'Harvesting', 'Tomato Plum', 'Arancia RZ')).toBeNull();
        expect((0, manpowerPerformance_1.matchReference)(mixed, 'Harvesting', 'Eggplant', '')?.target).toBe(8);
    });
});
describe('manpowerPerformance vs target and worker summary', () => {
    it('sums actual per worker day activity and flags under/over', () => {
        const vs = (0, manpowerPerformance_1.buildVsTargetRows)([
            row({ actual: 4 }),
            row({ actual: 3 }),
            row({
                workerId: 'w2',
                workerName: 'Sara',
                employeeId: '9',
                actual: 15,
            }),
        ], [{ activity: 'Harvesting', crop: 'Tomato Plum', variety: 'Arancia RZ', unit: 'boxes', target: 10 }]);
        const john = vs.find((r) => r.workerId === 'w1');
        const sara = vs.find((r) => r.workerId === 'w2');
        expect(john.actual).toBe(7);
        expect(john.status).toBe('Under');
        expect(john.variance).toBe(-3);
        expect(sara.status).toBe('Over');
    });
    it('skips rows with no actual entered', () => {
        const vs = (0, manpowerPerformance_1.buildVsTargetRows)([row({ hasActual: false, actual: 0 })], [{ activity: 'Harvesting', crop: 'Tomato Plum', variety: 'Arancia RZ', target: 10 }]);
        expect(vs).toHaveLength(0);
    });
    it('summarizes missed days and end-of-range streak', () => {
        const vs = (0, manpowerPerformance_1.buildVsTargetRows)([
            row({ date: '2026-08-21', actual: 5 }),
            row({ date: '2026-08-22', actual: 5 }),
            row({ date: '2026-08-23', actual: 5 }),
            row({ date: '2026-08-24', actual: 5 }),
            row({ date: '2026-08-25', actual: 5 }),
        ], [{ activity: 'Harvesting', crop: 'Tomato Plum', variety: 'Arancia RZ', target: 10 }]);
        const summary = (0, manpowerPerformance_1.buildWorkerSummary)(vs);
        expect(summary).toHaveLength(1);
        expect(summary[0].daysWithTarget).toBe(5);
        expect(summary[0].daysMissed).toBe(5);
        expect(summary[0].daysAchieved).toBe(0);
        expect(summary[0].missStreak).toBe(5);
        expect(summary[0].result).toBe('Missed 5 of 5 days');
    });
    it('resets miss streak after an achieved day', () => {
        const vs = (0, manpowerPerformance_1.buildVsTargetRows)([
            row({ date: '2026-08-21', actual: 5 }),
            row({ date: '2026-08-22', actual: 12 }),
            row({ date: '2026-08-23', actual: 5 }),
            row({ date: '2026-08-24', actual: 5 }),
        ], [{ activity: 'Harvesting', crop: 'Tomato Plum', variety: 'Arancia RZ', target: 10 }]);
        const summary = (0, manpowerPerformance_1.buildWorkerSummary)(vs)[0];
        expect(summary.daysAchieved).toBe(1);
        expect(summary.daysMissed).toBe(3);
        expect(summary.missStreak).toBe(2);
        expect(summary.result).toBe('Achieved 1 of 4 days');
    });
});
describe('manpowerPerformance overtime', () => {
    it(`lists worker-days over ${manpowerPerformance_1.NORMAL_WORK_HOURS} hours`, () => {
        const overtime = (0, manpowerPerformance_1.buildOvertimeRows)([
            row({ hours: 6, totalHours: 11 }),
            row({ workerId: 'w2', workerName: 'Sara', employeeId: '9', hours: 8, totalHours: 8 }),
            row({
                date: '2026-08-22',
                hours: 5,
                totalHours: 0,
            }),
            row({
                date: '2026-08-22',
                hours: 6,
                totalHours: 0,
            }),
        ]);
        expect(overtime.map((r) => ({ date: r.date, workerId: r.workerId, hours: r.hours, extraHours: r.extraHours }))).toEqual([
            { date: '2026-08-21', workerId: 'w1', hours: 11, extraHours: 1 },
            { date: '2026-08-22', workerId: 'w1', hours: 11, extraHours: 1 },
        ]);
    });
});
