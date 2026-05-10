import { Center, Stack, Text, Title, type TitleOrder } from '@mantine/core';

type Props = {
  title: string;
  description?: string;
  /**
   * Heading level for the title. Should be one level deeper than the
   * surrounding page heading so the document outline stays sequential
   * (e.g. an h3 inside a page that owns an h2 title). Defaults to 4
   * for backwards compatibility with the original h3-titled callers.
   */
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
