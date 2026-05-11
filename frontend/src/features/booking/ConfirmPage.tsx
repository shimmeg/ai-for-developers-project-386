import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { IconAlertTriangle, IconArrowLeft, IconClock, IconCalendar } from '@tabler/icons-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useCatalog, useEventType } from '../../api/queries/eventTypes';
import { useCreateBooking } from '../../api/queries/bookings';
import { ErrorState } from '../../components/ErrorState';
import { TimezoneBanner } from '../../components/TimezoneBanner';
import { formatFullHuman } from '../../lib/datetime';

const formSchema = z.object({
  guestName: z.string().trim().min(1, 'Please enter your name').max(120),
  guestEmail: z.email('Please enter a valid email address'),
  guestNotes: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function ConfirmPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const slot = searchParams.get('slot');

  if (!slug) {
    return <ErrorState title="Missing event type" message="No event type was specified." />;
  }
  if (!slot) {
    return (
      <Stack gap="md">
        <Alert color="orange" icon={<IconAlertTriangle />}>
          No time slot was selected.
        </Alert>
        <Anchor component={Link} to={`/events/${slug}`}>
          Pick a slot
        </Anchor>
      </Stack>
    );
  }
  return <ConfirmView slug={slug} slot={slot} />;
}

function ConfirmView({ slug, slot }: { slug: string; slot: string }) {
  const navigate = useNavigate();

  const eventTypeQ = useEventType(slug);
  const catalogQ = useCatalog();
  const timezone = catalogQ.data?.timezone;
  const createBooking = useCreateBooking();

  const form = useForm<FormValues>({
    mode: 'uncontrolled',
    initialValues: { guestName: '', guestEmail: '', guestNotes: '' },
    validate: zod4Resolver(formSchema),
  });

  const handleSubmit = (values: FormValues) => {
    createBooking.mutate(
      {
        slug,
        body: {
          startTime: slot,
          guestName: values.guestName,
          guestEmail: values.guestEmail,
          guestNotes: values.guestNotes?.length ? values.guestNotes : undefined,
        },
      },
      {
        onSuccess: (booking) => {
          navigate(`/events/${slug}/booked/${booking.id}`, {
            state: { booking },
          });
        },
      },
    );
  };

  const eventTypeError = eventTypeQ.error;
  const eventTypeNotFound = eventTypeError?.status === 404;
  const bookingError = createBooking.error;

  return (
    <Stack gap="md">
      <Anchor component={Link} to={`/events/${slug}?slot=${encodeURIComponent(slot)}`} size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} aria-hidden />
          Back to slot picker
        </Group>
      </Anchor>

      {eventTypeQ.isPending && (
        <Group justify="center" py="xl">
          <Loader size="md" />
        </Group>
      )}

      {eventTypeQ.isError && eventTypeNotFound && (
        <ErrorState
          title="Event type not available"
          message="This event type is no longer published. It may have been deactivated by the host."
        />
      )}

      {eventTypeQ.isError && !eventTypeNotFound && (
        <ErrorState
          title="Couldn't load event type"
          message={eventTypeError?.message ?? 'The booking service is unreachable.'}
          onRetry={() => eventTypeQ.refetch()}
        />
      )}

      {eventTypeQ.data && (
        <Stack gap="md">
          <Stack gap="xs">
            <Title order={1} fz="h2">
              Confirm your booking
            </Title>
            <Text c="dimmed">{eventTypeQ.data.name}</Text>
          </Stack>

          {timezone && <TimezoneBanner timezone={timezone} />}

          <Paper withBorder p="md" radius="md">
            <Stack gap="xs">
              <Group gap="xs">
                <IconCalendar size={16} aria-hidden />
                <Text fw={500}>{timezone ? formatFullHuman(slot, timezone) : slot}</Text>
              </Group>
              <Group gap="xs" c="dimmed">
                <IconClock size={14} aria-hidden />
                <Text size="sm">{eventTypeQ.data.durationMinutes} min</Text>
              </Group>
            </Stack>
          </Paper>

          {bookingError?.status === 409 && (
            <Alert color="orange" icon={<IconAlertTriangle />} title="Slot is no longer available">
              <Stack gap="xs">
                <Text size="sm">
                  This slot was just taken or the schedule changed. Please pick another time.
                </Text>
                <Anchor component={Link} to={`/events/${slug}`} size="sm">
                  Choose a different slot
                </Anchor>
              </Stack>
            </Alert>
          )}

          {bookingError?.status === 404 && (
            <Alert color="red" icon={<IconAlertTriangle />}>
              This event type is no longer available.
            </Alert>
          )}

          {bookingError?.status === 400 && (
            <Alert color="red" icon={<IconAlertTriangle />} title="Please check your details">
              The booking service rejected this request. Review the form fields below and try again.
            </Alert>
          )}

          {bookingError &&
            bookingError.status !== 409 &&
            bookingError.status !== 404 &&
            bookingError.status !== 400 && (
              <Alert
                color="red"
                icon={<IconAlertTriangle />}
                title="The booking service is unreachable"
              >
                Please try again in a moment. If the problem persists, contact the host directly.
              </Alert>
            )}

          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              <TextInput
                label="Your name"
                placeholder="Jane Doe"
                required
                key={form.key('guestName')}
                {...form.getInputProps('guestName')}
              />
              <TextInput
                label="Email"
                placeholder="jane@example.com"
                type="email"
                required
                key={form.key('guestEmail')}
                {...form.getInputProps('guestEmail')}
              />
              <Textarea
                label="Notes"
                placeholder="Anything the host should know? (optional)"
                autosize
                minRows={3}
                key={form.key('guestNotes')}
                {...form.getInputProps('guestNotes')}
              />
              <Group justify="flex-end">
                <Button
                  type="submit"
                  loading={createBooking.isPending}
                  disabled={createBooking.isPending}
                >
                  Confirm booking
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      )}
    </Stack>
  );
}
