import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateBooking } from '../api/queries/bookings';
import { slotsKeys } from '../api/queries/slots';

const postMock = vi.fn();

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    apiClient: {
      GET: vi.fn(),
      POST: (...args: unknown[]) => postMock(...args),
    },
  };
});

beforeEach(() => {
  postMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Pre-seed the slots cache so we can observe invalidation.
  qc.setQueryData(slotsKeys.forSlug('intro'), {
    timezone: 'Europe/Moscow',
    windowStart: '2026-05-12',
    windowEnd: '2026-05-25',
    days: [],
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe('useCreateBooking — 409 conflict', () => {
  it('invalidates the slot-picker query so the next view re-fetches', async () => {
    const { qc, wrapper } = setup();
    const stateBefore = qc.getQueryState(slotsKeys.forSlug('intro'));
    expect(stateBefore?.isInvalidated).toBe(false);

    postMock.mockResolvedValue({
      data: undefined,
      error: { code: 'slot_unavailable', message: 'gone' },
      response: new Response('{}', { status: 409 }),
    });

    const { result } = renderHook(() => useCreateBooking(), { wrapper });
    result.current.mutate({
      slug: 'intro',
      body: {
        startTime: '2026-05-12T10:00:00+03:00',
        guestName: 'Test',
        guestEmail: 't@e.com',
      },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const stateAfter = qc.getQueryState(slotsKeys.forSlug('intro'));
    expect(stateAfter?.isInvalidated).toBe(true);
  });

  it('does NOT invalidate the slot-picker query on a 400 (client validation)', async () => {
    const { qc, wrapper } = setup();
    postMock.mockResolvedValue({
      data: undefined,
      error: { code: 'invalid', message: 'bad email' },
      response: new Response('{}', { status: 400 }),
    });

    const { result } = renderHook(() => useCreateBooking(), { wrapper });
    result.current.mutate({
      slug: 'intro',
      body: {
        startTime: '2026-05-12T10:00:00+03:00',
        guestName: 'Test',
        guestEmail: 'not-an-email',
      },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const state = qc.getQueryState(slotsKeys.forSlug('intro'));
    expect(state?.isInvalidated).toBe(false);
  });
});
