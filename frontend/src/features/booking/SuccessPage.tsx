import { Alert, Anchor, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconCheck, IconCalendar, IconClock, IconUser, IconMail } from '@tabler/icons-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Booking } from '../../api/queries/bookings';
import { useCatalog } from '../../api/queries/eventTypes';
import { TimezoneBanner } from '../../components/TimezoneBanner';
import { formatFullHuman } from '../../lib/datetime';

type LocationState = { booking?: Booking } | null;

export function SuccessPage() {
  const { id: bookingId } = useParams<{ slug: string; id: string }>();
  const location = useLocation();
  const catalogQ = useCatalog();
  const timezone = catalogQ.data?.timezone;
  const booking = (location.state as LocationState)?.booking;

  if (!booking) {
    return (
      <Stack gap="md">
        <Alert color="blue" icon={<IconCheck />} title="Booking confirmed">
          {bookingId
            ? `Your booking (${bookingId}) was created. Please contact the host with this id for the details — v1 doesn't keep them on the client after a refresh.`
            : 'Your booking was created.'}
        </Alert>
        <Anchor component={Link} to="/">
          Back to catalog
        </Anchor>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Alert color="green" icon={<IconCheck />} title="Booking confirmed">
        We've reserved your time slot. No email is sent in v1 — please save these details.
      </Alert>

      {timezone && <TimezoneBanner timezone={timezone} />}

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Title order={3}>{booking.eventTypeName}</Title>
          <Group gap="xs">
            <IconCalendar size={16} aria-hidden />
            <Text fw={500}>
              {timezone ? formatFullHuman(booking.startTime, timezone) : booking.startTime}
            </Text>
          </Group>
          <Group gap="xs" c="dimmed">
            <IconClock size={14} aria-hidden />
            <Text size="sm">{booking.durationMinutesSnapshot} min</Text>
          </Group>
          <Group gap="xs">
            <IconUser size={14} aria-hidden />
            <Text size="sm">{booking.guestName}</Text>
          </Group>
          <Group gap="xs">
            <IconMail size={14} aria-hidden />
            <Text size="sm">{booking.guestEmail}</Text>
          </Group>
          {booking.guestNotes && (
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Notes
              </Text>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {booking.guestNotes}
              </Text>
            </Stack>
          )}
          <Text size="xs" c="dimmed">
            Booking id: {booking.id}
          </Text>
        </Stack>
      </Paper>

      <Group>
        <Button component={Link} to="/" variant="light">
          Book another
        </Button>
      </Group>
    </Stack>
  );
}
