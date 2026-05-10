import { AppShell, Container, Group, Text, Title } from '@mantine/core';
import { Link, Outlet } from 'react-router';

export function Layout() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between">
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Title order={4}>Calendar</Title>
            </Link>
            <Text size="sm" c="dimmed">
              Guest booking
            </Text>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
