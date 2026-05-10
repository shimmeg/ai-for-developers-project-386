import { useState } from 'react';
import {
  Anchor,
  Button,
  Card,
  Center,
  Group,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Link } from 'react-router';
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

export function BookingsPage() {
  const settingsQ = useAdminSettings();
  const bookingsQ = useAdminBookings();
  const cancel = useCancelBooking();
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  if (settingsQ.isError) {
    return (
      <ErrorState
        title="Couldn't load settings"
        message={settingsQ.error.message}
        onRetry={() => settingsQ.refetch()}
      />
    );
  }

  if (bookingsQ.isError) {
    return (
      <ErrorState
        title="Couldn't load bookings"
        message={bookingsQ.error.message}
        onRetry={() => bookingsQ.refetch()}
      />
    );
  }

  if (settingsQ.isPending || bookingsQ.isPending) {
    return (
      <Stack gap="md">
        <Title order={1}>Bookings</Title>
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
          notifications.show({
            color: 'green',
            title: 'Booking cancelled',
            message: '',
          });
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
      <Stack gap={4}>
        <Title order={1}>Bookings</Title>
        <Text c="dimmed" size="sm">
          All upcoming bookings across every event type, sorted by start time.
        </Text>
      </Stack>
      <TimezoneBanner timezone={timezone} />

      {items.length === 0 ? (
        <Card withBorder p="xl">
          <Center>
            <Stack align="center" gap="sm">
              <Title order={4}>No upcoming bookings</Title>
              <Text c="dimmed" size="sm">
                Share an event-type link to start receiving bookings.
              </Text>
              <Anchor component={Link} to="/admin/event-types" size="sm">
                Manage event types
              </Anchor>
            </Stack>
          </Center>
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
            {items.map((booking) => {
              const isCancellingThis =
                cancel.isPending && cancel.variables?.id === booking.id;
              return (
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
                  <Table.Td>
                    <Group justify="flex-end">
                      <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        loading={isCancellingThis}
                        disabled={isCancellingThis}
                        onClick={() => setModal({ kind: 'open', booking })}
                      >
                        Cancel
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
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
