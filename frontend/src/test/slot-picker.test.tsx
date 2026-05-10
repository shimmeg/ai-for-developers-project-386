import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { SlotPickerPage } from '../features/slot-picker/SlotPickerPage';

const eventTypeData = {
  slug: 'intro',
  name: 'Intro call',
  description: 'A quick chat.',
  durationMinutes: 30,
};

const KNOWN_SLOT = '2026-05-12T10:00:00+03:00';
const OTHER_SLOT = '2026-05-12T10:30:00+03:00';

const slotsData = {
  timezone: 'Europe/Moscow',
  windowStart: '2026-05-12',
  windowEnd: '2026-05-25',
  days: [
    {
      date: '2026-05-12',
      status: 'open' as const,
      slots: [KNOWN_SLOT, OTHER_SLOT],
    },
  ],
};

vi.mock('../api/client', () => ({
  apiClient: {
    GET: vi.fn(async (path: string) => {
      if (path === '/event-types/{slug}') {
        return {
          data: eventTypeData,
          error: undefined,
          response: new Response('{}', { status: 200 }),
        };
      }
      if (path === '/event-types/{slug}/slots') {
        return {
          data: slotsData,
          error: undefined,
          response: new Response('{}', { status: 200 }),
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    }),
    POST: vi.fn(),
  },
  getErrorMessage: (_e: unknown, fallback = 'err') => fallback,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderAt(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let location: ReturnType<typeof useLocation> | null = null;
  function LocationProbe() {
    location = useLocation();
    return null;
  }
  const view = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Routes>
            <Route
              path="/events/:slug"
              element={
                <>
                  <SlotPickerPage />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...view, getLocation: () => location };
}

describe('SlotPickerPage — ?slot= round-trip', () => {
  it('selects the slot from the URL and enables Continue', async () => {
    renderAt(`/events/intro?slot=${encodeURIComponent(KNOWN_SLOT)}`);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Intro call' })).toBeInTheDocument(),
    );
    const buttons = await screen.findAllByRole('button', { pressed: true });
    expect(buttons).toHaveLength(1);
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('drops a stale slot from the URL and disables Continue', async () => {
    const STALE = '2099-01-01T00:00:00+03:00';
    const { getLocation } = renderAt(`/events/intro?slot=${encodeURIComponent(STALE)}`);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Intro call' })).toBeInTheDocument(),
    );
    await waitFor(() => expect(getLocation()?.search).toBe(''));
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });
});
