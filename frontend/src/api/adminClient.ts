import createClient from 'openapi-fetch';
import type { paths, components } from './types';
import { env } from '../lib/env';
import { clearAdminToken, getAdminToken } from '../lib/adminToken';

type RequestWithToken = Request & { __sentToken?: string };

export const adminClient = createClient<paths>({
  baseUrl: env.apiBaseUrl,
  // Late-binding fetch so test environments that stub globalThis.fetch
  // after module load (vitest's vi.stubGlobal) are still picked up.
  fetch: (req) => globalThis.fetch(req),
});

adminClient.use({
  async onRequest({ request }) {
    const token = getAdminToken();
    if (token) {
      request.headers.set('X-Admin-Token', token);
      (request as RequestWithToken).__sentToken = token;
    }
    return request;
  },
  async onResponse({ request, response }) {
    if (response.status === 401) {
      const sent = (request as RequestWithToken).__sentToken;
      const current = getAdminToken();
      if (sent && sent === current) {
        clearAdminToken({ reason: 'rejected' });
      }
    }
    return response;
  },
});

export type PingAdminResult =
  | { ok: true; settings: components['schemas']['OwnerSettings'] }
  | { ok: false; kind: 'rejected' | 'network' | 'other'; status?: number };

// Validates a candidate admin token by calling /admin/settings with it. Uses a
// one-shot client (not adminClient) to bypass the middleware that would
// otherwise overwrite the candidate header with the currently-stored token.
export async function pingAdmin(token: string): Promise<PingAdminResult> {
  const probe = createClient<paths>({
    baseUrl: env.apiBaseUrl,
    fetch: (req) => globalThis.fetch(req),
  });
  try {
    const res = await probe.GET('/admin/settings', {
      headers: { 'X-Admin-Token': token },
    });
    if (res.error) {
      if (res.response.status === 401) return { ok: false, kind: 'rejected', status: 401 };
      return { ok: false, kind: 'other', status: res.response.status };
    }
    if (!res.data) return { ok: false, kind: 'other' };
    return { ok: true, settings: res.data };
  } catch {
    return { ok: false, kind: 'network' };
  }
}
