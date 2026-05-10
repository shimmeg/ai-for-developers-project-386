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
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCalendarEvent } from '@tabler/icons-react';
import { Link } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { TimezoneBanner } from '../../components/TimezoneBanner';
import { useAdminBookings, useCancelBooking, type Booking } from '../../api/queries/bookingsAdmin';
import { useAdminSettings } from '../../api/queries/settings';
import { formatFullHuman } from '../../lib/datetime';
import { CancelBookingModal } from './CancelBookingModal';

const NOTES_PREVIEW_LIMIT = 80;

function truncate(text: string, n: number): string {
  return text.length > n ? text.slice(0, n).trimEnd() + '…' : text;
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

  // Settings is normally already cached after the AdminGate's initial probe,
  // so settingsQ.isError is rare. Surface it explicitly rather than silently
  // falling back to UTC: misrepresenting times under a TimezoneBanner that
  // says the wrong zone is worse than not rendering times at all.
  if (listQ.isError || settingsQ.isError) {
    const isList = listQ.isError;
    const message = isList
      ? listQ.error.message
      : (settingsQ.error?.message ?? 'Please try again.');
    return (
      <ErrorState
        title={isList ? "Couldn't load bookings" : "Couldn't load settings"}
        message={message}
        onRetry={() => {
          if (listQ.isError) listQ.refetch();
          if (settingsQ.isError) settingsQ.refetch();
        }}
      />
    );
  }

  const timezone = settingsQ.data.timezone;
  const items = listQ.data;

  const onCancelConfirm = () => {
    // Guard against rapid double-clicks: a second mutate while the first is
    // in flight reads the optimistically-emptied cache as `previous` and can
    // roll back to the wrong state on error.
    if (confirm.kind !== 'open' || cancelM.isPending) return;
    const { booking } = confirm;
    const meta = `${booking.guestName} — ${formatFullHuman(booking.startTime, timezone)}`;
    cancelM.mutate(
      { id: booking.id },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', title: 'Booking cancelled', message: meta });
          setConfirm({ kind: 'closed' });
        },
        onError: (err) => {
          if (err.status === 404) {
            // Benign race — invalidation already removed the row from the cache.
            notifications.show({ color: 'gray', title: 'Already cancelled', message: meta });
            setConfirm({ kind: 'closed' });
            return;
          }
          // Non-404: rollback restored the row; close the modal and rely on
          // the toast for feedback. The owner can re-trigger from the row.
          notifications.show({ color: 'red', title: 'Cancel failed', message: err.message });
          setConfirm({ kind: 'closed' });
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
              const formattedStart = formatFullHuman(b.startTime, timezone);
              const truncated = !!b.guestNotes && b.guestNotes.length > NOTES_PREVIEW_LIMIT;
              return (
                <Table.Tr key={b.id}>
                  <Table.Td>{formattedStart}</Table.Td>
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
                    {!b.guestNotes ? (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    ) : truncated ? (
                      // Truncated notes are wrapped in an UnstyledButton so the
                      // trigger is a real interactive element. Mantine Tooltip
                      // wires aria-describedby to the full text on hover/focus/
                      // touch — no aria-label override (which would replace the
                      // visible truncated text as the accessible name).
                      <Tooltip
                        multiline
                        w={320}
                        label={b.guestNotes}
                        events={{ hover: true, focus: true, touch: true }}
                      >
                        <UnstyledButton style={{ cursor: 'help', textAlign: 'left' }}>
                          <Text size="sm">{truncate(b.guestNotes, NOTES_PREVIEW_LIMIT)}</Text>
                        </UnstyledButton>
                      </Tooltip>
                    ) : (
                      <Text size="sm">{b.guestNotes}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      color="red"
                      variant="subtle"
                      size="xs"
                      aria-label={`Cancel ${b.eventTypeName} with ${b.guestName} on ${formattedStart}`}
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
