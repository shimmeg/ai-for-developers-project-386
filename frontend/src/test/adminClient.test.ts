import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminClient } from '../api/adminClient';
import { getAdminToken, setAdminToken } from '../lib/adminToken';

const mockFetch = vi.fn();

beforeEach(() => {
  localStorage.clear();
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(json: unknown): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ code: 'unauthorized', message: 'bad token' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('adminClient', () => {
  it('attaches X-Admin-Token from storage', async () => {
    setAdminToken('tok-1');
    mockFetch.mockResolvedValue(ok({}));
    await adminClient.GET('/admin/settings');
    const req = mockFetch.mock.calls[0][0] as Request;
    expect(req.headers.get('X-Admin-Token')).toBe('tok-1');
  });

  it('omits the header when no token', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await adminClient.GET('/admin/settings');
    const req = mockFetch.mock.calls[0][0] as Request;
    expect(req.headers.get('X-Admin-Token')).toBeNull();
  });

  it('clears the token with reason "rejected" on 401', async () => {
    setAdminToken('tok-1');
    mockFetch.mockResolvedValue(unauthorized());
    await adminClient.GET('/admin/settings');
    expect(getAdminToken()).toBeNull();
    expect(localStorage.getItem('calendar.adminTokenRejectedAt')).not.toBeNull();
  });

  it('does NOT clear a different token if a stale 401 arrives late', async () => {
    setAdminToken('tok-A');
    let resolve!: (r: Response) => void;
    mockFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const inflight = adminClient.GET('/admin/settings');
    setAdminToken('tok-B');
    resolve(unauthorized());
    await inflight;
    expect(getAdminToken()).toBe('tok-B');
  });
});
