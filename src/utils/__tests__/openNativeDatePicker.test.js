import { openNativeDatePicker } from '../openNativeDatePicker';

describe('openNativeDatePicker', () => {
  it('calls showPicker on a nested date input', () => {
    const input = { tagName: 'INPUT', showPicker: jest.fn() };
    const event = { currentTarget: { tagName: 'DIV', querySelector: () => input } };
    openNativeDatePicker(event);
    expect(input.showPicker).toHaveBeenCalled();
  });

  it('swallows showPicker rejection', () => {
    const input = {
      tagName: 'INPUT',
      showPicker: jest.fn(() => { throw new Error('not allowed'); }),
    };
    expect(() => openNativeDatePicker({ currentTarget: input })).not.toThrow();
  });
});
