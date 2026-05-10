import { useState } from 'react';
import { Alert, Anchor, Button, Group, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { setAdminToken, getRejectedAt } from '../../lib/adminToken';
import { pingAdmin } from '../../api/adminClient';
import { settingsKeys } from '../../api/queries/settings';

type Status = 'idle' | 'submitting' | 'rejected' | 'network';

export function AdminTokenModal() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>(() =>
    getRejectedAt() != null ? 'rejected' : 'idle',
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting' || token.length === 0) return;
    setStatus('submitting');
    const result = await pingAdmin(token);
    if (result.ok) {
      setAdminToken(token);
      // Seed the cache with the settings we already fetched during validation,
      // so the admin layout doesn't immediately re-request the same data.
      queryClient.setQueryData(settingsKeys.all, result.settings);
      return;
    }
    if (result.kind === 'rejected') {
      setStatus('rejected');
      setToken('');
      return;
    }
    setStatus('network');
  };

  return (
    <Modal
      opened
      onClose={() => {
        /* gate-controlled */
      }}
      withCloseButton={false}
      closeOnEscape={false}
      closeOnClickOutside={false}
      centered
      title="Admin sign in"
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          {status === 'rejected' && (
            <Alert color="red" icon={<IconAlertTriangle />} title="Token rejected">
              That token was rejected. Please try again.
            </Alert>
          )}
          {status === 'network' && (
            <Alert color="orange" icon={<IconAlertTriangle />} title="Connection problem">
              Couldn't reach the server. Please try again.
            </Alert>
          )}
          <PasswordInput
            label="Admin token"
            placeholder="Enter your token"
            required
            autoFocus
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
            disabled={status === 'submitting'}
          />
          <Group justify="space-between">
            <Anchor component={Link} to="/" size="sm">
              Back to public catalog
            </Anchor>
            <Button
              type="submit"
              loading={status === 'submitting'}
              disabled={status === 'submitting' || token.length === 0}
            >
              Sign in
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            The token is provided by the calendar owner. It is stored locally in this browser.
          </Text>
        </Stack>
      </form>
    </Modal>
  );
}
