# Phase 3 — Admin event-types CRUD (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/admin/event-types` — a list page with an inline active toggle and a single Mantine modal for create/edit, backed by typed admin hooks (`useAdminEventTypes`, `useCreateEventType`, `useUpdateEventType`) and a Zod schema mirroring the contract.

**Architecture:** Sibling route to `/admin/settings` under the existing `<AdminGate>` → `<AdminLayout>`. The list page owns the modal open/mode state; the modal accepts a discriminated `{mode:'create'} | {mode:'edit', eventType}` prop. The active switch fires an optimistic PATCH via TanStack Query's `onMutate`/`onError` rollback. The Zod schema mirrors the contract's `EventTypeSlug` regex and `DurationMinutes >= 1` constraint exactly, with a tiny `diffEventType()` helper computing the minimal PATCH body in edit mode.

**Tech Stack:** React 19, TypeScript 5 (strict), Mantine 9 (`@mantine/core`, `@mantine/form`, `@mantine/notifications`), React Router 7, TanStack Query 5, openapi-fetch (`adminClient` from Phase 2), Zod 4 + `mantine-form-zod-resolver`, Vitest 4 + RTL.

**Spec:** [`docs/superpowers/specs/2026-05-10-admin-event-types-design.md`](../specs/2026-05-10-admin-event-types-design.md).

---

## File map

```
contract/admin.tsp                                 # MODIFY: @opExample on AdminEventTypes ops
frontend/src/
├── api/queries/
│   └── eventTypesAdmin.ts                         # CREATE
├── features/admin/
│   ├── event-type-schema.ts                       # CREATE
│   ├── EventTypeFormModal.tsx                     # CREATE
│   └── EventTypesPage.tsx                         # CREATE
├── components/AdminLayout.tsx                     # MODIFY: add Event types nav link
├── routes.tsx                                     # MODIFY: add 'event-types' child route
└── test/
    ├── event-type-schema.test.ts                  # CREATE
    ├── eventTypesAdmin.test.ts                    # CREATE
    ├── EventTypeFormModal.test.tsx                # CREATE
    └── EventTypesPage.test.tsx                    # CREATE
```

> Working directory: all `npm` commands run from `frontend/` unless prefixed with `cd contract`.

---

## Task 1 — Add `@opExample` to admin event-types operations

So Prism returns realistic mock data on the four `AdminEventTypes` operations. Without it, the list page has nothing to render against the mock.

**Files:**
- Modify: `contract/admin.tsp`

- [ ] **Step 1: Add `@opExample` decorators**

Locate the `AdminEventTypes` interface (around lines 48-91 of `contract/admin.tsp`). Replace it with the following — same shape, but with `@opExample` on each operation. The list returns 4 entries (3 active + 1 inactive) so the toggle has both directions to flip, and the slugs match the public catalog from Phase 1.

```typespec
@tag("Admin: Event types")
@useAuth(AdminAuth)
@route("/admin/event-types")
interface AdminEventTypes {
  @doc("List all event types — both active and inactive — in display order.")
  @opExample(#{
    returnType: #[
      #{
        slug: "intro-call",
        name: "Intro call",
        description: "A quick 30-minute introduction chat to get to know each other and discuss your project.",
        durationMinutes: 30,
        active: true,
      },
      #{
        slug: "deep-dive",
        name: "Deep dive",
        description: "Focused 60-minute discussion on a specific topic.",
        durationMinutes: 60,
        active: true,
      },
      #{
        slug: "office-hours",
        name: "Office hours",
        description: "Drop in for 15 minutes to ask anything.",
        durationMinutes: 15,
        active: true,
      },
      #{
        slug: "long-form",
        name: "Long-form workshop",
        description: "Hidden from the catalog; toggle on to publish.",
        durationMinutes: 90,
        active: false,
      },
    ],
  })
  @get
  list(): EventType[] | UnauthorizedResponse;

  @doc("""
    Create a new event type. The slug must be unique across all event types
    (active or not). Newly created event types are active by default.
    """)
  @opExample(#{
    parameters: #{
      body: #{
        slug: "deep-dive",
        name: "Deep dive",
        description: "Focused 60-minute discussion on a specific topic.",
        durationMinutes: 60,
      },
    },
    returnType: #{
      slug: "deep-dive",
      name: "Deep dive",
      description: "Focused 60-minute discussion on a specific topic.",
      durationMinutes: 60,
      active: true,
    },
  })
  @post
  create(@body body: EventTypeCreate):
    | {
        @statusCode statusCode: 201;
        @body created: EventType;
      }
    | BadRequestResponse
    | UnauthorizedResponse
    | ConflictResponse;

  @doc("Get a single event type by slug (active or inactive).")
  @opExample(#{
    parameters: #{ slug: "intro-call" },
    returnType: #{
      slug: "intro-call",
      name: "Intro call",
      description: "A quick 30-minute introduction chat to get to know each other and discuss your project.",
      durationMinutes: 30,
      active: true,
    },
  })
  @get
  @route("/{slug}")
  get(
    @path slug: EventTypeSlug,
  ): EventType | UnauthorizedResponse | NotFoundResponse;

  @doc("""
    Partially update an event type. Any subset of fields may be present.
    Editing `durationMinutes` does not change existing bookings (they keep the
    duration snapshot taken at booking time). Editing `slug` is subject to the
    same uniqueness and format rules as creation.
    """)
  @opExample(#{
    parameters: #{
      slug: "intro-call",
      body: #{ name: "Intro chat", durationMinutes: 20 },
    },
    returnType: #{
      slug: "intro-call",
      name: "Intro chat",
      description: "A quick 30-minute introduction chat to get to know each other and discuss your project.",
      durationMinutes: 20,
      active: true,
    },
  })
  @patch
  @route("/{slug}")
  update(@path slug: EventTypeSlug, @body body: EventTypeUpdate):
    | EventType
    | BadRequestResponse
    | UnauthorizedResponse
    | NotFoundResponse
    | ConflictResponse;
}
```

