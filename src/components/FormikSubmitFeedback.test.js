import { firstError } from './FormikSubmitFeedback';

test('finds the first message in nested Formik errors', () => {
  expect(firstError({})).toBeNull();
  expect(firstError({ time: 'Time is required' })).toBe('Time is required');
  expect(firstError({ valve1: { dripVolume: 'Drip volume is required' } })).toBe('Drip volume is required');
  expect(firstError({ rows: [undefined, { qty: 'Qty must be positive' }] })).toBe('Qty must be positive');
});
