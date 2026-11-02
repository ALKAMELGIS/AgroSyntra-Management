import { guessFieldKey } from '../pestImportGuess';

describe('guessFieldKey', () => {
  it('maps the RC-109 combined %Seen header to percentSeen, not variety', () => {
    expect(guessFieldKey('%Seen & Variety / Expected Prob')).toBe('percentSeen');
    expect(guessFieldKey('%Seen & Variety / Expected Problem')).toBe('percentSeen');
  });

  it('still maps a Variety column to variety', () => {
    expect(guessFieldKey('Variety')).toBe('variety');
  });

  it('maps short % Seen headers', () => {
    expect(guessFieldKey('% Seen')).toBe('percentSeen');
    expect(guessFieldKey('%Seen')).toBe('percentSeen');
  });
});
