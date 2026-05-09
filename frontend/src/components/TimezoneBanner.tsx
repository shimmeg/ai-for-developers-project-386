import { Group, Text } from '@mantine/core';
import { IconWorld } from '@tabler/icons-react';

type Props = {
  timezone: string;
};

export function TimezoneBanner({ timezone }: Props) {
  return (
    <Group gap="xs" c="dimmed">
      <IconWorld size={16} aria-hidden />
      <Text size="sm">All times shown in {timezone}.</Text>
    </Group>
  );
}
