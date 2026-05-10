import createClient from 'openapi-fetch';
import type { paths } from './types';
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
