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

const a: Booking = {
  id: 'a-1',
  eventTypeSlug: 'intro-call',
  eventTypeName: 'Intro call',
  startTime: '2026-05-12T10:00:00+03:00',
  durationMinutesSnapshot: 30,
  guestName: 'Jane',
  guestEmail: 'jane@example.com',
  createdAt: '2026-05-09T14:23:11+03:00',
};
const b: Booking = {
  id: 'b-2',
  eventTypeSlug: 'deep-dive',
  eventTypeName: 'Deep dive',
  startTime: '2026-05-12T14:00:00+03:00',
  durationMinutesSnapshot: 60,
  guestName: 'Sam',
  guestEmail: 'sam@example.com',
  createdAt: '2026-05-10T09:14:02+03:00',
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
const noContent = () =>
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
    getMock.mockReturnValue(ok([a, b]));
    const { Provider } = makeWrapper();
    const { result } = renderHook(() => useAdminBookings(), { wrapper: Provider });
    await waitFor(() => expect(result.current.data).toEqual([a, b]));
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
  it('resolves on 204 and invalidates the list', async () => {
    deleteMock.mockReturnValue(noContent());
    const { qc, Provider } = makeWrapper();
    qc.setQueryData(bookingsAdminKeys.all, [a, b]);
    const { result } = renderHook(() => useCancelBooking(), { wrapper: Provider });
    result.current.mutate({ id: a.id });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryState(bookingsAdminKeys.all)?.isInvalidated).toBe(true);
  });

  it('optimistically removes the row before the DELETE resolves', async () => {
    let resolve!: () => void;
    deleteMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = () =>
          r({
            data: undefined,
            error: undefined,
            response: new Response(null, { status: 204 }),
          });
      }),
    );
    const { qc, Provider } = makeWrapper();
    qc.setQueryData(bookingsAdminKeys.all, [a, b]);
    const { result } = renderHook(() => useCancelBooking(), { wrapper: Provider });
    result.current.mutate({ id: a.id });
    await waitFor(() =>
      expect(qc.getQueryData<Booking[]>(bookingsAdminKeys.all)).toEqual([b]),
    );
    resolve();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls the cache back when the DELETE returns 500', async () => {
    let resolve!: () => void;
    deleteMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = () =>
          r({
            data: undefined,
            error: { code: 'boom', message: 'server boom' },
            response: new Response('{}', { status: 500 }),
          });
      }),
    );
    const { qc, Provider } = makeWrapper();
    qc.setQueryData(bookingsAdminKeys.all, [a, b]);
    const { result } = renderHook(() => useCancelBooking(), { wrapper: Provider });
    result.current.mutate({ id: a.id });
    await waitFor(() =>
      expect(qc.getQueryData<Booking[]>(bookingsAdminKeys.all)).toEqual([b]),
    );
    resolve();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Booking[]>(bookingsAdminKeys.all)).toEqual([a, b]);
  });

  it('rolls the cache back when the DELETE returns 404', async () => {
    let resolve!: () => void;
    deleteMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = () =>
          r({
            data: undefined,
            error: { code: 'not_found', message: 'gone' },
            response: new Response('{}', { status: 404 }),
          });
      }),
    );
    const { qc, Provider } = makeWrapper();
    qc.setQueryData(bookingsAdminKeys.all, [a, b]);
    const { result } = renderHook(() => useCancelBooking(), { wrapper: Provider });
    result.current.mutate({ id: a.id });
    await waitFor(() =>
      expect(qc.getQueryData<Booking[]>(bookingsAdminKeys.all)).toEqual([b]),
    );
    resolve();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.status).toBe(404);
    expect(qc.getQueryData<Booking[]>(bookingsAdminKeys.all)).toEqual([a, b]);
  });
});
