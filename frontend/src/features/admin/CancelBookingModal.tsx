import { Button, Card, Group, Modal, Stack, Text } from '@mantine/core';
import type { Booking } from '../../api/queries/bookingsAdmin';
import { formatFullHuman } from '../../lib/datetime';

type Props = {
  opened: boolean;
  booking: Booking;
  timezone: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function CancelBookingModal({ opened, booking, timezone, onConfirm, onClose }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Cancel booking"
      size="sm"
      centered
      closeOnEscape
      closeOnClickOutside
    >
      <Stack gap="md">
        <Text size="sm">
          This frees the slot for new bookings. The guest will not be notified by email.
        </Text>
        <Card withBorder p="sm">
          <Stack gap={4}>
            <Text fw={500}>{formatFullHuman(booking.startTime, timezone)}</Text>
            <Text size="sm" c="dimmed">
              {booking.eventTypeName} · {booking.durationMinutesSnapshot} min
            </Text>
            <Text size="sm" c="dimmed">
              {booking.guestName} · {booking.guestEmail}
            </Text>
          </Stack>
        </Card>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Keep
          </Button>
          <Button color="red" onClick={onConfirm}>
            Cancel booking
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
