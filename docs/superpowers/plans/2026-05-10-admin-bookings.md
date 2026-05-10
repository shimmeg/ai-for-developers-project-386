# Phase 4 — Admin bookings (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/admin/bookings` — a list page showing every upcoming booking with a per-row Cancel button that opens a confirm modal and triggers an optimistic DELETE. Backed by `useAdminBookings` (list) and `useCancelBooking` (optimistic remove + rollback).

**Architecture:** Sibling route to `/admin/settings` and `/admin/event-types` under the existing `<AdminGate>` → `<AdminLayout>`. The list page owns the modal target state; the modal is a dumb confirmation that delegates to a page-supplied callback. The cancel mutation uses TanStack Query's `onMutate`/`onError` to optimistically remove the row and roll back on error. Times render in the owner's configured timezone via `formatFullHuman` + `<TimezoneBanner>`.

**Tech Stack:** React 19, TypeScript 5 (strict), Mantine 9 (`@mantine/core`, `@mantine/notifications`), React Router 7, TanStack Query 5, openapi-fetch (`adminClient` from Phase 2), Vitest 4 + RTL.

**Spec:** [`docs/superpowers/specs/2026-05-10-admin-bookings-design.md`](../specs/2026-05-10-admin-bookings-design.md).

---

## File map

```
contract/admin.tsp                                 # MODIFY: @opExample on AdminBookings.{list, cancel}
frontend/src/
├── api/queries/
│   └── bookingsAdmin.ts                           # CREATE
├── features/admin/
│   ├── BookingsPage.tsx                           # CREATE
│   └── CancelBookingModal.tsx                     # CREATE
├── components/AdminLayout.tsx                     # MODIFY: add Bookings nav link
├── routes.tsx                                     # MODIFY: add 'bookings' child route
└── test/
    ├── bookingsAdmin.test.tsx                     # CREATE
    ├── CancelBookingModal.test.tsx                # CREATE
    └── BookingsPage.test.tsx                      # CREATE
```

> Working directory: all `npm` commands run from `frontend/` unless prefixed with `cd contract`.

---

## Task 1 — `@opExample` on `AdminBookings.{list, cancel}`

So Prism returns realistic bookings on the new `/admin/bookings` page. Without it the list is empty (or null-filled) and the page looks broken in dev.

**Files:**
- Modify: `contract/admin.tsp`

- [ ] **Step 1: Add `@opExample` decorators**

Locate the `AdminBookings` interface (around lines 214-234 of `contract/admin.tsp`). Replace it with:

```typespec
@tag("Admin: Bookings")
@useAuth(AdminAuth)
@route("/admin/bookings")
interface AdminBookings {
  @doc("""
    List all upcoming bookings across every event type, sorted by start time
    ascending. Past bookings are not returned. There is no pagination in v1.
    """)
  @opExample(#{
    returnType: #[
      #{
        id: "5b3f8a2c-e7f4-4a1b-9c5d-2f7e8b0a6d3c",
        eventTypeSlug: "intro-call",
        eventTypeName: "Intro call",
        startTime: offsetDateTime.fromISO("2026-05-12T10:00:00+03:00"),
        durationMinutesSnapshot: 30,
        guestName: "Jane Doe",
        guestEmail: "jane.doe@example.com",
        guestNotes: "Looking forward to chatting about the project. Background: I'm a backend engineer evaluating tooling choices for our team's next quarter.",
        createdAt: offsetDateTime.fromISO("2026-05-09T14:23:11+03:00"),
      },
      #{
        id: "8a1c2d4e-9f6b-4c3a-bd5e-1f8a3c7d6e2b",
        eventTypeSlug: "deep-dive",
        eventTypeName: "Deep dive",
        startTime: offsetDateTime.fromISO("2026-05-12T14:00:00+03:00"),
        durationMinutesSnapshot: 60,
        guestName: "Sam Patel",
        guestEmail: "sam.patel@example.com",
        createdAt: offsetDateTime.fromISO("2026-05-10T09:14:02+03:00"),
      },
      #{
        id: "c2d4e6f8-1a3b-5c7d-9e0f-2b4d6f8a0c1e",
        eventTypeSlug: "office-hours",
        eventTypeName: "Office hours",
        startTime: offsetDateTime.fromISO("2026-05-13T09:30:00+03:00"),
        durationMinutesSnapshot: 15,
        guestName: "Mei Chen",
        guestEmail: "mei.chen@example.com",
        guestNotes: "Quick question about timezones.",
        createdAt: offsetDateTime.fromISO("2026-05-10T11:02:55+03:00"),
      },
      #{
        id: "ff00aa11-bb22-cc33-dd44-ee55ff66aa77",
        eventTypeSlug: "intro-call",
        eventTypeName: "Intro call",
        startTime: offsetDateTime.fromISO("2026-05-15T15:30:00+03:00"),
        durationMinutesSnapshot: 30,
        guestName: "Alex Müller",
        guestEmail: "alex.mueller@example.de",
        createdAt: offsetDateTime.fromISO("2026-05-10T16:48:21+03:00"),
      },
    ],
  })
  @get
  list(): Booking[] | UnauthorizedResponse;

  @doc("""
    Cancel an upcoming booking. The booking is removed (or marked cancelled —
    server's choice) and its time slot becomes immediately available again.
    """)
  @opExample(#{
    parameters: #{ id: "5b3f8a2c-e7f4-4a1b-9c5d-2f7e8b0a6d3c" },
    returnType: #{ statusCode: 204 },
  })
  @delete
  @route("/{id}")
  cancel(@path id: BookingId): {
    @statusCode statusCode: 204;
  } | UnauthorizedResponse | NotFoundResponse;
}
```

