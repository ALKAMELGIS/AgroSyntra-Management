import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialogComponent } from '../components/ConfirmDialog';

describe('ConfirmDialogComponent', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialogComponent
        open={false}
        title="Confirm"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
  });

  it('renders title and message when open', () => {
    render(
      <ConfirmDialogComponent
        open={true}
        title="Delete Item"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        severity="error"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialogComponent
        open={true}
        title="Confirm"
        message="Proceed?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    await userEvent.click(screen.getByText('Yes'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when cancel button clicked', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialogComponent
        open={true}
        title="Confirm"
        message="Proceed?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    await userEvent.click(screen.getByText('No'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows warning icon for error severity', () => {
    render(
      <ConfirmDialogComponent
        open={true}
        title="Warning"
        message="Danger!"
        severity="error"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByTestId('WarningOutlinedIcon')).toBeInTheDocument();
  });
});