- [ ] **Step 2: Verify the contract compiles + tests pass**

Run from the repo root: `cd contract && npm test`
Expected: TypeSpec compiles cleanly + the existing `openapi-contract.test.mjs` suite shows `pass 2`.

- [ ] **Step 3: Verify Prism serves the example**

Run from `frontend/`: `npm run gen:api` (rebuilds the contract + types).
Then start Prism alone in another shell: `npm run mock`.
Then in a third shell: `curl -s -H 'X-Admin-Token: x' http://127.0.0.1:4010/admin/event-types | python3 -m json.tool`
Expected: an array of 4 objects, the last with `"active": false`. Stop Prism.

- [ ] **Step 4: Commit**

```bash
git add contract/admin.tsp
git commit -m "$(cat <<'EOF'
Add @opExample to admin event-types endpoints

So Prism in static mode returns 4 realistic event types (3 active +
1 inactive) for the new /admin/event-types page, plus echo-back
examples for create/get/update.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Event-type Zod schema + diff helper

Pure module: form schema mirroring the contract, plus a small `diffEventType()` that computes the PATCH body for edit mode.

**Files:**
- Create: `frontend/src/features/admin/event-type-schema.ts`
- Test: `frontend/src/test/event-type-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/event-type-schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  EventTypeFormSchema,
  diffEventType,
} from '../features/admin/event-type-schema';

const ok = {
  slug: 'intro-call',
  name: 'Intro call',
  description: 'A 30-minute chat.',
  durationMinutes: 30,
};

