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

const okResponse = <T,>(data: T) => ({
  data,
  error: undefined,
  response: new Response(JSON.stringify(data), { status: 200 }),
});

const failResponse = (status: number, code: string, message: string) => ({
  data: undefined,
  error: { code, message },
  response: new Response('{}', { status }),
});

const eventTypeResult = vi.fn();
const slotsResult = vi.fn();

vi.mock('../api/client', () => ({
  apiClient: {
    GET: vi.fn(async (path: string) => {
      if (path === '/event-types/{slug}') return eventTypeResult();
      if (path === '/event-types/{slug}/slots') return slotsResult();
      throw new Error(`Unexpected path: ${path}`);
    }),
    POST: vi.fn(),
  },
  getErrorMessage: (_e: unknown, fallback = 'err') => fallback,
}));

beforeEach(() => {
  eventTypeResult.mockReset();
  slotsResult.mockReset();
  eventTypeResult.mockReturnValue(okResponse(eventTypeData));
  slotsResult.mockReturnValue(okResponse(slotsData));
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

describe('SlotPickerPage — slots fetch failures', () => {
  it('renders the slots error state with retry when slots fetch fails on first load', async () => {
    slotsResult.mockReturnValue(failResponse(500, 'server_error', 'service unavailable'));
    renderAt('/events/intro');

    // The event-type header still renders so the user has context...
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Intro call' })).toBeInTheDocument(),
    );

    // ...and the slots panel surfaces a retry-able error instead of a blank picker.
    expect(await screen.findByText(/couldn't load slots/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    // No Continue button when slots haven't loaded.
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });

  it('renders the slots 404 error message text', async () => {
    slotsResult.mockReturnValue(failResponse(404, 'not_found', 'Event type not found'));
    renderAt('/events/intro');

    expect(await screen.findByText(/couldn't load slots/i)).toBeInTheDocument();
    expect(screen.getByText(/event type not found/i)).toBeInTheDocument();
  });
});
