import { formatPercentSeen } from '../percentSeen';

describe('formatPercentSeen', () => {
  it('turns Excel fraction percents into display percents', () => {
    expect(formatPercentSeen(0.004)).toBe('0.4%');
    expect(formatPercentSeen('0.013')).toBe('1.3%');
    expect(formatPercentSeen(0.009)).toBe('0.9%');
  });

  it('keeps values that already look like Excel text', () => {
    expect(formatPercentSeen('0.7%')).toBe('0.7%');
    expect(formatPercentSeen('1.3')).toBe('1.3');
    expect(formatPercentSeen(1.3)).toBe('1.3');
    expect(formatPercentSeen(0)).toBe('0');
    expect(formatPercentSeen('')).toBe('');
  });
});
