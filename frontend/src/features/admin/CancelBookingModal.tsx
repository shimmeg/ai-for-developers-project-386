import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { formatFullHuman } from '../../lib/datetime';
import type { Booking } from '../../api/queries/bookingsAdmin';

type Props = {
  opened: boolean;
  booking: Booking;
  timezone: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function CancelBookingModal({
  opened,
  booking,
  timezone,
  isPending,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (isPending) return;
        onClose();
      }}
      title="Cancel booking?"
      centered
      closeOnClickOutside={!isPending}
      closeOnEscape={!isPending}
      aria-describedby="cancel-booking-summary cancel-booking-warning"
    >
      <Stack gap="md">
        <Stack gap={4} id="cancel-booking-summary">
          <Text>
            <strong>{booking.eventTypeName}</strong> with {booking.guestName}
          </Text>
          <Text c="dimmed" size="sm">
            {formatFullHuman(booking.startTime, timezone)}
          </Text>
          {booking.guestNotes && (
            <Text c="dimmed" size="sm" mt="xs">
              <strong>Notes:</strong> {booking.guestNotes}
            </Text>
          )}
        </Stack>
        <Alert
          id="cancel-booking-warning"
          color="yellow"
          variant="light"
          icon={<IconAlertTriangle />}
        >
          The guest is not notified by email in v1. The slot will become available again
          immediately.
        </Alert>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose} disabled={isPending}>
            Keep booking
          </Button>
          <Button color="red" loading={isPending} onClick={onConfirm}>
            Cancel booking
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