- [ ] **Step 2: Verify the contract compiles + tests pass**

Run from the repo root: `cd contract && npm test`
Expected: TypeSpec compiles cleanly + the existing `openapi-contract.test.mjs` suite passes.

- [ ] **Step 3: Regenerate the frontend types**

Run from `frontend/`: `npm run gen:api`. Confirms the new examples are baked into `tsp-output/@typespec/openapi3/openapi.yaml` and `src/api/types.ts`.

- [ ] **Step 4: Verify Prism serves the example**

Start Prism alone: `npm run mock` (in another shell).
Then: `curl -s -H 'X-Admin-Token: x' http://127.0.0.1:4010/admin/bookings | python3 -m json.tool`
Expected: an array of 4 booking objects, two with `guestNotes` and two without; mixed event-type slugs; `startTime` strings with `+03:00` offset. Stop Prism (Ctrl-C in its shell).

Then: `curl -i -X DELETE -H 'X-Admin-Token: x' http://127.0.0.1:4010/admin/bookings/5b3f8a2c-e7f4-4a1b-9c5d-2f7e8b0a6d3c`
Expected: `HTTP/1.1 204 No Content`.

- [ ] **Step 5: Commit**

```bash
git add contract/admin.tsp
git commit -m "$(cat <<'EOF'
Add @opExample to admin bookings endpoints

So Prism in static mode returns 4 realistic bookings (mixed event
types, mixed notes) for the new /admin/bookings page, plus a 204
example for cancel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Admin bookings query/mutation hooks

Two hooks wrapping `adminClient`: `useAdminBookings` (GET list) and `useCancelBooking` (DELETE with optimistic remove + rollback). Same `HttpError` carrier and 4xx-no-retry policy as Phase 2/3.

**Files:**
- Create: `frontend/src/api/queries/bookingsAdmin.ts`
- Test: `frontend/src/test/bookingsAdmin.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/test/bookingsAdmin.test.tsx`:

- `useAdminBookings` returns the GET payload.
- `useAdminBookings` throws `HttpError` on 401; does not retry (call count == 1).
- `useCancelBooking` succeeds on 204 (`isSuccess: true`, list invalidated).
- `useCancelBooking` optimistically removes the row from cached list before the DELETE resolves (use deferred mock `mockReturnValueOnce(new Promise((r) => { resolve = r }))` so the optimistic snapshot is observable).
- `useCancelBooking` rolls the cache back when DELETE returns 500.
- `useCancelBooking` rolls the cache back when DELETE returns 404.

Mock pattern: `vi.mock('../api/adminClient', () => ({ adminClient: { GET, POST, PATCH, DELETE } }))` — same as Phase 3's `eventTypesAdmin.test.ts` but with a `DELETE` mock added.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/test/bookingsAdmin.test.tsx`
Expected: tests fail with "module not found" or assertion failures.

- [ ] **Step 3: Implement the hooks**

Create `frontend/src/api/queries/bookingsAdmin.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminClient } from '../adminClient';
import type { components } from '../types';
import { HttpError, toHttpError } from '../../lib/httpError';

export type Booking = components['schemas']['Booking'];

export const bookingsAdminKeys = {
  all: ['admin', 'bookings'] as const,
};

function isHttp4xx(err: unknown): boolean {
  return err instanceof HttpError && err.status >= 400 && err.status < 500;
}

export function useAdminBookings() {
  return useQuery<Booking[], HttpError>({
    queryKey: bookingsAdminKeys.all,
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    queryFn: async () => {
      const res = await adminClient.GET('/admin/bookings');
      if (res.error) throw toHttpError(res.error, res.response);
      return res.data;
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation<void, HttpError, { id: string }, { previous?: Booking[] }>({
    retry: false,
    mutationFn: async ({ id }) => {
      const res = await adminClient.DELETE('/admin/bookings/{id}', {
        params: { path: { id } },
      });
      if (res.error) throw toHttpError(res.error, res.response, 'Cancel failed');
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: bookingsAdminKeys.all });
      const previous = queryClient.getQueryData<Booking[]>(bookingsAdminKeys.all);
      if (previous) {
        queryClient.setQueryData<Booking[]>(
          bookingsAdminKeys.all,
          previous.filter((b) => b.id !== id),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(bookingsAdminKeys.all, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: bookingsAdminKeys.all });
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/test/bookingsAdmin.test.tsx`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/queries/bookingsAdmin.ts frontend/src/test/bookingsAdmin.test.tsx
git commit -m "$(cat <<'EOF'
Add admin booking query + cancel mutation hooks

