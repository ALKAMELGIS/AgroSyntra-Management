import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ConfirmHost, confirmAction } from './ConfirmDialog';

test('confirmAction shows the in-app dialog and resolves with the answer', async () => {
  render(<ConfirmHost />);
  let answer;
  act(() => { confirmAction('Delete this record?').then((v) => { answer = v; }); });
  expect(await screen.findByText('Delete this record?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(answer).toBe(true));

  act(() => { confirmAction('Cancel this order?').then((v) => { answer = v; }); });
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(answer).toBe(false));
});
