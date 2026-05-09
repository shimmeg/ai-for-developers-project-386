import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CatalogPage } from '../features/catalog/CatalogPage';

vi.mock('../api/client', () => {
  return {
    apiClient: {
      GET: vi.fn(async () => ({
        data: {
          timezone: 'Europe/Moscow',
          eventTypes: [
            {
              slug: 'intro-call',
              name: 'Intro call',
              description: 'A quick chat to get to know each other.',
              durationMinutes: 30,
            },
          ],
        },
        error: undefined,
        response: new Response('{}', { status: 200 }),
      })),
      POST: vi.fn(),
    },
    getErrorMessage: (_e: unknown, fallback = 'err') => fallback,
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <CatalogPage />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders catalog with mocked event types', async () => {
    renderPage();

    expect(screen.getByText('Book a meeting')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Intro call')).toBeInTheDocument();
    });

    expect(screen.getByText('30 min')).toBeInTheDocument();
    expect(screen.getByText(/All times shown in Europe\/Moscow/)).toBeInTheDocument();
  });
});