useAdminBookings (GET list, HttpError carrier, retry-false-on-4xx) and
useCancelBooking (DELETE with optimistic remove + rollback on error).
Mirrors the Phase 3 useToggleActiveEventType optimistic shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — `<CancelBookingModal />`

A small confirmation modal. Receives a `booking`, a `timezone`, and `onConfirm` / `onClose` callbacks. Does not own the mutation — the page does.

**Files:**
- Create: `frontend/src/features/admin/CancelBookingModal.tsx`
- Test: `frontend/src/test/CancelBookingModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/CancelBookingModal.test.tsx`:

- Renders the booking summary in the owner timezone (asserts the `formatFullHuman` output is in the DOM, the event-type name + duration, and the guest name + email).
- Renders the warning copy ("guest will not be notified" or similar).
- Click "Cancel booking" → `onConfirm` called once.
- Click "Keep" → `onClose` called, `onConfirm` not called.
- Pressing Escape → `onClose` called.

The modal has no Query context dependency, so a plain `<MantineProvider>` wrapper is enough.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/test/CancelBookingModal.test.tsx`

- [ ] **Step 3: Implement**

Create `frontend/src/features/admin/CancelBookingModal.tsx`. Sketch:

```typescript
import { Button, Card, Group, Modal, Stack, Text } from '@mantine/core';
import type { Booking } from '../../api/queries/bookingsAdmin';
import { formatFullHuman } from '../../lib/datetime';

