import { useRouteError } from 'react-router';
import { ErrorState } from './ErrorState';

export function RouteErrorElement() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error('Route error:', error);
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return (
    <ErrorState
      title="Something went wrong"
      message={message}
      onRetry={() => window.location.reload()}
    />
  );
}