describe('EventTypeFormSchema', () => {
  it('accepts a canonical example', () => {
    expect(EventTypeFormSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects empty / spaced / uppercase slugs', () => {
    for (const slug of ['', 'Intro Call', 'INTRO', 'intro_call', 'intro--call', '-intro', 'intro-']) {
      expect(EventTypeFormSchema.safeParse({ ...ok, slug }).success).toBe(false);
    }
  });

  it('rejects 0 / negative / non-integer / >24h duration', () => {
    for (const d of [0, -1, 1.5, 60 * 24 + 1]) {
      expect(
        EventTypeFormSchema.safeParse({ ...ok, durationMinutes: d }).success,
      ).toBe(false);
    }
  });

  it('rejects empty name / empty description', () => {
    expect(EventTypeFormSchema.safeParse({ ...ok, name: '' }).success).toBe(false);
    expect(EventTypeFormSchema.safeParse({ ...ok, name: '   ' }).success).toBe(false);
    expect(EventTypeFormSchema.safeParse({ ...ok, description: '' }).success).toBe(false);
  });
});

describe('diffEventType', () => {
  it('returns an empty object when nothing changed', () => {
    expect(diffEventType(ok, ok)).toEqual({});
  });

  it('includes only the changed fields', () => {
    expect(diffEventType(ok, { ...ok, name: 'New name' })).toEqual({
      name: 'New name',
    });
    expect(
      diffEventType(ok, { ...ok, slug: 'intro', durationMinutes: 45 }),
    ).toEqual({ slug: 'intro', durationMinutes: 45 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/test/event-type-schema.test.ts`
Expected: tests fail with "module not found".

- [ ] **Step 3: Implement**

Create `frontend/src/features/admin/event-type-schema.ts`:

```typescript
import { z } from 'zod';
import type { components } from '../../api/types';

const Slug = z
  .string()
  .min(1, 'Slug is required')
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, digits, and hyphens only');

export const EventTypeFormSchema = z.object({
  slug: Slug,
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().min(1, 'Description is required').max(2000),
  durationMinutes: z
    .number()
    .int('Use whole minutes')
    .min(1, 'Must be at least 1 minute')
    .max(60 * 24, 'Must be 24 hours or less'),
});

export type EventTypeFormValues = z.infer<typeof EventTypeFormSchema>;

const FIELDS: (keyof EventTypeFormValues)[] = ['slug', 'name', 'description', 'durationMinutes'];

export function diffEventType(
  before: EventTypeFormValues,
  after: EventTypeFormValues,
): components['schemas']['EventTypeUpdate'] {
  const out: components['schemas']['EventTypeUpdate'] = {};
  for (const k of FIELDS) {
    if (before[k] !== after[k]) {
      // Narrow `out` index by `k` — TS struggles to follow this in a loop, so
      // assign through `Record<string, unknown>` and let the schema enforce shape.
      (out as Record<string, unknown>)[k] = after[k];
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/test/event-type-schema.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/event-type-schema.ts frontend/src/test/event-type-schema.test.ts
git commit -m "$(cat <<'EOF'
Add event-type Zod schema + diffEventType helper

Mirrors the contract's EventTypeSlug regex and DurationMinutes >= 1
constraint exactly. diffEventType produces the minimal PATCH body for
edit mode by comparing form values against their initial state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Admin event-types query/mutation hooks

Three hooks wrapping `adminClient`, all throwing `HttpError` on non-2xx and disabling retries on 4xx. Same shape as `useAdminSettings`/`useUpdateAdminSettings` from Phase 2.

**Files:**
- Create: `frontend/src/api/queries/eventTypesAdmin.ts`
- Test: `frontend/src/test/eventTypesAdmin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/eventTypesAdmin.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  eventTypesAdminKeys,
  useAdminEventTypes,
  useCreateEventType,
  useUpdateEventType,
} from '../api/queries/eventTypesAdmin';
import type { EventType } from '../api/queries/eventTypesAdmin';
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

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    qc,
    Provider: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
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
    const { Provider } = wrapper();
    const { result } = renderHook(() => useAdminEventTypes(), { wrapper: Provider });
    await waitFor(() => expect(result.current.data).toEqual([ev]));
  });

  it('throws HttpError on a 4xx and does not retry', async () => {
    getMock.mockReturnValue(fail(401, 'unauthorized', 'bad token'));
    const { Provider } = wrapper();
    const { result } = renderHook(() => useAdminEventTypes(), { wrapper: Provider });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(HttpError);
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});

describe('useCreateEventType', () => {
  it('invalidates the list on success', async () => {
    postMock.mockReturnValue(ok(ev));
    const { qc, Provider } = wrapper();
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
    const { qc, Provider } = wrapper();
    qc.setQueryData(eventTypesAdminKeys.all, [ev]);
    const { result } = renderHook(() => useUpdateEventType(), { wrapper: Provider });
    result.current.mutate({ slug: 'intro-call', body: { name: 'Renamed' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryState(eventTypesAdminKeys.all)?.isInvalidated).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/test/eventTypesAdmin.test.ts`
Expected: tests fail with "module not found".

- [ ] **Step 3: Implement**

Create `frontend/src/api/queries/eventTypesAdmin.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminClient } from '../adminClient';
import type { components } from '../types';
import { HttpError } from '../../lib/httpError';

export type EventType = components['schemas']['EventType'];
export type EventTypeCreate = components['schemas']['EventTypeCreate'];
export type EventTypeUpdate = components['schemas']['EventTypeUpdate'];

export const eventTypesAdminKeys = {
  all: ['admin', 'event-types'] as const,
};

function isHttp4xx(err: unknown): boolean {
  return err instanceof HttpError && err.status >= 400 && err.status < 500;
}

export function useAdminEventTypes() {
  return useQuery({
    queryKey: eventTypesAdminKeys.all,
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    queryFn: async (): Promise<EventType[]> => {
      const res = await adminClient.GET('/admin/event-types');
      if (res.error) {
        throw new HttpError(
          res.response.status,
          res.error.code ?? 'http_error',
          res.error.message ?? 'Request failed',
        );
      }
      return res.data;
    },
  });
}

export function useCreateEventType() {
  const queryClient = useQueryClient();
  return useMutation<EventType, HttpError, EventTypeCreate>({
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    mutationFn: async (body) => {
      const res = await adminClient.POST('/admin/event-types', { body });
      if (res.error) {
        throw new HttpError(
          res.response.status,
          res.error.code ?? 'http_error',
          res.error.message ?? 'Create failed',
        );
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventTypesAdminKeys.all });
    },
  });
}

export function useUpdateEventType() {
  const queryClient = useQueryClient();
  return useMutation<
    EventType,
    HttpError,
    { slug: string; body: EventTypeUpdate }
  >({
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    mutationFn: async ({ slug, body }) => {
      const res = await adminClient.PATCH('/admin/event-types/{slug}', {
        params: { path: { slug } },
        body,
      });
      if (res.error) {
        throw new HttpError(
          res.response.status,
          res.error.code ?? 'http_error',
          res.error.message ?? 'Update failed',
        );
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventTypesAdminKeys.all });
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/test/eventTypesAdmin.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/queries/eventTypesAdmin.ts frontend/src/test/eventTypesAdmin.test.ts
git commit -m "$(cat <<'EOF'
Add admin event-type query + mutation hooks

useAdminEventTypes (GET list), useCreateEventType (POST),
useUpdateEventType (PATCH). All throw HttpError on non-2xx, disable
retries on 4xx, and invalidate the list on success — matching the
Phase 2 admin-hooks pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `<EventTypeFormModal />`

Single component used for both Create and Edit. Mode is implied by props.

**Files:**
- Create: `frontend/src/features/admin/EventTypeFormModal.tsx`
- Test: `frontend/src/test/EventTypeFormModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/EventTypeFormModal.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventTypeFormModal } from '../features/admin/EventTypeFormModal';
import type { EventType } from '../api/queries/eventTypesAdmin';

const postMock = vi.fn();
const patchMock = vi.fn();

vi.mock('../api/adminClient', () => ({
  adminClient: {
    GET: vi.fn(),
    POST: (...args: unknown[]) => postMock(...args),
    PATCH: (...args: unknown[]) => patchMock(...args),
  },
}));

const ev: EventType = {
  slug: 'intro-call',
  name: 'Intro call',
  description: 'A 30-minute chat.',
  durationMinutes: 30,
  active: true,
};

beforeEach(() => {
  postMock.mockReset();
  patchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const ok = <T,>(data: T) =>
  Promise.resolve({
    data,
    error: undefined,
    response: new Response(JSON.stringify(data), { status: 200 }),
  });
const conflict = (message: string) =>
  Promise.resolve({
    data: undefined,
    error: { code: 'duplicate', message },
    response: new Response('{}', { status: 409 }),
  });

function renderCreate() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <Notifications />
        <EventTypeFormModal mode="create" opened onClose={() => {}} />
      </MantineProvider>
    </QueryClientProvider>,
  );
}
function renderEdit(eventType: EventType, onClose = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <Notifications />
        <EventTypeFormModal mode="edit" eventType={eventType} opened onClose={onClose} />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe('EventTypeFormModal — create', () => {
  it('submits the form and closes on 201', async () => {
    postMock.mockReturnValue(ok(ev));
    const onClose = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <EventTypeFormModal mode="create" opened onClose={onClose} />
        </MantineProvider>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByLabelText(/^slug/i), 'intro-call');
    await userEvent.type(screen.getByLabelText(/^name/i), 'Intro call');
    await userEvent.type(screen.getByLabelText(/^description/i), 'A 30-minute chat.');
    // duration default is 30 so no edit needed
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [, options] = postMock.mock.calls[0];
    expect((options as { body: unknown }).body).toEqual({
      slug: 'intro-call',
      name: 'Intro call',
      description: 'A 30-minute chat.',
      durationMinutes: 30,
    });
  });

  it('shows an inline slug error on 409', async () => {
    postMock.mockReturnValue(conflict('duplicate slug'));
    renderCreate();
    await userEvent.type(screen.getByLabelText(/^slug/i), 'intro-call');
    await userEvent.type(screen.getByLabelText(/^name/i), 'X');
    await userEvent.type(screen.getByLabelText(/^description/i), 'X');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/already in use/i)).toBeInTheDocument();
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('blocks an invalid slug client-side (Zod)', async () => {
    renderCreate();
    await userEvent.type(screen.getByLabelText(/^slug/i), 'Bad Slug!');
    await userEvent.type(screen.getByLabelText(/^name/i), 'X');
    await userEvent.type(screen.getByLabelText(/^description/i), 'X');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(screen.getByText(/lowercase letters, digits, and hyphens only/i)).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });
});

describe('EventTypeFormModal — edit', () => {
  it('submits only the changed fields', async () => {
    patchMock.mockReturnValue(ok({ ...ev, name: 'Renamed' }));
    const onClose = vi.fn();
    renderEdit(ev, onClose);
    const nameInput = screen.getByLabelText(/^name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [, options] = patchMock.mock.calls[0];
    expect((options as { body: unknown }).body).toEqual({ name: 'Renamed' });
  });

  it('shows the slug-rename collision inline on 409', async () => {
    patchMock.mockReturnValue(conflict('slug taken'));
    renderEdit(ev);
    const slug = screen.getByLabelText(/^slug/i);
    await userEvent.clear(slug);
    await userEvent.type(slug, 'deep-dive');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/already in use/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/test/EventTypeFormModal.test.tsx`
Expected: tests fail with "module not found".

- [ ] **Step 3: Implement**

Create `frontend/src/features/admin/EventTypeFormModal.tsx`:

```typescript
import { Alert, Button, Group, Modal, NumberInput, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import {
  EventTypeFormSchema,
  diffEventType,
  type EventTypeFormValues,
} from './event-type-schema';
import {
  useCreateEventType,
  useUpdateEventType,
  type EventType,
} from '../../api/queries/eventTypesAdmin';
import { HttpError } from '../../lib/httpError';

type Props =
  | { opened: boolean; onClose: () => void; mode: 'create' }
  | { opened: boolean; onClose: () => void; mode: 'edit'; eventType: EventType };

const CREATE_DEFAULTS: EventTypeFormValues = {
  slug: '',
  name: '',
  description: '',
  durationMinutes: 30,
};

function toFormValues(ev: EventType): EventTypeFormValues {
  return {
    slug: ev.slug,
    name: ev.name,
    description: ev.description,
    durationMinutes: ev.durationMinutes,
  };
}

export function EventTypeFormModal(props: Props) {
  const isEdit = props.mode === 'edit';
  const initial = isEdit ? toFormValues(props.eventType) : CREATE_DEFAULTS;

  const form = useForm<EventTypeFormValues>({
    mode: 'controlled',
    initialValues: initial,
    validate: zod4Resolver(EventTypeFormSchema),
  });

  const createM = useCreateEventType();
  const updateM = useUpdateEventType();
  const pending = createM.isPending || updateM.isPending;
  const error = (createM.error ?? updateM.error) as HttpError | null;

  // Inline slug-conflict messaging on 409.
  const slugConflict = error?.status === 409 ? 'This slug is already in use. Pick a different one.' : null;
  const topAlert =
    error && error.status !== 409 && error.status !== 401
      ? { color: 'red' as const, message: error.message }
      : null;

  const onSubmit = (values: EventTypeFormValues) => {
    if (isEdit) {
      const body = diffEventType(initial, values);
      if (Object.keys(body).length === 0) {
        // Save button disabled when not dirty, but guard anyway.
        return;
      }
      updateM.mutate(
        { slug: props.eventType.slug, body },
        {
          onSuccess: (saved) => {
            notifications.show({ color: 'green', title: `${saved.name} updated`, message: '' });
            props.onClose();
          },
        },
      );
    } else {
      createM.mutate(values, {
        onSuccess: (saved) => {
          notifications.show({ color: 'green', title: `${saved.name} created`, message: '' });
          props.onClose();
        },
      });
    }
  };

  return (
    <Modal
      opened={props.opened}
      onClose={() => {
        if (pending) return;
        props.onClose();
      }}
      title={isEdit ? `Edit ${props.eventType.name}` : 'New event type'}
      centered
      closeOnClickOutside={!form.isDirty()}
    >
      <form onSubmit={form.onSubmit(onSubmit)}>
        <Stack gap="md">
          {topAlert && (
            <Alert color={topAlert.color} icon={<IconAlertTriangle />}>
              {topAlert.message}
            </Alert>
          )}
          <TextInput
            label="Slug"
            placeholder="lowercase-with-hyphens"
            required
            description={isEdit ? "Changing the slug breaks any links you've shared." : undefined}
            styles={{ input: { fontFamily: 'ui-monospace, monospace' } }}
            key={form.key('slug')}
            {...form.getInputProps('slug')}
            error={form.errors.slug ?? slugConflict}
          />
          <TextInput
            label="Name"
            required
            key={form.key('name')}
            {...form.getInputProps('name')}
          />
          <Textarea
            label="Description"
            required
            autosize
            minRows={3}
            key={form.key('description')}
            {...form.getInputProps('description')}
          />
          <NumberInput
            label="Duration"
            required
            min={1}
            max={60 * 24}
            suffix=" min"
            key={form.key('durationMinutes')}
            {...form.getInputProps('durationMinutes')}
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {isEdit ? 'Changes apply to future bookings only.' : 'New event types are active by default.'}
            </Text>
            <Group gap="sm">
              <Button variant="subtle" type="button" onClick={props.onClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={pending}
                disabled={isEdit ? !form.isDirty() : false}
              >
                Save
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/test/EventTypeFormModal.test.tsx`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/EventTypeFormModal.tsx frontend/src/test/EventTypeFormModal.test.tsx
git commit -m "$(cat <<'EOF'
Add EventTypeFormModal

Single component for both create and edit, dispatched via mode prop.
Diffs against initial values in edit mode so PATCH bodies stay
minimal. Inline slug-field error on 409 conflict; top-level alert for
other non-401 failures.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — `<EventTypesPage />`

The list page: table with active toggle (optimistic + rollback), edit button per row, header create button, empty state.

**Files:**
- Create: `frontend/src/features/admin/EventTypesPage.tsx`
- Test: `frontend/src/test/EventTypesPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/EventTypesPage.test.tsx`:

```typescript
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EventTypesPage } from '../features/admin/EventTypesPage';
import type { EventType } from '../api/queries/eventTypesAdmin';

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

const list: EventType[] = [
  { slug: 'intro', name: 'Intro', description: 'd', durationMinutes: 30, active: true },
  { slug: 'deep', name: 'Deep dive', description: 'd', durationMinutes: 60, active: true },
  { slug: 'wrk', name: 'Workshop', description: 'd', durationMinutes: 90, active: false },
];

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const ok = <T,>(data: T) =>
  Promise.resolve({
    data,
    error: undefined,
    response: new Response(JSON.stringify(data), { status: 200 }),
  });
const fail = (status: number, message: string) =>
  Promise.resolve({
    data: undefined,
    error: { code: 'x', message },
    response: new Response('{}', { status }),
  });

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <EventTypesPage />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('EventTypesPage', () => {
  it('renders the rows from the GET response', async () => {
    getMock.mockReturnValue(ok(list));
    renderPage();
    await waitFor(() => expect(screen.getByText('Intro')).toBeInTheDocument());
    expect(screen.getByText('Deep dive')).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
  });

  it('shows the empty state with a CTA', async () => {
    getMock.mockReturnValue(ok([]));
    renderPage();
    expect(await screen.findByText(/no event types yet/i)).toBeInTheDocument();
  });

  it('toggles active optimistically and shows a success toast', async () => {
    getMock.mockReturnValue(ok(list));
    patchMock.mockReturnValue(ok({ ...list[0], active: false }));
    renderPage();
    const introRow = (await screen.findByText('Intro')).closest('tr')!;
    const toggle = within(introRow).getByRole('switch');
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    // Optimistic flip: row is unchecked immediately
    expect(toggle).not.toBeChecked();
    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    const [, options] = patchMock.mock.calls[0];
    expect((options as { body: { active: boolean } }).body).toEqual({ active: false });
  });

  it('rolls back the toggle when the PATCH fails', async () => {
    getMock.mockReturnValue(ok(list));
    patchMock.mockReturnValue(fail(500, 'server boom'));
    renderPage();
    const introRow = (await screen.findByText('Intro')).closest('tr')!;
    const toggle = within(introRow).getByRole('switch');
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('opens the create modal from the header button', async () => {
    getMock.mockReturnValue(ok(list));
    renderPage();
    await screen.findByText('Intro');
    await userEvent.click(screen.getByRole('button', { name: /new event type/i }));
    expect(await screen.findByRole('dialog', { name: /new event type/i })).toBeInTheDocument();
  });

  it('opens the edit modal from a row Edit button', async () => {
    getMock.mockReturnValue(ok(list));
    renderPage();
    const introRow = (await screen.findByText('Intro')).closest('tr')!;
    await userEvent.click(within(introRow).getByRole('button', { name: /edit/i }));
    expect(await screen.findByRole('dialog', { name: /edit intro/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/test/EventTypesPage.test.tsx`
Expected: tests fail with "module not found".

- [ ] **Step 3: Implement**

Create `frontend/src/features/admin/EventTypesPage.tsx`:

```typescript
import { useState } from 'react';
import {
  Button,
  Card,
  Center,
  Code,
  Group,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import {
  eventTypesAdminKeys,
  useAdminEventTypes,
  type EventType,
} from '../../api/queries/eventTypesAdmin';
import { HttpError } from '../../lib/httpError';
import { adminClient } from '../../api/adminClient';
import { EventTypeFormModal } from './EventTypeFormModal';

type ModalState = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; eventType: EventType };

function useToggleActive() {
  const queryClient = useQueryClient();
  return useMutation<EventType, HttpError, { slug: string; active: boolean }, { previous?: EventType[] }>({
    retry: false,
    mutationFn: async ({ slug, active }) => {
      const res = await adminClient.PATCH('/admin/event-types/{slug}', {
        params: { path: { slug } },
        body: { active },
      });
      if (res.error) {
        throw new HttpError(
          res.response.status,
          res.error.code ?? 'http_error',
          res.error.message ?? 'Update failed',
        );
      }
      return res.data;
    },
    onMutate: async ({ slug, active }) => {
      await queryClient.cancelQueries({ queryKey: eventTypesAdminKeys.all });
      const previous = queryClient.getQueryData<EventType[]>(eventTypesAdminKeys.all);
      if (previous) {
        queryClient.setQueryData<EventType[]>(
          eventTypesAdminKeys.all,
          previous.map((e) => (e.slug === slug ? { ...e, active } : e)),
        );
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(eventTypesAdminKeys.all, ctx.previous);
      notifications.show({ color: 'red', title: 'Failed to update', message: err.message });
    },
    onSuccess: (saved) => {
      notifications.show({
        color: saved.active ? 'green' : 'gray',
        title: saved.active ? `${saved.name} is now active` : `${saved.name} is now hidden from the catalog`,
        message: '',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: eventTypesAdminKeys.all });
    },
  });
}

export function EventTypesPage() {
  const listQ = useAdminEventTypes();
  const toggle = useToggleActive();
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  if (listQ.isPending) {
    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Event types</Title>
        </Group>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} h={48} />
        ))}
      </Stack>
    );
  }

  if (listQ.isError) {
    const err = listQ.error as Error;
    return (
      <ErrorState
        title="Couldn't load event types"
        message={err.message}
        onRetry={() => listQ.refetch()}
      />
    );
  }

  const items = listQ.data;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={2}>Event types</Title>
          <Text c="dimmed" size="sm">
            All event types — active and inactive. Toggle a row to publish or hide it from the public catalog.
          </Text>
        </Stack>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ kind: 'create' })}>
          New event type
        </Button>
      </Group>

      {items.length === 0 ? (
        <Card withBorder p="xl">
          <Center>
            <Stack align="center" gap="sm">
              <Title order={4}>No event types yet</Title>
              <Text c="dimmed" size="sm">
                Create the first one to make it bookable on the public catalog.
              </Text>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setModal({ kind: 'create' })}
              >
                New event type
              </Button>
            </Stack>
          </Center>
        </Card>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Slug</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Duration</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((ev) => (
              <Table.Tr key={ev.slug}>
                <Table.Td>
                  <Code>{ev.slug}</Code>
                </Table.Td>
                <Table.Td>{ev.name}</Table.Td>
                <Table.Td>{ev.durationMinutes} min</Table.Td>
                <Table.Td>
                  <Switch
                    aria-label="Toggle active"
                    checked={ev.active}
                    onChange={(e) =>
                      toggle.mutate({ slug: ev.slug, active: e.currentTarget.checked })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => setModal({ kind: 'edit', eventType: ev })}
                  >
                    Edit
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {modal.kind === 'create' && (
        <EventTypeFormModal mode="create" opened onClose={() => setModal({ kind: 'closed' })} />
      )}
      {modal.kind === 'edit' && (
        <EventTypeFormModal
          mode="edit"
          eventType={modal.eventType}
          opened
          onClose={() => setModal({ kind: 'closed' })}
        />
      )}
    </Stack>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/test/EventTypesPage.test.tsx`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/EventTypesPage.tsx frontend/src/test/EventTypesPage.test.tsx
git commit -m "$(cat <<'EOF'
Add EventTypesPage

List page with inline active toggle (optimistic + rollback via the
TanStack Query onMutate/onError pattern), header create button, and
per-row edit button — all opening the same modal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Wire admin layout + route

Add the nav link to `<AdminLayout>` and the child route to `routes.tsx`.

**Files:**
- Modify: `frontend/src/components/AdminLayout.tsx`
- Modify: `frontend/src/routes.tsx`

- [ ] **Step 1: Add the nav link**

In `frontend/src/components/AdminLayout.tsx`, locate the `<Group gap="md">` that wraps the existing `<AdminNavLink to="/admin/settings">Settings</AdminNavLink>` and add a sibling link for Event types:

```tsx
<Group gap="md">
  <AdminNavLink to="/admin/settings">Settings</AdminNavLink>
  <AdminNavLink to="/admin/event-types">Event types</AdminNavLink>
</Group>
```

- [ ] **Step 2: Add the route**

In `frontend/src/routes.tsx`, find the admin children block:

```tsx
{
  element: <AdminLayout />,
  children: [
    { index: true, element: <Navigate to="settings" replace /> },
    { path: 'settings', element: <SettingsPage /> },
  ],
},
```

Replace with:

```tsx
{
  element: <AdminLayout />,
  children: [
    { index: true, element: <Navigate to="settings" replace /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: 'event-types', element: <EventTypesPage /> },
  ],
},
```

Add the import at the top with the other feature imports:

```tsx
import { EventTypesPage } from './features/admin/EventTypesPage';
```

- [ ] **Step 3: Run the gates**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AdminLayout.tsx frontend/src/routes.tsx
git commit -m "$(cat <<'EOF'
Wire /admin/event-types into the admin shell

Add the Event types link to AdminLayout's nav and the corresponding
child route to routes.tsx, alongside the existing /admin/settings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Manual verification + push + open PR

- [ ] **Step 1: Final pre-merge gates**

From `frontend/`:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
Expected: all green; new tests in the count.

- [ ] **Step 2: Walk the flow against Prism**

Run: `npm run dev:full`. Open `http://localhost:5173/admin`. Then:

1. Sign in (any non-empty token; Prism just needs the header to be present).
2. Click "Event types" in the admin header. The page shows 4 rows from the contract examples — 3 active + 1 inactive (`long-form`).
3. Click the active switch on `office-hours` (row 3). The row flips off immediately; the green/gray toast appears; DevTools shows `PATCH /admin/event-types/office-hours` with body `{ "active": false }` returning 200.
4. Click "+ New event type". Type `slug: intro-call` (a duplicate) + name + description, click Save. Prism doesn't enforce 409 for a static example, so this WILL succeed against Prism — that's expected. The mocked-409 path is exercised by the unit test, not the manual walk.
5. Click Save with a fresh slug like `coffee-break`, name "Coffee break", description "15 min coffee", duration 15. Expected: green toast, modal closes, row appears (Prism returns the example we baked in, but the wire format is right).
6. Click Edit on a row. Change just the name. Click Save. DevTools shows the PATCH body has only the `name` field.
7. Click Sign out → back to `/`. Re-visit `/admin/event-types` → modal returns first.

If any step misbehaves, fix the underlying code; do not skip steps.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin claude/admin-event-types
gh pr create --base main --head claude/admin-event-types \
  --title "Phase 3: admin event-types CRUD" \
  --body "$(cat <<'EOF'
## Summary

- Adds `/admin/event-types` — a list page with a Mantine table, an inline active toggle (optimistic + rollback), per-row edit button, header "+ New event type" button, and an empty state.
- Adds a single `<EventTypeFormModal />` used for both create and edit; edit-mode submits only the changed fields via a `diffEventType()` helper. Inline `slug`-field error on 409; top-level alert for other non-401 failures.
- Adds typed admin hooks `useAdminEventTypes` / `useCreateEventType` / `useUpdateEventType` (HttpError, no retry on 4xx, list invalidation on success).
- Adds `@opExample` to the contract's admin event-type endpoints (4-row list with one inactive example, plus echo-back on create/get/update).
- Adds the "Event types" nav link to `AdminLayout`.

The design spec (`docs/superpowers/specs/2026-05-10-admin-event-types-design.md`) and the implementation plan (`docs/superpowers/plans/2026-05-10-admin-event-types.md`) are committed alongside the code.

This PR depends on Phase 2 (PR #4). Will rebase once that merges.

## Test plan

- [x] `cd contract && npm test`
- [x] `cd frontend && npm run typecheck && npm run lint && npm test && npm run build` — all green; new tests covering the schema, the three hooks, the modal (create + edit + 409 + Zod), and the page (list + empty + optimistic toggle + rollback + create-modal-open + edit-modal-open).
- [x] `cd frontend && npm run dev:full`; walked the manual checklist in the plan.
- [ ] Reviewer: walk `/admin/event-types` against Prism — confirm the table populates, the toggle flips with a toast, and create/edit modals open and submit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Confirm**

`gh pr create` returns the PR URL. Done.

---

## Self-review (skill checklist)

**Spec coverage:**
- Routes (sibling to /admin/settings, no /:slug routes): Task 6.
- File layout (eventTypesAdmin.ts, event-type-schema.ts, EventTypeFormModal.tsx, EventTypesPage.tsx): Tasks 2, 3, 4, 5.
- AdminLayout nav addition: Task 6.
- Contract `@opExample` on AdminEventTypes ops: Task 1.
- Zod schema mirrors contract regex + `min(1)` duration: Task 2.
- `diffEventType` for minimal PATCH bodies: Task 2 (impl + tests).
- Active toggle with optimistic update + rollback + toast: Task 5 (`useToggleActive`).
- Modal for create + edit, single component, mode prop: Task 4.
- Inline slug-field 409 error in modal: Task 4.
- Top-level Alert for other non-401 errors in modal: Task 4.
- Empty state on list: Task 5.
- Loading skeleton + ErrorState on list: Task 5.

**Placeholder scan:** No "TBD" / "implement later". Each task has full code blocks.

**Type consistency:**
- `EventTypeFormValues` defined in Task 2, imported by Task 4.
- `diffEventType(before, after)` signature consistent: Task 2 schema test + Task 4 use.
- `EventType` / `EventTypeCreate` / `EventTypeUpdate` types consistent across Tasks 3, 4, 5.
- `eventTypesAdminKeys.all` consistent across Tasks 3 and 5.
- `useToggleActive`'s context shape `{ previous?: EventType[] }` matches the rollback path in `onError`.

**Tests vs spec:** the spec lists 9 smoke + 4 schema. Tasks 4 and 5 collectively implement: list render (5.1), empty (5.2), optimistic toggle (5.3), rollback (5.4), create happy (4.1), create 409 (4.2), edit happy (4.3), edit-collision (4.4), Zod (4.3 — slug regex check); plus open-create-modal (5.5) and open-edit-modal (5.6). Schema tests (Task 2) cover all 4 items. Combined: ≥ 13 new tests.