type Props = {
  opened: boolean;
  booking: Booking;
  timezone: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function CancelBookingModal({ opened, booking, timezone, onConfirm, onClose }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Cancel booking" size="sm" centered>
      <Stack gap="md">
        <Text size="sm">
          This frees the slot for new bookings. The guest will not be notified by email.
        </Text>
        <Card withBorder p="sm">
          <Stack gap={4}>
            <Text fw={500}>{formatFullHuman(booking.startTime, timezone)}</Text>
            <Text size="sm" c="dimmed">
              {booking.eventTypeName} · {booking.durationMinutesSnapshot} min
            </Text>
            <Text size="sm" c="dimmed">
              {booking.guestName} · {booking.guestEmail}
            </Text>
          </Stack>
        </Card>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Keep
          </Button>
          <Button color="red" onClick={onConfirm}>
            Cancel booking
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/test/CancelBookingModal.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/CancelBookingModal.tsx frontend/src/test/CancelBookingModal.test.tsx
git commit -m "$(cat <<'EOF'
Add CancelBookingModal

Dumb confirmation modal: renders the booking summary in the owner's
timezone + the no-email warning + Keep/Cancel-booking buttons. The page
owns the mutation; this component just delegates onConfirm/onClose.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `<BookingsPage />`

Renders the bookings table, owns the modal state, and orchestrates the cancel mutation.

**Files:**
- Create: `frontend/src/features/admin/BookingsPage.tsx`
- Test: `frontend/src/test/BookingsPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/test/BookingsPage.test.tsx` covering:

1. **Loading** — both queries pending → skeleton rows rendered.
2. **Settings error** — `<ErrorState>` for the timezone failure.
3. **Bookings error** — `<ErrorState>` with Retry; click Retry → `refetch` fires.
4. **Empty** — empty-state title + CTA visible (link to `/admin/event-types`).
5. **Data render** — rows in server order; "When" cell text equals `formatFullHuman(startTime, timezone)`; `<TimezoneBanner>` visible.
6. **Cancel happy path** — Click row's Cancel → modal opens → click "Cancel booking" → row disappears immediately (optimistic; deferred mock pattern) → green toast appears.
7. **Cancel rollback** — DELETE returns 500 → row reappears; red toast.
8. **Cancel — 404** — DELETE returns 404 → row reappears; red toast.
9. **Per-row pending** — Clicking Cancel on row A disables row A's button; clicking it again does not fire a second DELETE.

Mock pattern follows `EventTypesPage.test.tsx` — module-level mock of `adminClient` with `GET`/`DELETE`. Also need to mock `getMock` for `/admin/settings` (the first call goes there; the second to `/admin/bookings`). Or stub `useAdminSettings` directly via `vi.mock('../api/queries/settings', ...)` — simpler.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/test/BookingsPage.test.tsx`

- [ ] **Step 3: Implement**

Create `frontend/src/features/admin/BookingsPage.tsx`. Key shape:

- Reads `useAdminSettings()` for `timezone`; reads `useAdminBookings()` for the rows.
- If either is loading → skeletons.
- If either errors → `<ErrorState>` (settings error first; if settings ok and bookings error, show bookings error).
- If bookings is `[]` → empty state with CTA.
- Otherwise → `<TimezoneBanner>` + Mantine `<Table>` with seven columns.
- Local state `useState<{ kind: 'closed' } | { kind: 'open'; booking: Booking }>({ kind: 'closed' })`.
- Per-row Cancel button: `<Button color="red" variant="subtle" size="xs" onClick={() => setModal({ kind: 'open', booking })}>Cancel</Button>`. Disable when `cancel.isPending && cancel.variables?.id === booking.id`.
- On modal confirm → `cancel.mutate({ id }, { onSuccess, onError })`; close modal.
- `onSuccess`: green toast.
- `onError`: red toast with the error message.

Notes column: `<Tooltip label={booking.guestNotes} disabled={!booking.guestNotes} multiline w={320}>`. The cell content is `<Text lineClamp={1} size="sm" maw={240}>{booking.guestNotes ?? '—'}</Text>` — em-dash when no notes; truncated text when notes are present.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/test/BookingsPage.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/BookingsPage.tsx frontend/src/test/BookingsPage.test.tsx
git commit -m "$(cat <<'EOF'
Add BookingsPage

Lists upcoming bookings in the owner's timezone with a per-row Cancel
that opens CancelBookingModal. Confirming triggers an optimistic remove
via useCancelBooking; rollback + red toast on error. Empty state links
to /admin/event-types so the owner can share a slug.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Wire route + nav link

**Files:**
- Modify: `frontend/src/routes.tsx`
- Modify: `frontend/src/components/AdminLayout.tsx`

- [ ] **Step 1: Add the route**

In `frontend/src/routes.tsx`, add the import and the child route under `/admin`:

```tsx
import { BookingsPage } from './features/admin/BookingsPage';

// inside the /admin → AdminLayout children array, after event-types:
{ path: 'bookings', element: <BookingsPage /> },
```

- [ ] **Step 2: Add the nav link**

In `frontend/src/components/AdminLayout.tsx`, add a third `<AdminNavLink>` after Event types:

```tsx
<AdminNavLink to="/admin/bookings">Bookings</AdminNavLink>
```

- [ ] **Step 3: Smoke check**

Run `npm run dev:full`. Sign in. Verify:
- Header shows three nav links (Settings, Event types, Bookings).
- `/admin/bookings` renders the 4 mocked bookings + the `<TimezoneBanner>`.
- Click Cancel on a row → modal opens with the booking summary; click "Cancel booking" → row disappears.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes.tsx frontend/src/components/AdminLayout.tsx
git commit -m "$(cat <<'EOF'
Wire /admin/bookings into the admin shell

Adds the Bookings nav link next to Settings + Event types and the
'bookings' child route under the /admin AdminGate → AdminLayout branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Pre-merge gate + frontend review

- [ ] **Step 1: Run all checks**

```bash
cd contract && npm test
cd ../frontend && npm run typecheck && npm run lint && npm test && npm run build
```

All five must pass cleanly.

- [ ] **Step 2: Run `/frontend-review`**

Invoke the `frontend-reviewer` subagent. Address any must-fix findings before opening the PR.

- [ ] **Step 3: Update `frontend/ROADMAP.md`**

Mark Phase 4 as shipped and refresh the conventions section if anything new emerged. Commit the doc change.

---

## Hard rules (do not drift)

- Display **`durationMinutesSnapshot`** from each booking — never the live event-type duration.
- All times in the **owner's configured timezone** with `<TimezoneBanner>` on the page.
- **No guest-side cancel**, no email on cancel — surface this in the modal copy.
- **Past bookings are not displayed** — server already filters.
- After `if (res.error) throw …`, just `return res.data` (the openapi-fetch narrowing quirk).
- **HttpError carrier on every admin hook** — `throw toHttpError(res.error, res.response, fallback)` after the error check.
- **`retry: (count, err) => isHttp4xx(err) ? false : count < 1`** on the GET; **`retry: false`** on the cancel mutation (latency-sensitive optimistic update).
