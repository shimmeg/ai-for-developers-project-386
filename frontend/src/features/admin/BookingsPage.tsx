import { useState } from 'react';
import {
  Button,
  Card,
  Center,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCalendarEvent } from '@tabler/icons-react';
import { Link } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { TimezoneBanner } from '../../components/TimezoneBanner';
import {
  useAdminBookings,
  useCancelBooking,
  type Booking,
} from '../../api/queries/bookingsAdmin';
import { useAdminSettings } from '../../api/queries/settings';
import { formatFullHuman } from '../../lib/datetime';
import { CancelBookingModal } from './CancelBookingModal';

const NOTES_PREVIEW_LIMIT = 80;

function truncate(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

type ConfirmState = { kind: 'closed' } | { kind: 'open'; booking: Booking };

export function BookingsPage() {
  const listQ = useAdminBookings();
  const settingsQ = useAdminSettings();
  const cancelM = useCancelBooking();
  const [confirm, setConfirm] = useState<ConfirmState>({ kind: 'closed' });

  if (listQ.isPending || settingsQ.isPending) {
    return (
      <Stack gap="md">
        <Title order={2}>Bookings</Title>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} h={48} />
        ))}
      </Stack>
    );
  }

  if (listQ.isError) {
    return (
      <ErrorState
        title="Couldn't load bookings"
        message={listQ.error.message}
        onRetry={() => listQ.refetch()}
      />
    );
  }

  // Settings is normally already cached after the AdminGate's initial probe.
  // If it errored here, fall back to UTC so the page still renders rather
  // than blocking the cancel flow.
  const timezone = settingsQ.data?.timezone ?? 'UTC';
  const items = listQ.data;

  const onCancelConfirm = () => {
    if (confirm.kind !== 'open') return;
    const { booking } = confirm;
    cancelM.mutate(
      { id: booking.id },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', title: 'Booking cancelled', message: '' });
          setConfirm({ kind: 'closed' });
        },
        onError: (err) => {
          if (err.status === 404) {
            // Benign race — invalidation already removed the row from the cache.
            notifications.show({ color: 'gray', title: 'Already cancelled', message: '' });
            setConfirm({ kind: 'closed' });
            return;
          }
          notifications.show({ color: 'red', title: 'Cancel failed', message: err.message });
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={2}>Bookings</Title>
        <TimezoneBanner timezone={timezone} />
      </Stack>

      {items.length === 0 ? (
        <Card withBorder p="xl">
          <Center>
            <Stack align="center" gap="sm">
              <Title order={4}>No upcoming bookings yet</Title>
              <Text c="dimmed" size="sm" ta="center">
                Share a link from Event types to start receiving bookings.
              </Text>
              <Button
                component={Link}
                to="/admin/event-types"
                leftSection={<IconCalendarEvent size={16} />}
              >
                Go to Event types
              </Button>
            </Stack>
          </Center>
        </Card>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>When</Table.Th>
              <Table.Th>Event type</Table.Th>
              <Table.Th>Duration</Table.Th>
              <Table.Th>Guest</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((b) => {
              const notesPreview = b.guestNotes ? truncate(b.guestNotes, NOTES_PREVIEW_LIMIT) : '';
              const truncated = !!b.guestNotes && b.guestNotes.length > NOTES_PREVIEW_LIMIT;
              return (
                <Table.Tr key={b.id}>
                  <Table.Td>{formatFullHuman(b.startTime, timezone)}</Table.Td>
                  <Table.Td>{b.eventTypeName}</Table.Td>
                  <Table.Td>{b.durationMinutesSnapshot} min</Table.Td>
                  <Table.Td>
                    <Stack gap={0}>
                      <Text size="sm">{b.guestName}</Text>
                      <Text size="xs" c="dimmed">
                        {b.guestEmail}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    {notesPreview ? (
                      truncated ? (
                        <Tooltip multiline w={320} label={b.guestNotes}>
                          <Text size="sm" style={{ cursor: 'help' }}>
                            {notesPreview}
                          </Text>
                        </Tooltip>
                      ) : (
                        <Text size="sm">{notesPreview}</Text>
                      )
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      color="red"
                      variant="subtle"
                      size="xs"
                      onClick={() => setConfirm({ kind: 'open', booking: b })}
                    >
                      Cancel
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      {confirm.kind === 'open' && (
        <CancelBookingModal
          opened
          booking={confirm.booking}
          timezone={timezone}
          isPending={cancelM.isPending}
          onConfirm={onCancelConfirm}
          onClose={() => {
            if (cancelM.isPending) return;
            setConfirm({ kind: 'closed' });
          }}
        />
      )}
    </Stack>
  );
}
