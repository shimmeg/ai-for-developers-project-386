import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Group,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { TimeInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import {
  useAdminSettings,
  useUpdateAdminSettings,
  type OwnerSettings,
} from '../../api/queries/settings';
import { ErrorState } from '../../components/ErrorState';
import { withCurrentTimezone } from '../../lib/timezones';
import {
  createSettingsFormSchema,
  type SettingsFormValues,
  normalizeSettings,
} from './settings-schema';

const DAYS: { key: keyof SettingsFormValues['workingHours']; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

function toFormValues(s: OwnerSettings): SettingsFormValues {
  return { timezone: s.timezone, workingHours: s.workingHours };
}

export function SettingsPage() {
  const settingsQ = useAdminSettings();

  if (settingsQ.isPending) {
    return (
      <Stack gap="md">
        <Skeleton h={32} />
        <Skeleton h={48} />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} h={36} />
        ))}
      </Stack>
    );
  }

  if (settingsQ.isError) {
    return (
      <ErrorState
        title="Couldn't load settings"
        message={settingsQ.error.message}
        onRetry={() => settingsQ.refetch()}
      />
    );
  }

  return <SettingsForm initial={settingsQ.data} />;
}

function SettingsForm({ initial }: { initial: OwnerSettings }) {
  const update = useUpdateAdminSettings();
  // Lock the form's seed to the data the page mounted with. Subsequent server
  // refetches do not silently overwrite in-progress edits — if the user wants
  // a fresh copy, they hit Reset (which uses the latest saved snapshot).
  const [savedSnapshot, setSavedSnapshot] = useState<OwnerSettings>(initial);

  const form = useForm<SettingsFormValues>({
    mode: 'controlled',
    initialValues: toFormValues(initial),
    validate: zod4Resolver(createSettingsFormSchema([initial.timezone])),
  });

  const tzData = withCurrentTimezone(form.getValues().timezone);

  const onSubmit = (values: SettingsFormValues) => {
    update.mutate(normalizeSettings(values), {
      onSuccess: (saved) => {
        setSavedSnapshot(saved);
        const fv = toFormValues(saved);
        form.setValues(fv);
        form.resetDirty(fv);
        notifications.show({ color: 'green', title: 'Settings saved', message: '' });
      },
    });
  };

  const errorMsg = update.error?.message ?? null;

  return (
    <Stack gap="md">
      <Title order={1} fz="h2">
        Settings
      </Title>
      {errorMsg && (
        <Alert color="red" icon={<IconAlertTriangle />} title="Couldn't save settings">
          {errorMsg}
        </Alert>
      )}
      <form onSubmit={form.onSubmit(onSubmit)}>
        <Stack gap="md">
          <Select
            label="Timezone"
            searchable
            data={tzData}
            key={form.key('timezone')}
            {...form.getInputProps('timezone')}
          />
          <Card withBorder>
            <Title order={4} mb="sm">
              Working hours
            </Title>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Day</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Start</Table.Th>
                  <Table.Th>End</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {DAYS.map(({ key, label }) => {
                  const day = form.getValues().workingHours[key];
                  const isOpen = day.status === 'open';
                  return (
                    <Table.Tr key={key}>
                      <Table.Td>{label}</Table.Td>
                      <Table.Td>
                        <Switch
                          checked={isOpen}
                          onChange={(e) => {
                            const checked = e.currentTarget.checked;
                            form.setFieldValue(
                              `workingHours.${key}`,
                              checked
                                ? { status: 'open', start: '09:00', end: '18:00' }
                                : { status: 'closed' },
                            );
                          }}
                          label={isOpen ? 'Open' : 'Closed'}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TimeInput
                          disabled={!isOpen}
                          placeholder="—"
                          {...form.getInputProps(`workingHours.${key}.start`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TimeInput
                          disabled={!isOpen}
                          placeholder="—"
                          {...form.getInputProps(`workingHours.${key}.end`)}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
          <Group justify="space-between">
            <Button
              variant="subtle"
              type="button"
              disabled={!form.isDirty() || update.isPending}
              onClick={() => form.setValues(toFormValues(savedSnapshot))}
            >
              Reset
            </Button>
            <Button
              type="submit"
              loading={update.isPending}
              disabled={!form.isDirty() || update.isPending}
            >
              Save changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
