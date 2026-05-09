import { Anchor, Button, Group, Loader, ScrollArea, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconClock } from '@tabler/icons-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEventType } from '../../api/queries/eventTypes';
import { useSlots } from '../../api/queries/slots';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { TimezoneBanner } from '../../components/TimezoneBanner';
import { DayColumn } from './DayColumn';
import { getErrorMessage } from '../../api/client';

export function SlotPickerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const eventTypeQ = useEventType(slug);
  const slotsQ = useSlots(slug);

  const selectedSlot = searchParams.get('slot');

  const handleSelect = (slot: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('slot', slot);
      return next;
    });
  };

  const handleContinue = () => {
    if (!slug || !selectedSlot) return;
    navigate(`/events/${slug}/confirm?slot=${encodeURIComponent(selectedSlot)}`);
  };

  if (!slug) {
    return <ErrorState title="Missing event type" message="No event type was specified." />;
  }

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

      {eventTypeQ.isError && (
        <ErrorState
          title="Couldn't load event type"
          message={getErrorMessage(eventTypeQ.error)}
          onRetry={() => eventTypeQ.refetch()}
        />
      )}

      {eventTypeQ.data && slotsQ.data && (
        <Stack gap="md">
          <Stack gap="xs">
            <Title order={2}>{eventTypeQ.data.name}</Title>
            <Group gap="xs" c="dimmed">
              <IconClock size={16} aria-hidden />
              <Text size="sm">{eventTypeQ.data.durationMinutes} min</Text>
            </Group>
            <Text>{eventTypeQ.data.description}</Text>
          </Stack>

          <TimezoneBanner timezone={slotsQ.data.timezone} />

          {slotsQ.isError && (
            <ErrorState
              title="Couldn't load slots"
              message={getErrorMessage(slotsQ.error)}
              onRetry={() => slotsQ.refetch()}
            />
          )}

          <ScrollArea>
            <SimpleGrid cols={{ base: 2, sm: 4, md: 7 }} spacing="sm">
              {slotsQ.data.days.map((day) => (
                <DayColumn
                  key={day.date}
                  day={day}
                  selectedSlot={selectedSlot}
                  onSelect={handleSelect}
                />
              ))}
            </SimpleGrid>
          </ScrollArea>

          {slotsQ.data.days.every((d) => d.status !== 'open' || d.slots.length === 0) && (
            <EmptyState
              title="No slots available in the next 14 days"
              description="Please check back later."
            />
          )}

          <Group justify="flex-end" mt="md">
            <Button disabled={!selectedSlot} onClick={handleContinue}>
              Continue
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
