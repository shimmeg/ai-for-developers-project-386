import { Card, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useCatalog, type PublicEventType } from '../../api/queries/eventTypes';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { TimezoneBanner } from '../../components/TimezoneBanner';
import { getErrorMessage } from '../../api/client';

export function CatalogPage() {
  const { data, isPending, isError, error, refetch } = useCatalog();

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Title order={1} fz="h2">
          Book a meeting
        </Title>
        <Text c="dimmed">
          Choose an event type to see available time slots in the next 14 days.
        </Text>
      </Stack>

      {isPending && (
        <Group justify="center" py="xl">
          <Loader size="md" />
        </Group>
      )}

      {isError && (
        <ErrorState
          title="Couldn't load event types"
          message={getErrorMessage(error, 'The booking service is unreachable.')}
          onRetry={() => refetch()}
        />
      )}

      {data && (
        <Stack gap="md">
          <TimezoneBanner timezone={data.timezone} />
          {data.eventTypes.length === 0 ? (
            <EmptyState
              order={3}
              title="No event types are published yet"
              description="Check back later — the calendar owner hasn't created any bookable event types."
            />
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              {data.eventTypes.map((et) => (
                <EventTypeCard key={et.slug} eventType={et} />
              ))}
            </SimpleGrid>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function EventTypeCard({ eventType }: { eventType: PublicEventType }) {
  return (
    <Card
      component={Link}
      to={`/events/${eventType.slug}`}
      withBorder
      padding="lg"
      radius="md"
      style={{ textDecoration: 'none', color: 'inherit' }}
      aria-label={`View available slots for ${eventType.name}`}
    >
      <Stack gap="xs">
        <Title order={4}>{eventType.name}</Title>
        <Group gap="xs" c="dimmed">
          <IconClock size={14} aria-hidden />
          <Text size="sm">{eventType.durationMinutes} min</Text>
        </Group>
        <Text size="sm" lineClamp={3}>
          {eventType.description}
        </Text>
      </Stack>
    </Card>
  );
}
