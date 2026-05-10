import { AppShell, Button, Container, Group, Text, Title } from '@mantine/core';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearAdminToken } from '../lib/adminToken';

export function AdminLayout() {
  const navigate = useNavigate();
  const handleSignOut = () => {
    clearAdminToken({ reason: 'signed-out' });
    navigate('/');
  };
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between">
            <Group gap="xl">
              <Link to="/admin/settings" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Title order={4}>Calendar (admin)</Title>
              </Link>
              <Group gap="md">
                <AdminNavLink to="/admin/settings">Settings</AdminNavLink>
                <AdminNavLink to="/admin/event-types">Event types</AdminNavLink>
              </Group>
            </Group>
            <Group gap="md">
              <Text size="sm" c="dimmed">
                Admin
              </Text>
              <Button variant="subtle" size="xs" onClick={handleSignOut}>
                Sign out
              </Button>
            </Group>
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

function AdminNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        textDecoration: 'none',
        color: 'inherit',
        fontWeight: isActive ? 600 : 400,
      })}
    >
      {children}
    </NavLink>
  );
}
