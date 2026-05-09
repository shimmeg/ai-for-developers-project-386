import { Anchor, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <Stack gap="sm" align="center" py="xl">
      <Title order={2}>404 — Not found</Title>
      <Text c="dimmed">The page you're looking for doesn't exist.</Text>
      <Anchor component={Link} to="/">
        Back to catalog
      </Anchor>
    </Stack>
  );
}
