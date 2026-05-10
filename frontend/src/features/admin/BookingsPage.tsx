import { useState } from 'react';
import {
  Anchor,
  Button,
  Card,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Link } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { TimezoneBanner } from '../../components/TimezoneBanner';
import { useAdminSettings } from '../../api/queries/settings';
import {
  useAdminBookings,
  useCancelBooking,
  type Booking,
} from '../../api/queries/bookingsAdmin';
import { formatFullHuman } from '../../lib/datetime';
import { CancelBookingModal } from './CancelBookingModal';

type ModalState = { kind: 'closed' } | { kind: 'open'; booking: Booking };

function PageHeader() {
  return (
    <Stack gap={4}>
      <Title order={1}>Bookings</Title>
      <Text c="dimmed" size="sm">
        All upcoming bookings across every event type, sorted by start time.
      </Text>
    </Stack>
  );
}

export function BookingsPage() {
  const settingsQ = useAdminSettings();
  const bookingsQ = useAdminBookings();
  const cancel = useCancelBooking();
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  if (settingsQ.isError) {
    return (
      <Stack gap="md">
        <PageHeader />
        <ErrorState
          title="Couldn't load settings"
          message={settingsQ.error.message}
          onRetry={() => settingsQ.refetch()}
        />
      </Stack>
    );
  }

  if (bookingsQ.isError) {
    return (
      <Stack gap="md">
        <PageHeader />
        <ErrorState
          title="Couldn't load bookings"
          message={bookingsQ.error.message}
          onRetry={() => bookingsQ.refetch()}
        />
      </Stack>
    );
  }

  if (settingsQ.isPending || bookingsQ.isPending) {
    return (
      <Stack gap="md">
        <PageHeader />
        <Skeleton h={20} w={240} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} h={48} />
        ))}
      </Stack>
    );
  }

  const timezone = settingsQ.data.timezone;
  const items = bookingsQ.data;

  const handleConfirmCancel = (booking: Booking) => {
    setModal({ kind: 'closed' });
    cancel.mutate(
      { id: booking.id },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', title: 'Booking cancelled', message: '' });
        },
        onError: (err) => {
          notifications.show({
            color: 'red',
            title: 'Failed to cancel',
            message: err.message,
          });
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <PageHeader />
      <TimezoneBanner timezone={timezone} />

      {items.length === 0 ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="sm">
            <EmptyState
              order={2}
              title="No upcoming bookings"
              description="Share an event-type link to start receiving bookings."
            />
            <Anchor component={Link} to="/admin/event-types" size="sm">
              Manage event types
            </Anchor>
          </Stack>
        </Card>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>When</Table.Th>
              <Table.Th>Event type</Table.Th>
              <Table.Th>Length</Table.Th>
              <Table.Th>Guest</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th aria-label="Actions" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((booking) => (
              <Table.Tr key={booking.id}>
                <Table.Td>{formatFullHuman(booking.startTime, timezone)}</Table.Td>
                <Table.Td>{booking.eventTypeName}</Table.Td>
                <Table.Td>{booking.durationMinutesSnapshot} min</Table.Td>
                <Table.Td>{booking.guestName}</Table.Td>
                <Table.Td>{booking.guestEmail}</Table.Td>
                <Table.Td>
                  {booking.guestNotes ? (
                    <Tooltip
                      label={booking.guestNotes}
                      multiline
                      w={320}
                      withArrow
                      events={{ hover: true, focus: true, touch: true }}
                    >
                      <Text size="sm" lineClamp={1} maw={240}>
                        {booking.guestNotes}
                      </Text>
                    </Tooltip>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    onClick={() => setModal({ kind: 'open', booking })}
                  >
                    Cancel
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {modal.kind === 'open' && (
        <CancelBookingModal
          opened
          booking={modal.booking}
          timezone={timezone}
          onConfirm={() => handleConfirmCancel(modal.booking)}
          onClose={() => setModal({ kind: 'closed' })}
        />
      )}
    </Stack>
  );
}
