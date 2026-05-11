import { useEffect, useMemo } from 'react';
import {
  Anchor,
  Button,
  Group,
  Loader,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft, IconClock } from '@tabler/icons-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useEventType } from '../../api/queries/eventTypes';
import { useSlots } from '../../api/queries/slots';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { TimezoneBanner } from '../../components/TimezoneBanner';
import { DayColumn } from './DayColumn';

export function SlotPickerPage() {
  const { slug } = useParams<{ slug: string }>();

  if (!slug) {
    return <ErrorState title="Missing event type" message="No event type was specified." />;
  }

  return <SlotPickerView slug={slug} />;
}

function SlotPickerView({ slug }: { slug: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const eventTypeQ = useEventType(slug);
  const slotsQ = useSlots(slug);

  const urlSlot = searchParams.get('slot');

  const allSlots = useMemo(
    () =>
      slotsQ.data
        ? new Set(slotsQ.data.days.flatMap((d) => (d.status === 'open' ? d.slots : [])))
        : null,
    [slotsQ.data],
  );
  const validSelectedSlot = urlSlot && allSlots?.has(urlSlot) ? urlSlot : null;

  // If the URL points at a slot the server no longer offers (e.g. someone
  // shared a stale link or the slot was just booked elsewhere), drop the
  // search param so Continue is disabled and the picker doesn't lie about
  // selection state.
  useEffect(() => {
    if (urlSlot && allSlots && !allSlots.has(urlSlot)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('slot');
          return next;
        },
        { replace: true },
      );
    }
  }, [urlSlot, allSlots, setSearchParams]);

  const handleSelect = (slot: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('slot', slot);
      return next;
    });
  };

  const handleContinue = () => {
    if (!validSelectedSlot) return;
    navigate(`/events/${slug}/confirm?slot=${encodeURIComponent(validSelectedSlot)}`);
  };

  const eventTypeNotFound = eventTypeQ.error?.status === 404;

  return (
    <Stack gap="md">
      <Anchor component={Link} to="/" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} aria-hidden />
          Back to catalog
        </Group>
      </Anchor>

      {(eventTypeQ.isPending || slotsQ.isPending) && (
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
          message={eventTypeQ.error?.message ?? 'The booking service is unreachable.'}
          onRetry={() => eventTypeQ.refetch()}
        />
      )}

      {eventTypeQ.data && (
        <Stack gap="md">
          <Stack gap="xs">
            <Title order={1} fz="h2">
              {eventTypeQ.data.name}
            </Title>
            <Group gap="xs" c="dimmed">
              <IconClock size={16} aria-hidden />
              <Text size="sm">{eventTypeQ.data.durationMinutes} min</Text>
            </Group>
            <Text>{eventTypeQ.data.description}</Text>
          </Stack>

          {slotsQ.data && <TimezoneBanner timezone={slotsQ.data.timezone} />}

          {slotsQ.isError && (
            <ErrorState
              title="Couldn't load slots"
              message={slotsQ.error?.message ?? 'The booking service is unreachable.'}
              onRetry={() => slotsQ.refetch()}
            />
          )}

          {slotsQ.data && (
            <>
              <ScrollArea>
                <SimpleGrid cols={{ base: 2, sm: 4, md: 7 }} spacing="sm">
                  {slotsQ.data.days.map((day) => (
                    <DayColumn
                      key={day.date}
                      day={day}
                      timezone={slotsQ.data.timezone}
                      selectedSlot={validSelectedSlot}
                      onSelect={handleSelect}
                    />
                  ))}
                </SimpleGrid>
              </ScrollArea>

              {slotsQ.data.days.every((d) => d.status !== 'open' || d.slots.length === 0) && (
                <EmptyState
                  order={3}
                  title="No slots available in the next 14 days"
                  description="Please check back later."
                />
              )}

              <Group justify="flex-end" mt="md">
                <Button disabled={!validSelectedSlot} onClick={handleContinue}>
                  Continue
                </Button>
              </Group>
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}
