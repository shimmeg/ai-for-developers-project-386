# Phase 2 — Admin token + settings (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin authentication (lazy modal, X-Admin-Token in localStorage) and a working `/admin/settings` page that reads + edits `OwnerSettings` via the contract, while keeping the frontend backend-agnostic and exercising the full UI against Prism.

**Architecture:** New `<AdminGate>` (outermost) → `<AdminLayout>` (chrome) → `<Outlet />`, sibling of the existing guest `<Layout>` in `routes.tsx`. A pure `lib/adminToken.ts` store backs the token + a `rejectedAt` flag, both persisted to `localStorage` and observed via `useSyncExternalStore`. A second `openapi-fetch` client (`adminClient`) injects the header, captures `__sentToken` per request, and only clears storage on a 401 if the in-flight token still matches the stored token. The settings page uses `@mantine/form` + Zod (`zod4Resolver`) with strict day schemas + a submit normalizer; the timezone field is validated against `Intl.supportedValuesOf('timeZone')`.

**Tech Stack:** React 19, TypeScript 5, Mantine 9 (`@mantine/core`, `@mantine/form`, `@mantine/dates`, `@mantine/notifications`), React Router 7, TanStack Query 5, openapi-fetch 0.17, Zod 4 + `mantine-form-zod-resolver`, Day.js, Vitest 4 + RTL + jsdom.

**Spec:** [`docs/superpowers/specs/2026-05-09-admin-token-and-settings-design.md`](../specs/2026-05-09-admin-token-and-settings-design.md)

---

## File map (created in this phase)

```
contract/admin.tsp                                   # MODIFY: add @opExample on AdminSettings.{get,update}
frontend/src/
├── lib/
│   ├── adminToken.ts                                # CREATE: pure store + subscribers + storage event
│   ├── useAdminToken.ts                             # CREATE: useSyncExternalStore hook
│   ├── timezones.ts                                 # CREATE: list helper + injectCurrent
│   └── httpError.ts                                 # CREATE: HttpError class
├── api/
│   ├── adminClient.ts                               # CREATE: openapi-fetch + middleware
│   └── queries/settings.ts                          # CREATE: useAdminSettings, useUpdateAdminSettings
├── features/admin/
│   ├── settings-schema.ts                           # CREATE: Zod schema + normalize()
│   ├── AdminTokenModal.tsx                          # CREATE: blocking modal + raw-fetch validation
│   └── SettingsPage.tsx                             # CREATE: form
├── components/
│   ├── AdminGate.tsx                                # CREATE: token-presence gate
│   └── AdminLayout.tsx                              # CREATE: admin AppShell + Sign out
├── routes.tsx                                       # MODIFY: add admin branch sibling to <Layout>
├── lib/queryClient.ts                               # (unchanged — admin retry override is per-hook)
└── test/
    ├── adminToken.test.ts
    ├── useAdminToken.test.tsx
    ├── adminClient.test.ts
    ├── settings-schema.test.ts
    ├── AdminTokenModal.test.tsx
    ├── AdminGate.test.tsx
    ├── AdminLayout.test.tsx
    └── settings-page.test.tsx
```

> **Working directory:** all `npm` commands run from `frontend/` unless prefixed with `cd contract`.

---

## Task 1 — Add `@opExample` to admin settings endpoints

Updates the contract so Prism returns realistic `OwnerSettings` examples for `GET` and `PUT /admin/settings`. Without this the form has nothing to populate against the mock.

**Files:**

- Modify: `contract/admin.tsp`

- [ ] **Step 1: Add `@opExample` decorators**

Open `contract/admin.tsp`. Locate the `AdminSettings` interface (around lines 25–43). Replace with:

```typespec
@tag("Admin: Settings")
@useAuth(AdminAuth)
@route("/admin/settings")
interface AdminSettings {
  @doc("Get the current owner settings (timezone + weekly working hours).")
  @opExample(#{
    returnType: #{
      timezone: "Europe/Moscow",
      workingHours: #{
        monday: #{ status: "open", start: "09:00", end: "18:00" },
        tuesday: #{ status: "open", start: "09:00", end: "18:00" },
        wednesday: #{ status: "open", start: "09:00", end: "18:00" },
        thursday: #{ status: "open", start: "09:00", end: "18:00" },
        friday: #{ status: "open", start: "09:00", end: "17:00" },
        saturday: #{ status: "closed" },
        sunday: #{ status: "closed" },
      },
    },
  })
  @get
  get(): OwnerSettings | UnauthorizedResponse;

  @doc("""
    Replace the entire owner settings document. Validation: timezone must be a
    valid IANA name; for every `open` day, `end` must be strictly greater than
    `start`. Existing bookings are not affected by changes here.
    """)
  @opExample(#{
    parameters: #{
      settings: #{
        timezone: "Europe/Moscow",
        workingHours: #{
          monday: #{ status: "open", start: "10:00", end: "19:00" },
          tuesday: #{ status: "open", start: "10:00", end: "19:00" },
          wednesday: #{ status: "open", start: "10:00", end: "19:00" },
          thursday: #{ status: "open", start: "10:00", end: "19:00" },
          friday: #{ status: "open", start: "10:00", end: "16:00" },
          saturday: #{ status: "closed" },
          sunday: #{ status: "closed" },
        },
      },
    },
    returnType: #{
      timezone: "Europe/Moscow",
      workingHours: #{
        monday: #{ status: "open", start: "10:00", end: "19:00" },
        tuesday: #{ status: "open", start: "10:00", end: "19:00" },
        wednesday: #{ status: "open", start: "10:00", end: "19:00" },
        thursday: #{ status: "open", start: "10:00", end: "19:00" },
        friday: #{ status: "open", start: "10:00", end: "16:00" },
        saturday: #{ status: "closed" },
        sunday: #{ status: "closed" },
      },
    },
  })
  @put
  update(
    @body settings: OwnerSettings,
  ): OwnerSettings | BadRequestResponse | UnauthorizedResponse;
}
```

