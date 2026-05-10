import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { CancelBookingModal } from '../features/admin/CancelBookingModal';
import type { Booking } from '../api/queries/bookingsAdmin';

const booking: Booking = {
  id: '5b3f8a2c-e7f4-4a1b-9c5d-2f7e8b0a6d3c',
  eventTypeSlug: 'intro-call',
  eventTypeName: 'Intro call',
  startTime: '2026-05-12T10:00:00+03:00',
  durationMinutesSnapshot: 30,
  guestName: 'Jane Doe',
  guestEmail: 'jane.doe@example.com',
  guestNotes: 'Looking forward to chatting.',
  createdAt: '2026-05-09T14:23:11+03:00',
};

function renderModal(overrides: Partial<{
  opened: boolean;
  booking: Booking;
  timezone: string;
  onConfirm: () => void;
  onClose: () => void;
}> = {}) {
  const onConfirm = overrides.onConfirm ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const result = render(
    <MantineProvider>
      <CancelBookingModal
        opened={overrides.opened ?? true}
        booking={overrides.booking ?? booking}
        timezone={overrides.timezone ?? 'Europe/Moscow'}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    </MantineProvider>,
  );
  return { ...result, onConfirm, onClose };
}

describe('CancelBookingModal', () => {
  it('renders the booking summary in the owner timezone', () => {
    renderModal();
    expect(screen.getByText(/Tuesday, 12 May 2026 at 10:00/i)).toBeInTheDocument();
    expect(screen.getByText(/Intro call/i)).toBeInTheDocument();
    expect(screen.getByText(/30 min/i)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/i)).toBeInTheDocument();
    expect(screen.getByText(/jane\.doe@example\.com/i)).toBeInTheDocument();
  });

  it('renders the no-email warning copy', () => {
    renderModal();
    expect(screen.getByText(/will not be notified/i)).toBeInTheDocument();
  });

  it('calls onConfirm when the destructive button is clicked', async () => {
    const { onConfirm, onClose } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: /^cancel booking$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the Keep button is clicked', async () => {
    const { onConfirm, onClose } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: /^keep$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', async () => {
    const { onConfirm, onClose } = renderModal();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders nothing when opened is false', () => {
    renderModal({ opened: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
