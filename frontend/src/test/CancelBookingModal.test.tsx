import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { CancelBookingModal } from '../features/admin/CancelBookingModal';
import type { Booking } from '../api/queries/bookingsAdmin';

const baseBooking: Booking = {
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

function renderModal(
  overrides: Partial<{
    booking: Booking;
    timezone: string;
    isPending: boolean;
    onConfirm: () => void;
    onClose: () => void;
  }> = {},
) {
  const onConfirm = overrides.onConfirm ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <MantineProvider>
      <CancelBookingModal
        opened
        booking={overrides.booking ?? baseBooking}
        timezone={overrides.timezone ?? 'Europe/Moscow'}
        isPending={overrides.isPending ?? false}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    </MantineProvider>,
  );
  return { onConfirm, onClose };
}

describe('CancelBookingModal', () => {
  it('renders the booking summary (event type, guest name, start time)', () => {
    renderModal();
    expect(screen.getByText(/intro call/i)).toBeInTheDocument();
    expect(screen.getByText(/jane doe/i)).toBeInTheDocument();
    // formatFullHuman renders "Tuesday, 12 May 2026 at 10:00" in Europe/Moscow.
    expect(screen.getByText(/12 May 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/10:00/i)).toBeInTheDocument();
  });

  it('surfaces the "guest is not notified" caveat', () => {
    renderModal();
    expect(screen.getByText(/guest is not notified/i)).toBeInTheDocument();
  });

  it('calls onConfirm when the destructive button is clicked', async () => {
    const { onConfirm, onClose } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: /^cancel booking$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the keep-booking button is clicked', async () => {
    const { onConfirm, onClose } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: /keep booking/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a loading spinner on the destructive button while isPending', () => {
    renderModal({ isPending: true });
    const cancelBtn = screen.getByRole('button', { name: /^cancel booking$/i });
    expect(cancelBtn).toHaveAttribute('data-loading', 'true');
  });

  it('omits the notes preview when guestNotes is missing', () => {
    renderModal({
      booking: { ...baseBooking, guestNotes: undefined },
    });
    expect(screen.queryByText(/looking forward/i)).not.toBeInTheDocument();
  });
});
