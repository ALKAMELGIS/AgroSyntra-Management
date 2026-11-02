import { attachClashesToSubmissions, formatClashBanner, formatDateEnGb, sortSubmissionsClashesFirst } from '../manpowerOverlaps';

describe('manpower overlap copy', () => {
  it('formats a standout clash banner with date and other submitter', () => {
    const banner = formatClashBanner('2026-08-31', [
      {
        workerId: 'w1',
        workerName: 'Ahmed',
        recordDate: '2026-08-31',
        approvalStatus: 'pending',
        otherSubmitterName: 'Fatima TL',
        submissionKey: 's1',
      },
      {
        workerId: 'w2',
        workerName: 'Sara',
        recordDate: '2026-08-31',
        approvalStatus: 'approved',
        otherSubmitterName: 'Office',
        submissionKey: 's2',
      },
    ]);
    expect(banner).toContain('Clash — Ahmed, Sara already have hours on 31/08/2026');
    expect(banner).toContain('Fatima TL (still pending)');
    expect(banner).toContain('Office (already approved)');
    expect(banner).toContain('Approve one set and reject the extra');
  });

  it('formats en-GB dates', () => {
    expect(formatDateEnGb('2026-08-31')).toBe('31/08/2026');
  });
});

describe('attachClashesToSubmissions', () => {
  it('flags clash workers, builds banner, and sorts clash cards first', () => {
    const overlapRows = [
      {
        workerId: 'w1',
        workerName: 'Ahmed',
        recordDate: '2026-08-31',
        approvalStatus: 'approved',
        otherSubmitterName: 'Fatima TL',
        submissionKey: 'other',
      },
    ];
    const attached = attachClashesToSubmissions([
      {
        submissionKey: 'new',
        recordDate: '2026-08-31',
        workers: [{ workerId: 'w1', workerName: 'Ahmed' }, { workerId: 'w2', workerName: 'Sara' }],
      },
      {
        submissionKey: 'clean',
        recordDate: '2026-08-30',
        workers: [{ workerId: 'w3', workerName: 'Omar' }],
      },
    ], overlapRows);
    expect(attached[0].hasClash).toBe(true);
    expect(attached[0].clashBanner).toContain('Clash — Ahmed');
    expect(attached[0].workers[0].clash).toEqual({
      otherSubmitterName: 'Fatima TL',
      approvalStatus: 'approved',
    });
    expect(attached[0].workers[1].clash).toBeNull();
    expect(attached[1].hasClash).toBe(false);
    const sorted = sortSubmissionsClashesFirst([attached[1], attached[0]]);
    expect(sorted[0].submissionKey).toBe('new');
  });
});
