import {
  applyReferenceToBlock,
  matchActivityReference,
  parseReferenceTarget,
} from '../utils/matchActivityReference';

describe('matchActivityReference', () => {
  const refs = [
    { activity: 'Harvesting', crop: 'Tomato Plum', variety: 'Arancia RZ', unit: 'boxes', target: 12 },
    { activity: 'Harvesting', crop: 'Tomato Plum', variety: '', unit: 'boxes', target: 10 },
    { activity: 'Harvesting', crop: '', variety: '', unit: 'boxes', target: 8 },
    { activity: 'Pruning', crop: 'Tomato Plum', variety: '', unit: 'plants', target: null },
  ];

  it('prefers variety then crop then activity-only', () => {
    expect(matchActivityReference(refs, 'Harvesting', 'Tomato Plum', 'Arancia RZ')?.target).toBe(12);
    expect(matchActivityReference(refs, 'Harvesting', 'Tomato Plum', 'Sven RZ')?.target).toBe(10);
    expect(matchActivityReference(refs, 'Harvesting', 'Eggplant', '')?.target).toBe(8);
  });

  it('returns a blank-target row so the sheet can stay editable', () => {
    const row = matchActivityReference(refs, 'Pruning', 'Tomato Plum', '');
    expect(row?.unit).toBe('plants');
    expect(parseReferenceTarget(row?.target)).toBeNull();
  });
});

describe('applyReferenceToBlock', () => {
  it('locks target when Reference has a number and unlocks when it does not', () => {
    const refs = [
      { activity: 'Harvesting', crop: 'Tomato Plum', variety: '', unit: 'Box', target: 10 },
    ];
    const locked = applyReferenceToBlock(
      { activity: 'Harvesting', unit: '', variety: 'Arancia RZ', target: '', targetLocked: false },
      refs,
      'Tomato Plum',
      'Ha',
    );
    expect(locked.target).toBe('10');
    expect(locked.targetLocked).toBe(true);
    expect(locked.unit).toBe('Box');

    const unlocked = applyReferenceToBlock(
      { ...locked, activity: 'Pruning' },
      refs,
      'Tomato Plum',
      'Bed',
    );
    expect(unlocked.targetLocked).toBe(false);
    expect(unlocked.target).toBe('');
    expect(unlocked.unit).toBe('Bed');
  });

  it('keeps a typed target when switching between unlocked activities', () => {
    const next = applyReferenceToBlock(
      { activity: 'Weeding', unit: 'Bed', variety: '', target: '3', targetLocked: false },
      [],
      'Tomato Plum',
      'Bed',
    );
    expect(next.target).toBe('3');
    expect(next.targetLocked).toBe(false);
  });
});
