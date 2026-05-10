import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bookingsAdminKeys,
  useAdminBookings,
  useCancelBooking,
  type Booking,
} from '../api/queries/bookingsAdmin';
import { HttpError } from '../lib/httpError';

const getMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('../api/adminClient', () => ({
  adminClient: {
    GET: (...args: unknown[]) => getMock(...args),
    DELETE: (...args: unknown[]) => deleteMock(...args),
  },
}));

const b1: Booking = {
  id: '5b3f8a2c-e7f4-4a1b-9c5d-2f7e8b0a6d3c',
  eventTypeSlug: 'intro-call',
  eventTypeName: 'Intro call',
  startTime: '2026-05-12T10:00:00+03:00',
  durationMinutesSnapshot: 30,
  guestName: 'Jane Doe',
  guestEmail: 'jane.doe@example.com',
  guestNotes: 'Looking forward to chatting.',
  createdAt: '2026-05-09T14:23:11+03:00',
};
const b2: Booking = {
  id: '9d2c3e4a-1b5f-4c8e-a3b7-8f0d6e2a9c1b',
  eventTypeSlug: 'deep-dive',
  eventTypeName: 'Deep dive',
  startTime: '2026-05-13T14:00:00+03:00',
  durationMinutesSnapshot: 60,
  guestName: 'Carlos Ramirez',
  guestEmail: 'carlos.ramirez@example.com',
  createdAt: '2026-05-09T11:08:44+03:00',
};

beforeEach(() => {
  getMock.mockReset();
  deleteMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Provider = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Provider };
}

const ok = <T,>(data: T) =>
  Promise.resolve({
    data,
    error: undefined,
    response: new Response(JSON.stringify(data), { status: 200 }),
  });
const ok204 = () =>
  Promise.resolve({
    data: undefined,
    error: undefined,
    response: new Response(null, { status: 204 }),
  });
const fail = (status: number, code: string, message: string) =>
  Promise.resolve({
    data: undefined,
    error: { code, message },
    response: new Response('{}', { status }),
  });

describe('useAdminBookings', () => {
  it('returns the list', async () => {
    getMock.mockReturnValue(ok([b1, b2]));
    const { Provider } = makeWrapper();
    const { result } = renderHook(() => useAdminBookings(), { wrapper: Provider });
    await waitFor(() => expect(result.current.data).toEqual([b1, b2]));
  });

  it('throws HttpError on a 4xx and does not retry', async () => {
    getMock.mockReturnValue(fail(401, 'unauthorized', 'bad token'));
    const { Provider } = makeWrapper();
    const { result } = renderHook(() => useAdminBookings(), { wrapper: Provider });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(HttpError);
    expect(result.current.error?.status).toBe(401);
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});

describe('useCancelBooking', () => {
  it('removes the row optimistically before the DELETE resolves', async () => {
    let resolve!: (r: { data?: undefined; error?: undefined; response: Response }) => void;
    deleteMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { qc, Provider } = makeWrapper();
    qc.setQueryData<Booking[]>(bookingsAdminKeys.all, [b1, b2]);
    const { result } = renderHook(() => useCancelBooking(), { wrapper: Provider });

    result.current.mutate({ id: b1.id });

    await waitFor(() =>
      expect(qc.getQueryData<Booking[]>(bookingsAdminKeys.all)).toEqual([b2]),
    );
    expect(deleteMock).toHaveBeenCalledTimes(1);
    const [, options] = deleteMock.mock.calls[0];
    expect((options as { params: { path: { id: string } } }).params.path.id).toBe(b1.id);

    resolve({ response: new Response(null, { status: 204 }) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls the row back when the DELETE returns 500', async () => {
    let resolve!: (r: {
      data?: undefined;
      error: { code: string; message: string };
      response: Response;
    }) => void;
    deleteMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { qc, Provider } = makeWrapper();
    qc.setQueryData<Booking[]>(bookingsAdminKeys.all, [b1, b2]);
    const { result } = renderHook(() => useCancelBooking(), { wrapper: Provider });

    result.current.mutate({ id: b1.id });

    await waitFor(() =>
      expect(qc.getQueryData<Booking[]>(bookingsAdminKeys.all)).toEqual([b2]),
    );

    resolve({
      data: undefined,
      error: { code: 'boom', message: 'server boom' },
      response: new Response('{}', { status: 500 }),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Booking[]>(bookingsAdminKeys.all)).toEqual([b1, b2]);
  });

  it('invalidates the list on success', async () => {
    deleteMock.mockReturnValueOnce(ok204());
    const { qc, Provider } = makeWrapper();
    qc.setQueryData<Booking[]>(bookingsAdminKeys.all, [b1, b2]);
    const { result } = renderHook(() => useCancelBooking(), { wrapper: Provider });

    result.current.mutate({ id: b1.id });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryState(bookingsAdminKeys.all)?.isInvalidated).toBe(true);
  });
});