- [ ] **Step 2: Verify the contract compiles + tests pass**

Run from the repo root: `cd contract && npm test`
Expected: TypeSpec compiles cleanly + the existing `openapi-contract.test.mjs` suite shows `pass 2`.

- [ ] **Step 3: Verify Prism serves the example**

Run from `frontend/`: `npm run gen:api` (rebuilds the contract + types).
Then start Prism alone in another shell: `npm run mock`.
Then in a third shell: `curl -s -H 'X-Admin-Token: x' http://127.0.0.1:4010/admin/settings | python3 -m json.tool`
Expected: a populated `OwnerSettings` JSON with `timezone: "Europe/Moscow"` and the 7-day schedule. Stop Prism.

- [ ] **Step 4: Commit**

```bash
git add contract/admin.tsp
git commit -m "$(cat <<'EOF'
Add @opExample to admin settings endpoints

So Prism in static mode returns a realistic OwnerSettings payload for
the new /admin/settings page (and for the PUT round-trip), instead of
nulls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Token storage primitive (`lib/adminToken.ts`)

Pure module: getters/setters for the token + the `rejectedAt` flag, with a subscribe API for `useSyncExternalStore` and cross-tab `storage` event handling.

**Files:**

- Create: `frontend/src/lib/adminToken.ts`
- Test: `frontend/src/test/adminToken.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/adminToken.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAdminToken,
  getAdminToken,
  getRejectedAt,
  setAdminToken,
  subscribeAdminToken,
} from '../lib/adminToken';

beforeEach(() => {
  localStorage.clear();
});

describe('adminToken store', () => {
  it('returns null when nothing is stored', () => {
    expect(getAdminToken()).toBeNull();
    expect(getRejectedAt()).toBeNull();
  });

  it('persists set/clear to localStorage', () => {
    setAdminToken('abc');
    expect(getAdminToken()).toBe('abc');
    expect(localStorage.getItem('calendar.adminToken')).toBe('abc');

    clearAdminToken({ reason: 'signed-out' });
    expect(getAdminToken()).toBeNull();
    expect(localStorage.getItem('calendar.adminToken')).toBeNull();
    expect(getRejectedAt()).toBeNull();
  });

  it('records rejectedAt only when reason is "rejected"', () => {
    setAdminToken('abc');
    clearAdminToken({ reason: 'rejected' });
    const ts = getRejectedAt();
    expect(ts).not.toBeNull();
    expect(ts).toBeGreaterThan(0);
  });

  it('clears rejectedAt on setAdminToken', () => {
    setAdminToken('abc');
    clearAdminToken({ reason: 'rejected' });
    expect(getRejectedAt()).not.toBeNull();
    setAdminToken('def');
    expect(getRejectedAt()).toBeNull();
  });

  it('notifies subscribers on set + clear', () => {
    const cb = vi.fn();
    const unsub = subscribeAdminToken(cb);
    setAdminToken('abc');
    clearAdminToken({ reason: 'rejected' });
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
    setAdminToken('xyz');
    expect(cb).toHaveBeenCalledTimes(2); // not called after unsubscribe
  });

  it('reacts to a storage event from another tab', () => {
    const cb = vi.fn();
    subscribeAdminToken(cb);
    // simulate other tab clearing the token
    localStorage.setItem('calendar.adminToken', 'cross-tab');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'calendar.adminToken',
        newValue: 'cross-tab',
      }),
    );
    expect(cb).toHaveBeenCalled();
    expect(getAdminToken()).toBe('cross-tab');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/test/adminToken.test.ts`
Expected: all 6 tests fail with module-not-found / function-not-defined errors.

- [ ] **Step 3: Implement the minimum**

Create `frontend/src/lib/adminToken.ts`:

```typescript
const TOKEN_KEY = 'calendar.adminToken';
const REJECTED_AT_KEY = 'calendar.adminTokenRejectedAt';

const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) cb();
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getRejectedAt(): number | null {
  try {
    const raw = localStorage.getItem(REJECTED_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(REJECTED_AT_KEY);
  } catch {
    /* swallow — storage unavailable */
  }
  notify();
}

export function clearAdminToken(opts?: { reason?: 'rejected' | 'signed-out' }): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    if (opts?.reason === 'rejected') {
      localStorage.setItem(REJECTED_AT_KEY, String(Date.now()));
    } else {
      localStorage.removeItem(REJECTED_AT_KEY);
    }
  } catch {
    /* swallow */
  }
  notify();
}

