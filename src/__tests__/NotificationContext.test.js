import { render, screen, act } from '@testing-library/react';
import { NotificationProvider, useNotification } from '../contexts/NotificationContext';

function TestConsumer() {
  const notify = useNotification();
  return (
    <div>
      <button onClick={() => notify.success('Saved!')}>Success</button>
      <button onClick={() => notify.error('Failed!')}>Error</button>
      <button onClick={() => notify.warning('Careful!')}>Warning</button>
      <button onClick={() => notify.info('FYI!')}>Info</button>
    </div>
  );
}

describe('NotificationContext', () => {
  it('provides notify functions', () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>
    );

    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('shows success notification when success button clicked', async () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>
    );

    act(() => {
      screen.getByText('Success').click();
    });

    expect(await screen.findByText('Saved!')).toBeInTheDocument();
  });

  it('shows error notification when error button clicked', async () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>
    );

    act(() => {
      screen.getByText('Error').click();
    });

    expect(await screen.findByText('Failed!')).toBeInTheDocument();
  });
});
