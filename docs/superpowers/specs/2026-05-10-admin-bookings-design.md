# Phase 4 — Admin bookings (list + cancel) (design)

**Status:** approved (2026-05-10).
**Branch:** `claude/confident-yonath-e7ad7f`.
**Predecessor:** Phase 3 (admin event-type CRUD) — PR #5 merged into `main` on 2026-05-10.

## Context

Phases 2 and 3 brought the owner sign-in flow and event-type CRUD. The owner can now manage their working hours and the catalog of event types — but they still cannot see who has booked them. Phase 4 closes the v1 admin loop: a single page at `/admin/bookings` lists every upcoming booking across every event type and lets the owner **cancel** any one of them. Cancelling immediately frees the slot for new bookings; the guest is not notified (v1 has no email — see [business spec §5](../../../docs/business-description.md)). After Phase 4, the v1 admin surface is feature-complete; Phase 5 (polish, a11y, CI) is the natural next pickup.

The slice is intentionally narrow: list + cancel on a single route. No filters, no search, no pagination, no bulk actions, no past-bookings view. It reuses every Phase 2/3 admin primitive (`adminClient`, `<AdminGate>`, `<AdminLayout>`, the per-hook 4xx-no-retry policy, the optimistic-mutation shape from `useToggleActiveEventType`) so the surface added is the page itself + a confirm modal + a small contract-example addition.

## Goals

- Owner sees all upcoming bookings, sorted by `startTime` ascending, in a table with: date/time (in the configured timezone), event-type name, duration, guest name, guest email, and notes.
- Owner can click **Cancel** on any row to open a confirm modal. Confirming triggers an optimistic remove + DELETE; the row disappears immediately. On error, the row reappears + a red toast surfaces the message.
- The owner is reminded in the modal that **no email is sent** to the guest on cancel.
- All times are rendered in the **owner's configured timezone**, with a `<TimezoneBanner>` at the top of the page (per [business spec §3](../../../docs/business-description.md)).
- The displayed duration is **`durationMinutesSnapshot`** from each booking — never the live event-type duration ([business spec §1.2](../../../docs/business-description.md)).
- Frontend stays backend-agnostic. After the small contract addition, Prism in static mode is enough to walk the UI end-to-end.

## Non-goals

- **Past-bookings view.** Spec §2.3 explicitly defers this; the contract's GET excludes them server-side.
- **Filters / search / sort UI.** Server returns ascending `startTime`; we render that order.
- **Pagination.** Not in v1; the contract returns the full list.
- **Per-event-type grouping or tabs.** A single flat table.
- **Bulk cancel.** Per-row cancel only.
- **Reschedule.** Spec §5 explicit non-goal — owner can only cancel; the guest re-books out-of-band.
- **Guest-side cancel.** Spec §5 explicit non-goal.
- **Cancellation reason / undo / audit log.** Defer until a later phase if requested.
- **Code-splitting / lazy admin bundle.** Still a Phase 5 polish item.

## Architecture

### Routes

One new route, sibling to `/admin/settings` and `/admin/event-types` under the existing admin gate + layout:

| Path | Component | Notes |
|---|---|---|
| `/admin/bookings` | `<BookingsPage />` | List + per-row Cancel button + confirm modal. |

`<AdminLayout>` gains a third nav link, "Bookings", alongside "Settings" and "Event types".

The router diff is one line in `routes.tsx`:

```tsx
{ path: 'bookings', element: <BookingsPage /> },
```

### File layout

```
frontend/src/
├── api/queries/
│   └── bookingsAdmin.ts           # useAdminBookings (GET list)
│                                  # useCancelBooking (DELETE, optimistic)
└── features/admin/
    ├── BookingsPage.tsx           # list page; owns modal open/target state
    └── CancelBookingModal.tsx     # confirm modal; receives booking + onConfirm
```

### Reused from Phases 1–3

- `api/adminClient.ts` — `X-Admin-Token` injection + 401 cleanup (Phase 2).
- `api/queries/settings.ts` — `useAdminSettings()` to source the owner's `timezone` (Phase 2; cached after the first admin visit).
- `lib/httpError.ts` — `HttpError` carrier and `toHttpError` (Phase 2/3).
- `lib/datetime.ts` — `formatFullHuman(iso, tz)` for the table's date/time column; `formatHourMinute(iso, tz)` for the modal subtitle (Phase 1).
- `components/AdminGate.tsx`, `components/AdminLayout.tsx`, `components/ErrorState.tsx`, `components/EmptyState.tsx`, `components/TimezoneBanner.tsx` — chrome and shared UI atoms.
- `lib/queryClient.ts` — global defaults; the new hooks override `retry` to disable retries on 4xx.