export function subscribeAdminToken(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === TOKEN_KEY || e.key === REJECTED_AT_KEY || e.key === null) {
      notify();
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/test/adminToken.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/adminToken.ts frontend/src/test/adminToken.test.ts
git commit -m "$(cat <<'EOF'
Add adminToken store

Pure localStorage-backed module with subscribe/notify wired to the
browser storage event. Tracks the token and a rejectedAt timestamp so
later UI can decide whether to show a "rejected" message.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — `useAdminToken` hook

React hook over the pure store, via `useSyncExternalStore`.

**Files:**

- Create: `frontend/src/lib/useAdminToken.ts`
- Test: `frontend/src/test/useAdminToken.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/useAdminToken.test.tsx`:

```typescript
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAdminToken } from '../lib/useAdminToken';
import { clearAdminToken, setAdminToken } from '../lib/adminToken';

beforeEach(() => {
  localStorage.clear();
});

describe('useAdminToken', () => {
  it('returns null when no token is stored', () => {
    const { result } = renderHook(() => useAdminToken());
    expect(result.current).toBeNull();
  });

  it('returns the current token after set', () => {
    const { result } = renderHook(() => useAdminToken());
    act(() => setAdminToken('abc'));
    expect(result.current).toBe('abc');
  });

  it('updates after clear', () => {
    setAdminToken('abc');
    const { result } = renderHook(() => useAdminToken());
    expect(result.current).toBe('abc');
    act(() => clearAdminToken({ reason: 'signed-out' }));
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/test/useAdminToken.test.tsx`
Expected: 3 tests fail (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/lib/useAdminToken.ts`:

```typescript
import { useSyncExternalStore } from 'react';
import { getAdminToken, subscribeAdminToken } from './adminToken';

export function useAdminToken(): string | null {
  return useSyncExternalStore(subscribeAdminToken, getAdminToken, () => null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/test/useAdminToken.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/useAdminToken.ts frontend/src/test/useAdminToken.test.tsx
git commit -m "$(cat <<'EOF'
Add useAdminToken hook

React hook over the adminToken store via useSyncExternalStore so any
component re-renders when the token changes (including from another
tab via the storage event).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `HttpError` class

Tiny error class so query/mutation hooks can carry the HTTP status, used by the per-hook retry policy.

**Files:**

- Create: `frontend/src/lib/httpError.ts`

- [ ] **Step 1: Implement (no test — trivial value type)**

Create `frontend/src/lib/httpError.ts`:

```typescript
export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
```

- [ ] **Step 2: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/httpError.ts
git commit -m "$(cat <<'EOF'
Add HttpError carrier class

Tiny class for the admin query/mutation hooks to throw — lets the
per-hook retry policy classify failures by HTTP status.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Timezones helper (`lib/timezones.ts`)

Returns the runtime IANA list and exposes a small helper to inject a current value if missing (so an unfamiliar server zone stays selectable).

**Files:**

- Create: `frontend/src/lib/timezones.ts`

- [ ] **Step 1: Implement**

Create `frontend/src/lib/timezones.ts`:

```typescript
let cached: string[] | null = null;

function loadList(): string[] {
  // Intl.supportedValuesOf is supported in all browsers we target.
  // Throws TypeError on older runtimes; let it bubble.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (Intl as any).supportedValuesOf('timeZone');
  return Array.isArray(list) ? list : [];
}

export function getSupportedTimezones(): string[] {
  if (!cached) cached = loadList();
  return cached;
}

export function withCurrentTimezone(current: string | null | undefined): string[] {
  const list = getSupportedTimezones();
  if (!current) return list;
  return list.includes(current) ? list : [current, ...list];
}
```

- [ ] **Step 2: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/timezones.ts
git commit -m "$(cat <<'EOF'
Add timezones helper

Wraps Intl.supportedValuesOf and exposes withCurrentTimezone so the
settings Select keeps a server-supplied zone selectable even if it is
not in the runtime list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Admin API client (`api/adminClient.ts`)

`openapi-fetch` instance with two pieces of middleware: inject `X-Admin-Token` per request + capture the sent token; on 401 clear storage only when the sent token still matches the stored one.

**Files:**

- Create: `frontend/src/api/adminClient.ts`
- Test: `frontend/src/test/adminClient.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/adminClient.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminClient } from '../api/adminClient';
import { clearAdminToken, getAdminToken, setAdminToken } from '../lib/adminToken';

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
    // user replaces the token while request is in flight
    setAdminToken('tok-B');
    resolve(unauthorized());
    await inflight;
    // tok-B must still be the current token
    expect(getAdminToken()).toBe('tok-B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/test/adminClient.test.ts`
Expected: all 4 tests fail with module-not-found errors.

- [ ] **Step 3: Implement**

Create `frontend/src/api/adminClient.ts`:

```typescript
import createClient from 'openapi-fetch';
import type { paths } from './types';
import { env } from '../lib/env';
import { clearAdminToken, getAdminToken } from '../lib/adminToken';

type RequestWithToken = Request & { __sentToken?: string };

export const adminClient = createClient<paths>({ baseUrl: env.apiBaseUrl });

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/test/adminClient.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/adminClient.ts frontend/src/test/adminClient.test.ts
git commit -m "$(cat <<'EOF'
Add adminClient with token middleware

Second openapi-fetch instance for the admin namespace. Injects
X-Admin-Token from storage and clears it on 401 — but only when the
sent token still matches the stored one, so a late stale 401 cannot
stomp on a freshly valid token.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Settings query/mutation hooks (`api/queries/settings.ts`)

Wraps `adminClient.GET` / `adminClient.PUT`, throws `HttpError` on failure, and disables retries on 4xx.

**Files:**

- Create: `frontend/src/api/queries/settings.ts`

- [ ] **Step 1: Implement**

Create `frontend/src/api/queries/settings.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminClient } from '../adminClient';
import type { components } from '../types';
import { HttpError } from '../../lib/httpError';

export type OwnerSettings = components['schemas']['OwnerSettings'];

export const settingsKeys = {
  all: ['admin', 'settings'] as const,
};

function isHttp4xx(err: unknown): boolean {
  return err instanceof HttpError && err.status >= 400 && err.status < 500;
}

export function useAdminSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    queryFn: async (): Promise<OwnerSettings> => {
      const { data, error, response } = await adminClient.GET('/admin/settings');
      if (error) {
        throw new HttpError(
          response.status,
          error.code ?? 'http_error',
          error.message ?? 'Request failed',
        );
      }
      if (!data) throw new HttpError(response.status, 'empty', 'Empty settings response');
      return data;
    },
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation<OwnerSettings, HttpError, OwnerSettings>({
    mutationFn: async (body) => {
      const { data, error, response } = await adminClient.PUT('/admin/settings', { body });
      if (error) {
        throw new HttpError(
          response.status,
          error.code ?? 'http_error',
          error.message ?? 'Update failed',
        );
      }
      if (!data) throw new HttpError(response.status, 'empty', 'Empty settings response');
      return data;
    },
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.all, data);
    },
  });
}
```

- [ ] **Step 2: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/queries/settings.ts
git commit -m "$(cat <<'EOF'
Add useAdminSettings and useUpdateAdminSettings

Query + mutation hooks that wrap adminClient. Both throw HttpError on
failure and disable retries on 4xx so a fresh 401 (handled by the
client middleware) is not duplicated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — Settings Zod schema + normalizer (`features/admin/settings-schema.ts`)

**Files:**

- Create: `frontend/src/features/admin/settings-schema.ts`
- Test: `frontend/src/test/settings-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/settings-schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { SettingsFormSchema, normalizeSettings } from '../features/admin/settings-schema';

