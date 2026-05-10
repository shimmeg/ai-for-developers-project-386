import { useState } from 'react';
import {
  Button,
  Card,
  Center,
  Code,
  Group,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import {
  eventTypesAdminKeys,
  useAdminEventTypes,
  type EventType,
} from '../../api/queries/eventTypesAdmin';
import { HttpError } from '../../lib/httpError';
import { adminClient } from '../../api/adminClient';
import { EventTypeFormModal } from './EventTypeFormModal';

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; eventType: EventType };

function useToggleActive() {
  const queryClient = useQueryClient();
  return useMutation<
    EventType,
    HttpError,
    { slug: string; active: boolean },
    { previous?: EventType[] }
  >({
    retry: false,
    mutationFn: async ({ slug, active }) => {
      const res = await adminClient.PATCH('/admin/event-types/{slug}', {
        params: { path: { slug } },
        body: { active },
      });
      if (res.error) {
        throw new HttpError(
          res.response.status,
          res.error.code ?? 'http_error',
          res.error.message ?? 'Update failed',
        );
      }
      return res.data;
    },
    onMutate: async ({ slug, active }) => {
      await queryClient.cancelQueries({ queryKey: eventTypesAdminKeys.all });
      const previous = queryClient.getQueryData<EventType[]>(eventTypesAdminKeys.all);
      if (previous) {
        queryClient.setQueryData<EventType[]>(
          eventTypesAdminKeys.all,
          previous.map((e) => (e.slug === slug ? { ...e, active } : e)),
        );
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(eventTypesAdminKeys.all, ctx.previous);
      notifications.show({ color: 'red', title: 'Failed to update', message: err.message });
    },
    onSuccess: (saved) => {
      notifications.show({
        color: saved.active ? 'green' : 'gray',
        title: saved.active
          ? `${saved.name} is now active`
          : `${saved.name} is now hidden from the catalog`,
        message: '',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: eventTypesAdminKeys.all });
    },
  });
}

export function EventTypesPage() {
  const listQ = useAdminEventTypes();
  const toggle = useToggleActive();
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  if (listQ.isPending) {
    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Event types</Title>
        </Group>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} h={48} />
        ))}
      </Stack>
    );
  }

  if (listQ.isError) {
    const err = listQ.error as Error;
    return (
      <ErrorState
        title="Couldn't load event types"
        message={err.message}
        onRetry={() => listQ.refetch()}
      />
    );
  }

  const items = listQ.data;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={2}>Event types</Title>
          <Text c="dimmed" size="sm">
            All event types — active and inactive. Toggle a row to publish or hide it from the public catalog.
          </Text>
        </Stack>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ kind: 'create' })}>
          New event type
        </Button>
      </Group>

      {items.length === 0 ? (
        <Card withBorder p="xl">
          <Center>
            <Stack align="center" gap="sm">
              <Title order={4}>No event types yet</Title>
              <Text c="dimmed" size="sm">
                Create the first one to make it bookable on the public catalog.
              </Text>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setModal({ kind: 'create' })}
              >
                New event type
              </Button>
            </Stack>
          </Center>
        </Card>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Slug</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Duration</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((ev) => (
              <Table.Tr key={ev.slug}>
                <Table.Td>
                  <Code>{ev.slug}</Code>
                </Table.Td>
                <Table.Td>{ev.name}</Table.Td>
                <Table.Td>{ev.durationMinutes} min</Table.Td>
                <Table.Td>
                  <Switch
                    aria-label="Toggle active"
                    checked={ev.active}
                    disabled={toggle.isPending}
                    onChange={(e) => {
                      if (toggle.isPending) return;
                      toggle.mutate({ slug: ev.slug, active: e.currentTarget.checked });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => setModal({ kind: 'edit', eventType: ev })}
                  >
                    Edit
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {modal.kind === 'create' && (
        <EventTypeFormModal mode="create" opened onClose={() => setModal({ kind: 'closed' })} />
      )}
      {modal.kind === 'edit' && (
        <EventTypeFormModal
          mode="edit"
          eventType={modal.eventType}
          opened
          onClose={() => setModal({ kind: 'closed' })}
        />
      )}
    </Stack>
  );
}
