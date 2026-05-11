# Phase 4 — Admin bookings (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/admin/bookings` — a Mantine table that lists every upcoming booking and lets the owner cancel any one of them via a confirm modal. Cancel is optimistic + rollback, mirroring Phase 3's `useToggleActiveEventType` shape.

**Architecture:** Sibling route to `/admin/settings` and `/admin/event-types` under the existing `<AdminGate>` → `<AdminLayout>`. The page coordinates modal state via a discriminated-union `useState`; the modal is presentational (receives `isPending` + callbacks). The cancel mutation lives in the hook file (not the page), with `onMutate` snapshotting the cache, `onError` rolling back, and `onSettled` invalidating. A 404 on cancel is treated as a benign race ("Already cancelled" toast). All times rendered via `formatFullHuman(iso, timezone)`, sourced from `useAdminSettings()` (already cached after the AdminGate's first probe; falls back to UTC defensively).

**Tech Stack:** React 19, TypeScript 5 (strict), Mantine 9 (`@mantine/core`, `@mantine/notifications`), React Router 7, TanStack Query 5, openapi-fetch (`adminClient` from Phase 2), Vitest 4 + RTL.

**Spec:** [`docs/superpowers/specs/2026-05-10-admin-bookings-design.md`](../specs/2026-05-10-admin-bookings-design.md).

---

## File map

```
contract/admin.tsp                                 # MODIFY: @opExample on AdminBookings ops
frontend/src/
├── api/queries/
│   └── bookingsAdmin.ts                           # CREATE — useAdminBookings + useCancelBooking
├── features/admin/
│   ├── BookingsPage.tsx                           # CREATE — list + modal coordination + empty state
│   └── CancelBookingModal.tsx                     # CREATE — confirm modal
├── components/AdminLayout.tsx                     # MODIFY: add Bookings nav link
├── routes.tsx                                     # MODIFY: add 'bookings' child route
└── test/
    ├── bookingsAdmin.test.tsx                     # CREATE — hook tests (5)
    ├── BookingsPage.test.tsx                      # CREATE — page tests (8)
    └── CancelBookingModal.test.tsx                # CREATE — modal tests (6)
```

> Working directory: all `npm` commands run from `frontend/` unless prefixed with `cd contract`.

---

## Task 1 — Add `@opExample` to admin bookings operations

So Prism in static mode returns realistic mock data on `GET /admin/bookings`. Without it, the list page renders against an empty array.

**Files:** modify [`contract/admin.tsp`](../../../contract/admin.tsp) (the `AdminBookings` interface).

- [ ] Add `@opExample` to `list` returning 4 bookings spanning the same `intro-call` / `deep-dive` / `office-hours` slugs Phases 1 and 3 already seed, with mixed start times (so the sort-by-startTime ordering is observable), mixed durations (15 / 30 / 60 / 60), one booking *without* `guestNotes` (exercises the optional-field path), and one with notes longer than 80 chars (exercises the truncate + tooltip path).
- [ ] Add `@opExample` to `cancel` returning a 204 with no body.
- [ ] Verify: `cd contract && npm test` (existing `openapi-contract.test.mjs` should still pass).
- [ ] Verify against Prism:
  ```bash
  # frontend/
  npm run gen:api && npm run mock                 # Prism on :4010
  curl -s -H 'X-Admin-Token: x' http://127.0.0.1:4010/admin/bookings | python3 -m json.tool
  ```
  Expected: an array of 4 objects, sorted by `startTime`, one without `guestNotes`.
- [ ] Commit: `Add @opExample to admin bookings endpoints`.

---

## Task 2 — `bookingsAdmin.ts` query + mutation hooks

Mirror [`eventTypesAdmin.ts`](../../../frontend/src/api/queries/eventTypesAdmin.ts) shape. The cancel mutation is optimistic (remove the row, rollback on error) and lives in the hook file alongside `useAdminBookings`.

**Files:** create [`frontend/src/api/queries/bookingsAdmin.ts`](../../../frontend/src/api/queries/bookingsAdmin.ts) + [`frontend/src/test/bookingsAdmin.test.tsx`](../../../frontend/src/test/bookingsAdmin.test.tsx).

- [ ] **Test first.** Hook tests (mock `adminClient.GET` + `adminClient.DELETE`). Cases:
  1. `useAdminBookings` returns the list when GET succeeds.
  2. `useAdminBookings` throws `HttpError` and does not retry on a 401.
  3. `useCancelBooking` removes the row optimistically before the DELETE resolves *(use a deferred promise so the optimistic state is observable)*.
  4. `useCancelBooking` rolls the row back when the DELETE returns 500.
  5. `useCancelBooking` invalidates `bookingsAdminKeys.all` on success.
- [ ] **Implement.** Module exports:
  ```ts
  export type Booking = components['schemas']['Booking'];
  export const bookingsAdminKeys = { all: ['admin', 'bookings'] as const };
  export function useAdminBookings(): UseQueryResult<Booking[], HttpError>;
  export function useCancelBooking(): UseMutationResult<void, HttpError, { id: string }, { previous?: Booking[] }>;
  ```
  - Inline `isHttp4xx` (same as the other hook files).
  - `useAdminBookings`: `adminClient.GET('/admin/bookings')`, throw via `toHttpError(res.error, res.response)`, return `res.data`.
  - `useCancelBooking`: `mutationFn` calls `DELETE /admin/bookings/{id}` and resolves to `void` on 204; `onMutate` snapshots `previous` and filters the row out; `onError` restores; `onSettled` invalidates; `retry: false`.
- [ ] Tests pass.
- [ ] Commit: `Add admin bookings query + cancel mutation hooks`.

---

## Task 3 — `<CancelBookingModal />`

A pure presentational Mantine `Modal` that summarises the booking. Page coordinates state.

**Files:** create [`frontend/src/features/admin/CancelBookingModal.tsx`](../../../frontend/src/features/admin/CancelBookingModal.tsx) + [`frontend/src/test/CancelBookingModal.test.tsx`](../../../frontend/src/test/CancelBookingModal.test.tsx).

- [ ] **Test first.** Cases:
  1. Renders the booking's `eventTypeName`, `formatFullHuman(startTime, timezone)`, and `guestName`.
  2. Renders the "guest is not notified" caveat.
  3. Clicking the destructive **Cancel booking** button calls `onConfirm`.
  4. Clicking **Keep booking** calls `onClose` without calling `onConfirm`.
  5. While `isPending`, the destructive button shows the Mantine spinner via `loading`.
  6. Notes preview omitted when `guestNotes` is missing.
- [ ] **Implement.** Props:
  ```ts
  type Props = {
    opened: boolean;
    booking: Booking;
    timezone: string;
    isPending: boolean;
    onConfirm: () => void;
    onClose: () => void;
  };
  ```
  Body is a Stack with the event-type/guest line, the formatted start time, an optional Notes line (only when `guestNotes`), and a yellow Alert with the "guest is not notified" copy. Footer has Keep booking (subtle) + Cancel booking (red, `loading={isPending}`). Set `closeOnClickOutside={!isPending}`, `closeOnEscape={!isPending}`, and `aria-describedby` pointing at the summary stack and the warning alert.
- [ ] Tests pass.
- [ ] Commit: `Add CancelBookingModal`.

---

## Task 4 — `<BookingsPage />`

The list page. Mirrors [`EventTypesPage.tsx`](../../../frontend/src/features/admin/EventTypesPage.tsx) shape: pending → error → empty/table, modal coordinated via a discriminated-union `useState`.

**Files:** create [`frontend/src/features/admin/BookingsPage.tsx`](../../../frontend/src/features/admin/BookingsPage.tsx) + [`frontend/src/test/BookingsPage.test.tsx`](../../../frontend/src/test/BookingsPage.test.tsx).

- [ ] **Test first.** Cases:
  1. Renders 4 rows from the GET response in the order returned (no client-side sort).
  2. Renders `durationMinutesSnapshot`, guest email, and a truncated notes preview.
  3. Empty state: `[]` from GET → "No upcoming bookings yet" + a CTA `<a>` to `/admin/event-types`.
  4. ErrorState renders on a non-401 list-load failure.
  5. Click a row's Cancel button → modal opens with that booking's data.
  6. Confirm cancel (deferred mock) → row disappears optimistically before the DELETE resolves; modal closes once the mutation resolves.
  7. 500 cancel: row reappears (rollback), modal closes (toast carries the feedback).
  8. 404 cancel: treated as a benign race — gray "Already cancelled" toast, modal closes.
- [ ] **Implement.** State machine:
  ```tsx
  const listQ = useAdminBookings();
  const settingsQ = useAdminSettings();
  const cancelM = useCancelBooking();
  const [confirm, setConfirm] = useState<{ kind: 'closed' } | { kind: 'open'; booking: Booking }>(...);

  if (listQ.isPending || settingsQ.isPending) return <SkeletonRows />;
  if (listQ.isError) return <ErrorState ... />;

  const timezone = settingsQ.data?.timezone ?? 'UTC';   // defensive fallback
  ```
  Table columns (in order): **When** (`formatFullHuman(startTime, timezone)`), **Event type** (`eventTypeName`), **Duration** (`{durationMinutesSnapshot} min`), **Guest** (name over email in a `Stack gap={0}`), **Notes** (truncated preview wrapped in a Mantine `Tooltip` with `disabled={!truncated}` + `events={{ hover, focus, touch }}`; `aria-label={fullNotes}` on the focusable Text; em-dash for empty), and an action cell with a `<Button color="red" variant="subtle" size="xs" aria-label={\`Cancel ${eventTypeName} with ${guestName} on ${formattedStart}\`}>Cancel</Button>` per row. Empty state: a `Card withBorder p="xl"` with a Title + dimmed line + Mantine Button as `react-router` Link. Notes truncation helper: a one-line `truncate(text, n)` with `trimEnd()` before the ellipsis.
- [ ] Tests pass.
- [ ] Commit: `Add BookingsPage`.

---

## Task 5 — Wire admin layout + route

**Files:** modify [`frontend/src/components/AdminLayout.tsx`](../../../frontend/src/components/AdminLayout.tsx) + [`frontend/src/routes.tsx`](../../../frontend/src/routes.tsx).

- [ ] In `AdminLayout.tsx` add `<AdminNavLink to="/admin/bookings">Bookings</AdminNavLink>` after the existing Event types link.
- [ ] In `routes.tsx` import `BookingsPage` and add `{ path: 'bookings', element: <BookingsPage /> }` after the `event-types` line.
- [ ] Run all gates: `npm run typecheck && npm run lint && npm test && npm run build`.
- [ ] Commit: `Wire /admin/bookings into the admin shell`.

---

## Task 6 — Final pre-merge gate + frontend-review + open PR

- [ ] **Pre-merge gates** (final pass):
  ```bash
  cd contract && npm test
  cd frontend && npm run typecheck && npm run lint && npm test && npm run build
  ```
- [ ] **Walk the flow against Prism** — `npm run dev:full`, open `http://localhost:5173/admin`, sign in, click **Bookings**.
- [ ] **Run the `frontend-reviewer` subagent** before opening the PR. Address every Critical and High finding inline; address Mediums where they're cheap (a11y refinements typically are).
- [ ] **Open the PR**: `gh pr create --base main --head <branch> --title "Phase 4: admin bookings (list + cancel)"`.

---

## Self-review checklist

- [ ] Times rendered via `formatFullHuman(b.startTime, timezone)`, never `new Date(...).toLocaleString()`.
- [ ] `<TimezoneBanner>` rendered on the page.
- [ ] `durationMinutesSnapshot` (not `durationMinutes`) is the rendered field.
- [ ] No client-side filter on past bookings.
- [ ] Cancel modal copy mentions "the guest is not notified".
- [ ] `useCancelBooking` uses `retry: false`; `useAdminBookings` uses the `isHttp4xx` retry-false-on-4xx guard.
- [ ] No `react-router-dom` imports added (the codebase uses `react-router`).
- [ ] No `@opExample` regression on existing endpoints.