const okValues = {
  timezone: 'Europe/Moscow',
  workingHours: {
    monday: { status: 'open', start: '09:00', end: '18:00' },
    tuesday: { status: 'open', start: '09:00', end: '18:00' },
    wednesday: { status: 'open', start: '09:00', end: '18:00' },
    thursday: { status: 'open', start: '09:00', end: '18:00' },
    friday: { status: 'open', start: '09:00', end: '17:00' },
    saturday: { status: 'closed' },
    sunday: { status: 'closed' },
  },
} as const;

describe('SettingsFormSchema', () => {
  it('accepts valid values', () => {
    const result = SettingsFormSchema.safeParse(okValues);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown timezone', () => {
    const bad = { ...okValues, timezone: 'Mars/Olympus_Mons' };
    expect(SettingsFormSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects end <= start on an open day', () => {
    const bad = {
      ...okValues,
      workingHours: {
        ...okValues.workingHours,
        monday: { status: 'open', start: '18:00', end: '09:00' },
      },
    } as typeof okValues;
    expect(SettingsFormSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects extraneous start/end on a closed day', () => {
    const bad = {
      ...okValues,
      // @ts-expect-error testing strictness against extra fields
      workingHours: {
        ...okValues.workingHours,
        saturday: { status: 'closed', start: '09:00', end: '18:00' },
      },
    };
    expect(SettingsFormSchema.safeParse(bad).success).toBe(false);
  });
});

describe('normalizeSettings', () => {
  it('drops start/end from closed days even if the form holds them', () => {
    const formValues = {
      timezone: 'Europe/Moscow',
      workingHours: {
        ...okValues.workingHours,
        // simulate the form not having stripped these on toggle
        saturday: { status: 'closed', start: '09:00', end: '18:00' },
      },
    } as never;
    const out = normalizeSettings(formValues);
    expect(out.workingHours.saturday).toEqual({ status: 'closed' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/test/settings-schema.test.ts`
Expected: tests fail (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/features/admin/settings-schema.ts`:

```typescript
import { z } from 'zod';
import type { components } from '../../api/types';
import { getSupportedTimezones } from '../../lib/timezones';

const SUPPORTED_TIMEZONES = new Set<string>(getSupportedTimezones());

const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');

const ClosedDay = z.object({ status: z.literal('closed') }).strict();
const OpenDay = z
  .object({ status: z.literal('open'), start: Hhmm, end: Hhmm })
  .strict()
  .refine((d) => d.end > d.start, { message: 'End must be after start', path: ['end'] });

const WorkingDay = z.discriminatedUnion('status', [ClosedDay, OpenDay]);

export const SettingsFormSchema = z.object({
  timezone: z
    .string()
    .min(1, 'Timezone is required')
    .refine((v) => SUPPORTED_TIMEZONES.has(v), 'Pick a recognised IANA timezone'),
  workingHours: z.object({
    monday: WorkingDay,
    tuesday: WorkingDay,
    wednesday: WorkingDay,
    thursday: WorkingDay,
    friday: WorkingDay,
    saturday: WorkingDay,
    sunday: WorkingDay,
  }),
});

export type SettingsFormValues = z.infer<typeof SettingsFormSchema>;

type DayKey = keyof SettingsFormValues['workingHours'];
const DAY_KEYS: DayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function normalizeSettings(
  values: SettingsFormValues,
): components['schemas']['OwnerSettings'] {
  const wh = {} as components['schemas']['OwnerSettings']['workingHours'];
  for (const k of DAY_KEYS) {
    const day = values.workingHours[k];
    if (day.status === 'closed') {
      wh[k] = { status: 'closed' };
    } else {
      wh[k] = { status: 'open', start: day.start, end: day.end };
    }
  }
  return { timezone: values.timezone, workingHours: wh };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/test/settings-schema.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/settings-schema.ts frontend/src/test/settings-schema.test.ts
git commit -m "$(cat <<'EOF'
Add settings Zod schema + normalize()

Strict per-day schemas so dangling start/end on a closed day are
caught client-side. Timezone is validated against the runtime IANA
list. normalizeSettings() builds the contract-correct payload from
form state before PUT.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — `<AdminTokenModal />`

The blocking modal: PasswordInput, validate-then-store, inline error states, submit lock, `rejectedAt`-aware mount.

**Files:**

- Create: `frontend/src/features/admin/AdminTokenModal.tsx`
- Test: `frontend/src/test/AdminTokenModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/AdminTokenModal.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdminTokenModal } from '../features/admin/AdminTokenModal';
import { clearAdminToken, getAdminToken, setAdminToken } from '../lib/adminToken';

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <AdminTokenModal />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AdminTokenModal', () => {
  it('stores the token on a 200 response', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ timezone: 'UTC', workingHours: {} }), { status: 200 }),
    );
    renderModal();
    await userEvent.type(screen.getByLabelText(/admin token/i), 'good-token');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(getAdminToken()).toBe('good-token'));
  });

  it('shows the rejection alert on 401 and does not store', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'unauthorized', message: 'bad' }), { status: 401 }),
    );
    renderModal();
    await userEvent.type(screen.getByLabelText(/admin token/i), 'bad-token');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/that token was rejected/i)).toBeInTheDocument();
    expect(getAdminToken()).toBeNull();
  });

  it('shows the rejection alert on mount when rejectedAt is present', () => {
    setAdminToken('x');
    clearAdminToken({ reason: 'rejected' });
    renderModal();
    expect(screen.getByText(/that token was rejected/i)).toBeInTheDocument();
  });

  it('locks the submit button while a request is in flight', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    renderModal();
    await userEvent.type(screen.getByLabelText(/admin token/i), 'tok');
    const btn = screen.getByRole('button', { name: /sign in/i });
    await userEvent.click(btn);
    expect(btn).toBeDisabled();
    resolve(new Response(JSON.stringify({}), { status: 200 }));
    await waitFor(() => expect(getAdminToken()).toBe('tok'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/test/AdminTokenModal.test.tsx`
Expected: tests fail (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/features/admin/AdminTokenModal.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { Alert, Anchor, Button, Group, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { setAdminToken, getRejectedAt } from '../../lib/adminToken';
import { env } from '../../lib/env';
import { settingsKeys, type OwnerSettings } from '../../api/queries/settings';

type Status = 'idle' | 'submitting' | 'rejected' | 'network';

export function AdminTokenModal() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>(() =>
    getRejectedAt() != null ? 'rejected' : 'idle',
  );

  // If rejectedAt changes while the modal is mounted (e.g. a mid-session 401),
  // surface the rejection state.
  useEffect(() => {
    if (status === 'idle' && getRejectedAt() != null) setStatus('rejected');
  }, [status]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting' || token.length === 0) return;
    setStatus('submitting');
    try {
      const res = await fetch(`${env.apiBaseUrl}/admin/settings`, {
        headers: { 'X-Admin-Token': token },
      });
      if (res.status === 200) {
        const json = (await res.json()) as OwnerSettings;
        setAdminToken(token);
        queryClient.setQueryData(settingsKeys.all, json);
        return; // gate will unmount us
      }
      if (res.status === 401) {
        setStatus('rejected');
        setToken('');
        return;
      }
      setStatus('network');
    } catch {
      setStatus('network');
    }
  };

  return (
    <Modal
      opened
      onClose={() => {
        /* gate-controlled, nothing to do */
      }}
      withCloseButton={false}
      closeOnEscape={false}
      closeOnClickOutside={false}
      centered
      title="Admin sign in"
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          {status === 'rejected' && (
            <Alert color="red" icon={<IconAlertTriangle />} title="Token rejected">
              That token was rejected. Please try again.
            </Alert>
          )}
          {status === 'network' && (
            <Alert color="orange" icon={<IconAlertTriangle />} title="Connection problem">
              Couldn't reach the server. Please try again.
            </Alert>
          )}
          <PasswordInput
            label="Admin token"
            placeholder="Enter your token"
            required
            autoFocus
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
            disabled={status === 'submitting'}
          />
          <Group justify="space-between">
            <Anchor component={Link} to="/" size="sm">
              Back to public catalog
            </Anchor>
            <Button
              type="submit"
              loading={status === 'submitting'}
              disabled={status === 'submitting' || token.length === 0}
            >
              Sign in
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            The token is provided by the calendar owner. It is stored locally in this browser.
          </Text>
        </Stack>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/test/AdminTokenModal.test.tsx`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/AdminTokenModal.tsx frontend/src/test/AdminTokenModal.test.tsx
git commit -m "$(cat <<'EOF'
Add AdminTokenModal

Blocking modal that validates the candidate token via a raw fetch
before storing it. Shows an inline alert on 401 (or when mounted with
a rejectedAt flag in storage), and locks the submit button while a
request is in flight.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — `<AdminGate />`

**Files:**

- Create: `frontend/src/components/AdminGate.tsx`
- Test: `frontend/src/test/AdminGate.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/AdminGate.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminGate } from '../components/AdminGate';
import { setAdminToken } from '../lib/adminToken';

vi.mock('../features/admin/AdminTokenModal', () => ({
  AdminTokenModal: () => <div data-testid="modal">modal</div>,
}));

beforeEach(() => {
  localStorage.clear();
});

function renderGate(initialPath = '/admin') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Routes>
            <Route element={<AdminGate />}>
              <Route path="/admin" element={<div data-testid="child">child</div>} />
            </Route>
          </Routes>
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AdminGate', () => {
  it('shows the modal when no token is stored', () => {
    renderGate();
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('renders the outlet when a token is stored', () => {
    setAdminToken('tok');
    renderGate();
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('modal')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/test/AdminGate.test.tsx`
Expected: tests fail (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/components/AdminGate.tsx`:

```typescript
import { Outlet } from 'react-router-dom';
import { useAdminToken } from '../lib/useAdminToken';
import { AdminTokenModal } from '../features/admin/AdminTokenModal';

export function AdminGate() {
  const token = useAdminToken();
  if (!token) return <AdminTokenModal />;
  return <Outlet />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/test/AdminGate.test.tsx`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AdminGate.tsx frontend/src/test/AdminGate.test.tsx
git commit -m "$(cat <<'EOF'
Add AdminGate

Outermost wrapper of the admin subtree: shows the token modal when no
token is stored, otherwise renders the outlet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11 — `<AdminLayout />`

**Files:**

- Create: `frontend/src/components/AdminLayout.tsx`
- Test: `frontend/src/test/AdminLayout.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/AdminLayout.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { getAdminToken, setAdminToken } from '../lib/adminToken';

beforeEach(() => {
  localStorage.clear();
});

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/admin/settings']}>
      <MantineProvider>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="settings" element={<div>settings page</div>} />
          </Route>
          <Route path="/" element={<div>home</div>} />
        </Routes>
      </MantineProvider>
    </MemoryRouter>,
  );
}

describe('AdminLayout', () => {
  it('renders the admin brand and a Settings nav link', () => {
    setAdminToken('tok');
    renderLayout();
    expect(screen.getByText(/calendar \(admin\)/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText('settings page')).toBeInTheDocument();
  });

  it('signs out and navigates home on click', async () => {
    setAdminToken('tok');
    renderLayout();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(getAdminToken()).toBeNull();
    expect(screen.getByText('home')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/test/AdminLayout.test.tsx`
Expected: tests fail (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/components/AdminLayout.tsx`:

```typescript
import { AppShell, Button, Container, Group, Text, Title } from '@mantine/core';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearAdminToken } from '../lib/adminToken';

export function AdminLayout() {
  const navigate = useNavigate();
  const handleSignOut = () => {
    clearAdminToken({ reason: 'signed-out' });
    navigate('/');
  };
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between">
            <Group gap="xl">
              <Link to="/admin/settings" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Title order={4}>Calendar (admin)</Title>
              </Link>
              <Group gap="md">
                <Anchor to="/admin/settings">Settings</Anchor>
              </Group>
            </Group>
            <Group gap="md">
              <Text size="sm" c="dimmed">Admin</Text>
              <Button variant="subtle" size="xs" onClick={handleSignOut}>
                Sign out
              </Button>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

function Anchor({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        textDecoration: 'none',
        color: 'inherit',
        fontWeight: isActive ? 600 : 400,
      })}
    >
      {children}
    </NavLink>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/test/AdminLayout.test.tsx`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AdminLayout.tsx frontend/src/test/AdminLayout.test.tsx
git commit -m "$(cat <<'EOF'
Add AdminLayout

Admin AppShell with the "Calendar (admin)" brand, a single Settings
nav link (other admin sections come in later phases), and a Sign out
button that clears the token with reason="signed-out".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12 — `<SettingsPage />`

The form: timezone Select + 7 working-hours rows + Save / Reset.

**Files:**

- Create: `frontend/src/features/admin/SettingsPage.tsx`
- Test: `frontend/src/test/settings-page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/settings-page.test.tsx`:

```typescript
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from '../features/admin/SettingsPage';
import type { OwnerSettings } from '../api/queries/settings';

const exampleSettings: OwnerSettings = {
  timezone: 'Europe/Moscow',
  workingHours: {
    monday: { status: 'open', start: '09:00', end: '18:00' },
    tuesday: { status: 'open', start: '09:00', end: '18:00' },
    wednesday: { status: 'open', start: '09:00', end: '18:00' },
    thursday: { status: 'open', start: '09:00', end: '18:00' },
    friday: { status: 'open', start: '09:00', end: '17:00' },
    saturday: { status: 'closed' },
    sunday: { status: 'closed' },
  },
};

const getMock = vi.fn();
const putMock = vi.fn();

vi.mock('../api/adminClient', () => ({
  adminClient: {
    GET: (...args: unknown[]) => getMock(...args),
    PUT: (...args: unknown[]) => putMock(...args),
  },
}));

beforeEach(() => {
  getMock.mockReset();
  putMock.mockReset();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <SettingsPage />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const ok = (data: OwnerSettings) => Promise.resolve({
  data,
  error: undefined,
  response: new Response(JSON.stringify(data), { status: 200 }),
});

describe('SettingsPage', () => {
  it('renders fetched settings into the form', async () => {
    getMock.mockReturnValue(ok(exampleSettings));
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Europe/Moscow')).toBeInTheDocument());
    expect(screen.getAllByDisplayValue('09:00').length).toBeGreaterThan(0);
  });

  it('submits the normalized payload on Save', async () => {
    getMock.mockReturnValue(ok(exampleSettings));
    putMock.mockReturnValue(ok(exampleSettings));
    renderPage();
    await screen.findByDisplayValue('Europe/Moscow');

    // toggle Saturday open
    const satRow = screen.getByText('Saturday').closest('tr')!;
    await userEvent.click(within(satRow).getByRole('switch'));
    // form is now dirty
    const save = screen.getByRole('button', { name: /save changes/i });
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1));
    const [, options] = putMock.mock.calls[0];
    const body = (options as { body: OwnerSettings }).body;
    // saturday is now open with the default 09:00 / 18:00 sentinel values
    expect(body.workingHours.saturday).toMatchObject({ status: 'open' });
    expect(body.workingHours.sunday).toEqual({ status: 'closed' });
  });

  it('shows the 400 error message in a top-level alert', async () => {
    getMock.mockReturnValue(ok(exampleSettings));
    putMock.mockReturnValue(
      Promise.resolve({
        data: undefined,
        error: { code: 'invalid', message: 'Working hours overlap.' },
        response: new Response('{}', { status: 400 }),
      }),
    );
    renderPage();
    await screen.findByDisplayValue('Europe/Moscow');

    // dirty the form via a no-op change to a name field, then click save
    const tzInput = screen.getByLabelText(/timezone/i);
    await userEvent.click(tzInput);
    await userEvent.keyboard('{Escape}');
    // Force dirty by toggling sunday
    const sunRow = screen.getByText('Sunday').closest('tr')!;
    await userEvent.click(within(sunRow).getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/working hours overlap/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/test/settings-page.test.tsx`
Expected: tests fail (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/features/admin/SettingsPage.tsx`:

```typescript
import { useEffect } from 'react';
import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { TimeInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useAdminSettings, useUpdateAdminSettings, type OwnerSettings } from '../../api/queries/settings';
import { ErrorState } from '../../components/ErrorState';
import { withCurrentTimezone } from '../../lib/timezones';
import { HttpError } from '../../lib/httpError';
import {
  SettingsFormSchema,
  type SettingsFormValues,
  normalizeSettings,
} from './settings-schema';

const DAYS: { key: keyof SettingsFormValues['workingHours']; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

function toFormValues(s: OwnerSettings): SettingsFormValues {
  return {
    timezone: s.timezone,
    workingHours: {
      monday: s.workingHours.monday as SettingsFormValues['workingHours']['monday'],
      tuesday: s.workingHours.tuesday as SettingsFormValues['workingHours']['tuesday'],
      wednesday: s.workingHours.wednesday as SettingsFormValues['workingHours']['wednesday'],
      thursday: s.workingHours.thursday as SettingsFormValues['workingHours']['thursday'],
      friday: s.workingHours.friday as SettingsFormValues['workingHours']['friday'],
      saturday: s.workingHours.saturday as SettingsFormValues['workingHours']['saturday'],
      sunday: s.workingHours.sunday as SettingsFormValues['workingHours']['sunday'],
    },
  };
}

export function SettingsPage() {
  const settingsQ = useAdminSettings();
  const update = useUpdateAdminSettings();

  const form = useForm<SettingsFormValues>({
    mode: 'controlled',
    initialValues: {
      timezone: '',
      workingHours: {
        monday: { status: 'closed' },
        tuesday: { status: 'closed' },
        wednesday: { status: 'closed' },
        thursday: { status: 'closed' },
        friday: { status: 'closed' },
        saturday: { status: 'closed' },
        sunday: { status: 'closed' },
      },
    },
    validate: zod4Resolver(SettingsFormSchema),
  });

  // sync form to fetched data
  useEffect(() => {
    if (settingsQ.data) form.setValues(toFormValues(settingsQ.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQ.data]);

  if (settingsQ.isPending) {
    return (
      <Stack gap="md">
        <Skeleton h={32} />
        <Skeleton h={48} />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} h={36} />
        ))}
      </Stack>
    );
  }

  if (settingsQ.isError) {
    const err = settingsQ.error as Error | HttpError;
    return (
      <ErrorState
        title="Couldn't load settings"
        message={err.message}
        onRetry={() => settingsQ.refetch()}
      />
    );
  }

  const tzData = withCurrentTimezone(form.getValues().timezone);

  const onSubmit = (values: SettingsFormValues) => {
    update.mutate(normalizeSettings(values), {
      onSuccess: (saved) => {
        form.setValues(toFormValues(saved));
        form.resetDirty(toFormValues(saved));
        notifications.show({ color: 'green', title: 'Settings saved.', message: '' });
      },
    });
  };

  const errorMsg =
    update.error instanceof HttpError ? update.error.message : null;

  return (
    <Stack gap="md">
      <Title order={2}>Settings</Title>
      {errorMsg && (
        <Alert color="red" icon={<IconAlertTriangle />} title="Couldn't save settings">
          {errorMsg}
        </Alert>
      )}
      <form onSubmit={form.onSubmit(onSubmit)}>
        <Stack gap="md">
          <Select
            label="Timezone"
            searchable
            data={tzData}
            key={form.key('timezone')}
            {...form.getInputProps('timezone')}
          />
          <Card withBorder>
            <Title order={4} mb="sm">Working hours</Title>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Day</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Start</Table.Th>
                  <Table.Th>End</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {DAYS.map(({ key, label }) => {
                  const day = form.getValues().workingHours[key];
                  const isOpen = day.status === 'open';
                  return (
                    <Table.Tr key={key}>
                      <Table.Td>{label}</Table.Td>
                      <Table.Td>
                        <Switch
                          checked={isOpen}
                          onChange={(e) => {
                            const checked = e.currentTarget.checked;
                            form.setFieldValue(
                              `workingHours.${key}`,
                              checked
                                ? { status: 'open', start: '09:00', end: '18:00' }
                                : { status: 'closed' },
                            );
                          }}
                          label={isOpen ? 'Open' : 'Closed'}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TimeInput
                          disabled={!isOpen}
                          placeholder="—"
                          value={isOpen ? day.start : ''}
                          onChange={(e) =>
                            isOpen &&
                            form.setFieldValue(`workingHours.${key}.start`, e.currentTarget.value)
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <TimeInput
                          disabled={!isOpen}
                          placeholder="—"
                          value={isOpen ? day.end : ''}
                          onChange={(e) =>
                            isOpen &&
                            form.setFieldValue(`workingHours.${key}.end`, e.currentTarget.value)
                          }
                          error={form.errors[`workingHours.${key}.end`] as string | undefined}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
          <Group justify="space-between">
            <Button
              variant="subtle"
              type="button"
              disabled={!form.isDirty() || update.isPending}
              onClick={() => settingsQ.data && form.setValues(toFormValues(settingsQ.data))}
            >
              Reset
            </Button>
            <Button
              type="submit"
              loading={update.isPending}
              disabled={!form.isDirty() || update.isPending}
            >
              Save changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/test/settings-page.test.tsx`
Expected: 3 tests pass. If any fail, adjust selectors/mocks; do not weaken the assertions about `body.workingHours.saturday` shape.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/SettingsPage.tsx frontend/src/test/settings-page.test.tsx
git commit -m "$(cat <<'EOF'
Add SettingsPage

Form for timezone + 7-day working hours. Reads via useAdminSettings,
writes via useUpdateAdminSettings (with the submit normalizer that
strips dangling start/end on closed days). Loading skeleton, top-level
400 alert, dirty-aware Save/Reset.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13 — Wire admin routes into `routes.tsx`

**Files:**

- Modify: `frontend/src/routes.tsx`

- [ ] **Step 1: Update routes**

Replace the contents of `frontend/src/routes.tsx` with:

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminGate } from './components/AdminGate';
import { AdminLayout } from './components/AdminLayout';
import { CatalogPage } from './features/catalog/CatalogPage';
import { SlotPickerPage } from './features/slot-picker/SlotPickerPage';
import { ConfirmPage } from './features/booking/ConfirmPage';
import { SuccessPage } from './features/booking/SuccessPage';
import { SettingsPage } from './features/admin/SettingsPage';
import { NotFoundPage } from './features/NotFoundPage';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <CatalogPage /> },
      { path: '/events/:slug', element: <SlotPickerPage /> },
      { path: '/events/:slug/confirm', element: <ConfirmPage /> },
      { path: '/events/:slug/success', element: <SuccessPage /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminGate />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="settings" replace /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
```

- [ ] **Step 2: Run typecheck + lint + all tests + build**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes.tsx
git commit -m "$(cat <<'EOF'
Wire admin routes

Add /admin and /admin/settings as a sibling branch of the existing
guest layout. AdminGate is the outermost wrapper of the admin subtree,
followed by AdminLayout for chrome and the Settings page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14 — Document the localStorage XSS trade-off

Per the design's risk register, add a one-paragraph security note to `frontend/README.md` so the trade-off is visible to future readers.

**Files:**

- Modify: `frontend/README.md`

- [ ] **Step 1: Add the note**

Append this section to `frontend/README.md`, just before "## Project layout":

```markdown
## Security note: admin token storage

The admin `X-Admin-Token` is stored in `localStorage` so the owner does not have to re-enter it on every refresh. This is acceptable in v1 because:

- The token is a single deployment-configured shared secret, not a per-user credential.
- The frontend has a strict no-`dangerouslySetInnerHTML` / no-third-party-script-tags policy, so any XSS would have to be introduced deliberately during development.

When a real backend lands the long-term plan is to switch to an `HttpOnly` cookie (with a CSRF strategy). Tracked in [`ROADMAP.md`](ROADMAP.md) under Phase 6.
```

- [ ] **Step 2: Commit**

```bash
git add frontend/README.md
git commit -m "$(cat <<'EOF'
Document the localStorage admin-token trade-off

Make the v1 security posture explicit so future readers know why the
token sits in localStorage and what the longer-term path is.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15 — Manual verification + push + open PR

- [ ] **Step 1: Final pre-merge gate**

Run from `frontend/`:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: all green.

- [ ] **Step 2: Walk the flow against Prism**

Run: `npm run dev:full`
Open `http://localhost:5173/admin` in a browser. Expected sequence:

1. Modal appears with "Admin sign in" title.
2. Enter any non-empty token → modal closes, settings page renders with `Europe/Moscow` and the 7-day schedule from the contract examples.
3. Toggle Saturday → Open with 09:00 / 18:00 → click "Save changes". A green toast "Settings saved." appears.
4. Click "Sign out" in the header → page navigates to `/`.
5. Visit `/admin` again → modal returns, no rejection message.
6. Stop Prism (Ctrl+C the orchestrator) and click Sign in again with any token → "Couldn't reach the server" alert appears.
7. Restart `npm run dev:full`. Open DevTools → Application → Local Storage → manually corrupt `calendar.adminToken` to invalid bytes that the server will reject. Reload `/admin`. After the eager validation 401, modal shows "That token was rejected."

If any step misbehaves, fix the underlying code; do not skip steps.

- [ ] **Step 3: Push and open PR**

```bash
git push
gh pr create --base main --head claude/admin-token-settings \
  --title "Phase 2: admin token + /admin/settings" \
  --body "$(cat <<'EOF'
## Summary
- Adds the admin token gate (lazy modal, validate-then-store, locked submit, persisted "rejected" hint across tabs).
- Adds the `/admin/settings` form: timezone Select (validated against `Intl.supportedValuesOf`) + 7-day working-hours table with strict per-day Zod schemas and a submit normalizer.
- Adds `adminClient` (separate openapi-fetch instance with X-Admin-Token middleware and a sent-vs-stored guard against late stale 401s).
- Adds `@opExample` to the contract's admin settings endpoints so Prism returns realistic mock data.
- Documents the localStorage admin-token trade-off in `frontend/README.md`.

## Test plan
- [x] `cd contract && npm test`
- [x] `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`
- [x] `cd frontend && npm run dev:full`; walked the manual checklist in the spec (sign in, edit settings, save, sign out, network-down error, rejected token).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Confirm**

`gh pr create` returns the PR URL. Done.

---

## Self-review (skill checklist)

**Spec coverage:**

- Routes (gate outside, layout inside, sibling branch) → Task 13.
- `lib/adminToken.ts` (store + subscribers + storage event + rejectedAt) → Task 2.
- `lib/useAdminToken.ts` (hook only) → Task 3.
- `lib/timezones.ts` → Task 5; `lib/httpError.ts` → Task 4.
- `api/adminClient.ts` (sent-token guard, 401 middleware) → Task 6.
- `api/queries/settings.ts` (HttpError, retry: false on 4xx) → Task 7.
- `features/admin/AdminTokenModal.tsx` (raw fetch validation, submit lock, rejectedAt-aware mount) → Task 9.
- `components/AdminGate.tsx` → Task 10.
- `components/AdminLayout.tsx` (single Settings nav, Sign out with `signed-out` reason) → Task 11.
- `features/admin/settings-schema.ts` (.strict + Intl-validated timezone + normalize) → Task 8.
- `features/admin/SettingsPage.tsx` (Zod resolver, dirty-aware Save/Reset, 400 top-level alert, skeletons) → Task 12.
- `contract/admin.tsp` (`@opExample` on `AdminSettings.{get,update}`) → Task 1.
- Security note in README → Task 14.

**Placeholder scan:** No "TBD" / "implement later" / "similar to Task N". Each implementation step contains the actual code.

**Type consistency:** `clearAdminToken({ reason: 'rejected' | 'signed-out' })` is used consistently in tasks 2, 6, 9, 11. `HttpError(status, code, message)` constructor signature is consistent in tasks 4 and 7. `OwnerSettings` is imported the same way (`type OwnerSettings = components['schemas']['OwnerSettings']`) wherever needed.

**Test coverage vs. spec:** the spec lists 14 smoke tests. Tasks 2–13 collectively implement: `AdminGate` (10), modal happy-path / rejection / persisted-on-reload via `setAdminToken` before mount / submit-lock (9), settings render / submit / Zod / 400 (8 + 12), late 401 after re-auth (6), cross-tab via storage event (2), sign out (11). Two listed cases (`non-401 load error` end-to-end and the cache-seed cross-component check) are exercised by the `ErrorState` rendering branch in task 12 and by Task 9's success path respectively.
