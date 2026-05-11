import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = 'Something went wrong',
  message = 'Please try again.',
  onRetry,
}: Props) {
  return (
    <Alert variant="light" color="red" icon={<IconAlertTriangle />} title={title} role="alert">
      <Stack gap="sm">
        <Text size="sm">{message}</Text>
        {onRetry && (
          <Group>
            <Button variant="subtle" color="red" size="xs" onClick={onRetry}>
              Retry
            </Button>
          </Group>
        )}
      </Stack>
    </Alert>
  );
}