## List page (`<BookingsPage />`)

### Layout sketch

```
Bookings                                                        [↻]
All upcoming bookings across every event type, sorted by start time.

🌐 All times shown in Europe/Moscow.

┌────────────────────────────────────┬─────────────┬────────┬─────────────┬────────────────────┬───────────┬──────────┐
│ When                               │ Event type  │ Length │ Guest       │ Email              │ Notes     │          │
├────────────────────────────────────┼─────────────┼────────┼─────────────┼────────────────────┼───────────┼──────────┤
│ Tuesday, 12 May 2026 at 10:00      │ Intro call  │ 30 min │ Jane Doe    │ jane@example.com   │ Looking…* │ [Cancel] │
│ Wednesday, 13 May 2026 at 14:00    │ Deep dive   │ 60 min │ Sam Patel   │ sam@example.com    │ —         │ [Cancel] │
│ Friday, 15 May 2026 at 09:30       │ Office hrs  │ 15 min │ Mei Chen    │ mei@example.com    │ Quick q*  │ [Cancel] │
└────────────────────────────────────┴─────────────┴────────┴─────────────┴────────────────────┴───────────┴──────────┘

* Notes truncate with a tooltip on hover.
```

### Components

- Page title `<Title order={1}>Bookings</Title>` (a11y: each route owns its h1; matches the post-review heading rule from [`frontend/ROADMAP.md:266-267`](../../../frontend/ROADMAP.md)).
- Sub-line `<Text c="dimmed" size="sm">All upcoming bookings across every event type, sorted by start time.</Text>`.
- `<TimezoneBanner timezone={settings.timezone} />` immediately under the title block.
- Mantine `Table` with seven columns: `When`, `Event type`, `Length`, `Guest`, `Email`, `Notes`, `<empty header for the action column>`.
- Per-row Cancel as `<Button variant="subtle" color="red" size="xs">Cancel</Button>`.
- **Loading**: 4 skeleton rows + a header skeleton (mirrors `<EventTypesPage>`).
- **Error (non-401)**: existing `<ErrorState />` with Retry; reuses the shared component.
- **Empty**: card-shaped placeholder with `<EmptyState>` ("No upcoming bookings", "Share an event-type link to start receiving bookings.") + a subtle CTA button linking to `/admin/event-types`.

### Times

- The "When" column uses `formatFullHuman(booking.startTime, owner.timezone)` so it reads `"Tuesday, 12 May 2026 at 10:00"`.
- Source the timezone from `useAdminSettings()`. If settings is still loading, render the same skeleton state as the bookings list (avoid mounting the table without a timezone — would otherwise cause a brief render in browser-local time).
- Show `<TimezoneBanner timezone={settings.timezone} />` once settings resolves.

### Notes display

