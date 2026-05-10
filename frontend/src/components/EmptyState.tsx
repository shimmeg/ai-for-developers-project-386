import { Center, Stack, Text, Title, type TitleOrder } from '@mantine/core';

type Props = {
  title: string;
  description?: string;
  order?: TitleOrder;
};

export function EmptyState({ title, description, order = 4 }: Props) {
  return (
    <Center mih={200}>
      <Stack gap="xs" align="center">
        <Title order={order}>{title}</Title>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
      </Stack>
    </Center>
  );
}
