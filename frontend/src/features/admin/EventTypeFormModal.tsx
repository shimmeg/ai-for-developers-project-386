import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import { EventTypeFormSchema, diffEventType, type EventTypeFormValues } from './event-type-schema';
import {
  useCreateEventType,
  useUpdateEventType,
  type EventType,
} from '../../api/queries/eventTypesAdmin';

type Props =
  | { opened: boolean; onClose: () => void; mode: 'create' }
  | { opened: boolean; onClose: () => void; mode: 'edit'; eventType: EventType };

const CREATE_DEFAULTS: EventTypeFormValues = {
  slug: '',
  name: '',
  description: '',
  durationMinutes: 30,
};

function toFormValues(ev: EventType): EventTypeFormValues {
  return {
    slug: ev.slug,
    name: ev.name,
    description: ev.description,
    durationMinutes: ev.durationMinutes,
  };
}

export function EventTypeFormModal(props: Props) {
  const isEdit = props.mode === 'edit';
  const initial = isEdit ? toFormValues(props.eventType) : CREATE_DEFAULTS;

  const form = useForm<EventTypeFormValues>({
    mode: 'controlled',
    initialValues: initial,
    validate: zod4Resolver(EventTypeFormSchema),
  });

  const createM = useCreateEventType();
  const updateM = useUpdateEventType();
  const pending = createM.isPending || updateM.isPending;
  const error = createM.error ?? updateM.error;

  const slugConflict =
    error?.status === 409 ? 'This slug is already in use. Pick a different one.' : null;
  const topAlert =
    error && error.status !== 409 && error.status !== 401
      ? { color: 'red' as const, message: error.message }
      : null;

  const onSubmit = (values: EventTypeFormValues) => {
    const normalized = EventTypeFormSchema.parse(values);
    if (isEdit) {
      const body = diffEventType(initial, normalized);
      if (Object.keys(body).length === 0) return;
      updateM.mutate(
        { slug: props.eventType.slug, body },
        {
          onSuccess: (saved) => {
            notifications.show({ color: 'green', title: `${saved.name} updated`, message: '' });
            props.onClose();
          },
        },
      );
    } else {
      createM.mutate(normalized, {
        onSuccess: (saved) => {
          notifications.show({ color: 'green', title: `${saved.name} created`, message: '' });
          props.onClose();
        },
      });
    }
  };

  return (
    <Modal
      opened={props.opened}
      onClose={() => {
        if (pending) return;
        props.onClose();
      }}
      title={isEdit ? `Edit ${props.eventType.name}` : 'New event type'}
      centered
      closeOnClickOutside={!form.isDirty()}
    >
      <form onSubmit={form.onSubmit(onSubmit)}>
        <Stack gap="md">
          {topAlert && (
            <Alert color={topAlert.color} icon={<IconAlertTriangle />}>
              {topAlert.message}
            </Alert>
          )}
          <TextInput
            label="Slug"
            placeholder="lowercase-with-hyphens"
            required
            description={isEdit ? "Changing the slug breaks any links you've shared." : undefined}
            styles={{ input: { fontFamily: 'ui-monospace, monospace' } }}
            key={form.key('slug')}
            {...form.getInputProps('slug')}
            error={form.errors.slug ?? slugConflict}
          />
          <TextInput label="Name" required key={form.key('name')} {...form.getInputProps('name')} />
          <Textarea
            label="Description"
            required
            autosize
            minRows={3}
            key={form.key('description')}
            {...form.getInputProps('description')}
          />
          <NumberInput
            label="Duration"
            required
            min={1}
            max={60 * 24}
            suffix=" min"
            key={form.key('durationMinutes')}
            {...form.getInputProps('durationMinutes')}
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {isEdit
                ? 'Changes apply to future bookings only.'
                : 'New event types are active by default.'}
            </Text>
            <Group gap="sm">
              <Button variant="subtle" type="button" onClick={props.onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} disabled={isEdit ? !form.isDirty() : false}>
                Save
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
