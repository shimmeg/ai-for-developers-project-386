import { Center, Stack, Text, Title } from '@mantine/core';

type Props = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: Props) {
  return (
    <Center mih={200}>
      <Stack gap="xs" align="center">
        <Title order={4}>{title}</Title>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
      </Stack>
    </Center>
  );
}
