import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  eventTypesAdminKeys,
  useAdminEventTypes,
  useCreateEventType,
  useUpdateEventType,
  type EventType,
} from '../api/queries/eventTypesAdmin';
import { HttpError } from '../lib/httpError';

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();

vi.mock('../api/adminClient', () => ({
  adminClient: {
    GET: (...args: unknown[]) => getMock(...args),
    POST: (...args: unknown[]) => postMock(...args),
    PATCH: (...args: unknown[]) => patchMock(...args),
  },
}));

const ev: EventType = {
  slug: 'intro-call',
  name: 'Intro call',
  description: '...',
  durationMinutes: 30,
  active: true,
};

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
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
const fail = (status: number, code: string, message: string) =>
  Promise.resolve({
    data: undefined,
    error: { code, message },
    response: new Response('{}', { status }),
  });

describe('useAdminEventTypes', () => {
  it('returns the list', async () => {
    getMock.mockReturnValue(ok([ev]));
    const { Provider } = makeWrapper();
    const { result } = renderHook(() => useAdminEventTypes(), { wrapper: Provider });
    await waitFor(() => expect(result.current.data).toEqual([ev]));
  });

  it('throws HttpError on a 4xx and does not retry', async () => {
    getMock.mockReturnValue(fail(401, 'unauthorized', 'bad token'));
    const { Provider } = makeWrapper();
    const { result } = renderHook(() => useAdminEventTypes(), { wrapper: Provider });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(HttpError);
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});

describe('useCreateEventType', () => {
  it('invalidates the list on success', async () => {
    postMock.mockReturnValue(ok(ev));
    const { qc, Provider } = makeWrapper();
    qc.setQueryData(eventTypesAdminKeys.all, []);
    const { result } = renderHook(() => useCreateEventType(), { wrapper: Provider });
    result.current.mutate({
      slug: 'intro-call',
      name: 'Intro call',
      description: '...',
      durationMinutes: 30,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryState(eventTypesAdminKeys.all)?.isInvalidated).toBe(true);
  });
});

describe('useUpdateEventType', () => {
  it('invalidates the list on success', async () => {
    patchMock.mockReturnValue(ok(ev));
    const { qc, Provider } = makeWrapper();
    qc.setQueryData(eventTypesAdminKeys.all, [ev]);
    const { result } = renderHook(() => useUpdateEventType(), { wrapper: Provider });
    result.current.mutate({ slug: 'intro-call', body: { name: 'Renamed' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryState(eventTypesAdminKeys.all)?.isInvalidated).toBe(true);
  });
});