- The contract's `guestNotes` is optional. Render `—` (em-dash) when absent.
- When present, render the **first line** truncated to ~60 chars (`Text lineClamp={1}` plus inline `style={{ maxWidth: 240 }}` so the tooltip-trigger is always the same width). Hovering the cell opens a Mantine `<Tooltip>` (or `<Popover>` if needed for multi-line text) with the **full** notes.
- Tooltip is keyboard-accessible (Mantine's `Tooltip` opens on focus by default; we keep that behaviour).

### Cancel flow

1. Owner clicks Cancel → opens `<CancelBookingModal booking={...} onConfirm={...} onClose={...} />`.
2. Modal shows `formatFullHuman(booking.startTime, tz)` + the event-type name + the guest's name and email + a **destructive** "Cancel booking" button + a "Keep" button.
3. Modal body includes the warning copy: *"This frees the slot for new bookings. The guest will not be notified by email."*
4. On confirm:
   - Modal closes immediately.
   - `useCancelBooking.mutate({ id })` fires.
   - `onMutate` snapshots the list, removes the row optimistically, returns `{ previous }`.
   - On success: green toast `"Booking cancelled"`; `onSettled` invalidates the list query.
   - On error: `onError` rolls the cache back from `previous`; red toast surfaces `error.message`.

### Per-row disabled state — intentionally not implemented

- The earlier draft of this spec called for a `disabled` + `loading` indicator on the row's Cancel button driven by `cancel.isPending && cancel.variables?.id === booking.id`. That indicator is unreachable in practice: `onMutate` filters the row out of the cached list before the DELETE round-trips, so the row no longer renders by the time the mutation is "in flight".
- The user-visible signal of a successful cancel is therefore the row vanishing + the green toast; the signal of a failed cancel is the row reappearing + the red toast (rollback path). No per-row spinner is rendered.
- If a future phase changes the cancel UX so the row stays put while the DELETE is in flight (e.g., an inline confirm with a soft-delete state), the per-row disabled indicator can come back; until then it would be dead code.

## Confirm modal (`<CancelBookingModal />`)

A small focused component used only from the bookings page.

### Props

```ts
type Props = {
  opened: boolean;
  booking: Booking;
  timezone: string;
  onConfirm: () => void;       // page handles the actual mutation call
  onClose: () => void;
};
```

The modal is a **dumb confirmation** — it does not own the mutation. The page owns it. This keeps the modal trivially testable (it has no Query context dependency) and lets the page coordinate the optimistic update + toast lifecycle.

### Modal chrome

- Mantine `Modal`, size "sm", `centered`, title `"Cancel booking"`.
- `closeOnEscape: true`, `closeOnClickOutside: true` — the modal is dismissable; the destructive action is always behind an explicit button click.
- Buttons: primary "Cancel booking" with `color="red"`, secondary "Keep" with `variant="default"`. (We use "Keep" not "Cancel" for the dismiss button to avoid the "Cancel/Cancel" double-meaning trap.)

### Content

```
┌─────────────────────────────────────────────────────────────────┐
│ Cancel booking                                            [×]   │
├─────────────────────────────────────────────────────────────────┤
│ This frees the slot for new bookings.                           │
│ The guest will not be notified by email.                        │
│                                                                 │
│ ┌────────────────────────────────────────────────┐              │
│ │ Tuesday, 12 May 2026 at 10:00                  │              │
│ │ Intro call · 30 min                            │              │
│ │ Jane Doe · jane@example.com                    │              │
│ └────────────────────────────────────────────────┘              │
│                                                                 │
│                              [ Keep ]   [ Cancel booking ]      │
└─────────────────────────────────────────────────────────────────┘
```

The summary card uses `Card withBorder p="sm"` so the booking details are visually grouped and the action buttons don't blur with the body text.

## Query/mutation hooks (`api/queries/bookingsAdmin.ts`)

```ts
export type Booking = components['schemas']['Booking'];

export const bookingsAdminKeys = {
  all: ['admin', 'bookings'] as const,
};

export function useAdminBookings(): UseQueryResult<Booking[], HttpError> {
  // GET /admin/bookings via adminClient. retry: false on 4xx.
}

export function useCancelBooking(): UseMutationResult<
  void,
  HttpError,
  { id: string },
  { previous?: Booking[] }
> {
  // DELETE /admin/bookings/{id} via adminClient. retry: false (mutation).
  // onMutate: snapshot, optimistic remove of the row matching `id`,
  //   return { previous }.
  // onError: roll cache back from `previous`.
  // onSettled: invalidate bookingsAdminKeys.all.
  // The 204 response yields `res.data === undefined` from openapi-fetch —
  // the mutation returns void; success is signaled by absence of error.
}
```

Both throw `HttpError` on non-2xx and disable retries on 4xx, matching the Phase 2/3 pattern.

### 204 / `data === undefined` quirk

`openapi-fetch` returns `{ data: undefined, error: undefined, response }` on a successful 204. Our hook treats "no error and 2xx status" as success and resolves with `void`. The `res.error` check still catches 401 and 404 (which `adminClient` and the admin-gate flow handle the usual way).

## Contract addition (small)

Add `@opExample` decorators on `AdminBookings.{list, cancel}` so Prism returns realistic mock data:

- `list` returns 4 sample bookings spanning the same `intro-call` / `deep-dive` / `office-hours` slugs already used by Phase 1/3 (so the rendered list looks coherent against Prism). Mix of populated and empty `guestNotes`. Spread across two days so the table sort order is observable.
- `cancel` returns the 204 example.

Without these, the list page populates from null fields against Prism (or from an empty array); both make the page look broken in dev.

## Testing

Tests live in `frontend/src/test/` and follow the Phase 3 pattern of mocking `adminClient` at the module boundary (mirrors [`EventTypesPage.test.tsx`](../../../frontend/src/test/EventTypesPage.test.tsx)).

### Hook tests (`bookingsAdmin.test.tsx`)

1. `useAdminBookings` resolves with the GET payload.
2. `useAdminBookings` throws `HttpError` with the right status on 401/500.
3. `useAdminBookings` does not retry on 4xx (verified by call-count after a 401).
4. `useCancelBooking` succeeds on 204 (resolves with `undefined`, list query gets invalidated).
5. `useCancelBooking` optimistically removes the row from the cached list before the DELETE resolves.
6. `useCancelBooking` rolls the cache back when the DELETE returns 500.
7. `useCancelBooking` rolls the cache back when the DELETE returns 404 (stale id).

### Modal tests (`CancelBookingModal.test.tsx`)

1. Renders the booking summary in the owner timezone (asserts the formatted "When" string is on screen).
2. Renders the warning copy ("guest will not be notified").
3. Click "Cancel booking" calls `onConfirm` exactly once.
4. Click "Keep" calls `onClose` (and not `onConfirm`).
5. Pressing Escape calls `onClose`.

### Page tests (`BookingsPage.test.tsx`)

1. **Loading** — settings & bookings both pending → skeleton rows visible.
2. **Settings error** — settings 500 → `<ErrorState>` (we cannot render times without a timezone).
3. **Bookings error** — bookings 500 → `<ErrorState>` with Retry; click Retry → re-fetches.
4. **Empty** — bookings returns `[]` → empty-state title + CTA visible.
5. **Data render** — table shows rows in the order returned by the server; the "When" cell uses the owner timezone.
6. **Notes truncation** — long-notes row shows the truncated cell and tooltip behaviour (smoke check; full Mantine tooltip behaviour is out of scope).
7. **Cancel happy path** — click Cancel → modal opens → click "Cancel booking" → row disappears immediately (optimistic) → success toast appears. (Uses the deferred-mock pattern from `EventTypesPage.test.tsx` so the optimistic state is observable before the post-`onSettled` refetch.)
8. **Cancel rollback** — DELETE returns 500 → row reappears in the table; red toast visible.
9. **Cancel — 404 stale id** — DELETE returns 404 → row reappears; red toast.

(The earlier draft listed a "Per-row disabled while pending" page test. It was dropped along with the per-row disabled state itself — see "Per-row disabled state — intentionally not implemented" above. The hook tests in `bookingsAdmin.test.tsx` cover the cancel cache mechanics.)

### Manual verification (after implementation)

`npm run dev:full` → sign in → `/admin/bookings`:

1. See the 4 mocked bookings from the contract examples, sorted by start time.
2. The `<TimezoneBanner>` at the top reads `"All times shown in Europe/Moscow"` (Prism's seeded timezone).
3. The first row's "When" cell reads `"Tuesday, 12 May 2026 at 10:00"` (or whatever date the example uses).
4. Hover the truncated notes cell → tooltip shows the full notes.
5. Click Cancel → modal opens with the booking summary + the no-email warning.
6. Click "Cancel booking" → row disappears immediately; green toast appears; refetch confirms (Prism doesn't actually delete state but the wire round-trips correctly).
7. Reload the page → the cancelled row is back (Prism is stateless). This is fine — proves only the wire format.
8. Briefly edit `contract/admin.tsp`'s cancel `@opExample` to return a 500-shaped error → reload + click Cancel → row reappears + red toast.

Pre-merge gates: contract tests; frontend typecheck, lint, all Vitest tests, build all green; existing Phase 1/2/3 tests untouched.

## Risk register

| Risk | Mitigation |
|---|---|
| Owner cancels the wrong row by mis-clicking. | Confirm modal with the booking summary surfaced + the destructive button styled red. |
| Optimistic remove desyncs from the server (e.g., the row was already cancelled by another tab). | `onSettled` always invalidates the list; the next refetch reconciles. The 404 path explicitly rolls the cache back so the row reappears with the same data. |
| Notes tooltip clipping on small screens / mobile. | Phase 5 covers the responsive pass; for now the tooltip uses Mantine's default `withinPortal` behaviour, which already escapes the table's scroll container. |
| `AdminLayout` nav links growing crowded with the third entry. | Three links is still fine. Phase 5's a11y pass can revisit chrome if it ever becomes a problem. |
| `useAdminSettings` cache miss on the bookings page (first ever admin visit lands here directly). | The query auto-fetches; the page renders skeletons until both queries resolve. No special path needed. |
| Stale `id` between page load and click (race with an external delete). | The 404 rollback above; the 204 + `onSettled` invalidate also catches the case where the row is already gone. |
| Late 401 response after the user enters a fresh token. | `adminClient.onResponse` already handles this — only clears storage when the 401 was for the currently-stored token. Phase 4 inherits this for free. |
