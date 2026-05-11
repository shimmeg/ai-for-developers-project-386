# Phase 4 — Admin bookings (design)

**Status:** approved (2026-05-10), shipped on PR for branch `claude/unruffled-swartz-6105cb`.
**Predecessor:** Phase 3 (admin event-types CRUD) — PR #5 merged into `main` on 2026-05-10.

## Context

Phases 1–3 of the calendar-booking frontend are shipped: guests can browse the catalog and book a slot, and the owner can manage their token, working hours, and event types under `/admin`. The admin surface is missing one thing — the owner cannot see or cancel the bookings that guests have already made. Phase 4 closes that gap and completes the v1 admin surface; Phase 5 (cross-cutting polish + CI) becomes the natural next pickup once this lands.

Contract endpoints already exist in [`contract/admin.tsp`](../../../contract/admin.tsp): `GET /admin/bookings` returns `Booking[]` sorted by `startTime` ascending with past bookings excluded server-side, and `DELETE /admin/bookings/{id}` returns 204 on success / 404 on a stale id / 401 on missing-or-bad token. The `Booking` model in [`contract/models.tsp`](../../../contract/models.tsp) carries the load-bearing `durationMinutesSnapshot` field — editing an event type's live duration must not retroactively change historical bookings.

## Goals

- Owner sees all upcoming bookings in a single Mantine table at `/admin/bookings`.
- Per-row Cancel button opens a confirm modal that summarises the booking and reminds the owner that the guest is not notified by email in v1.
- Cancel is optimistic — the row disappears immediately on confirm, and rolls back if the server rejects.
- All times rendered in the owner's configured timezone via the Phase 1 `formatFullHuman` helper, with `<TimezoneBanner>` on the page.
- Frontend continues to be backend-agnostic — Prism in static mode (after the small `@opExample` contract addition) is enough to walk the UI end-to-end.

## Non-goals

- Past bookings (the contract excludes them server-side, the page does not need to surface them).
- Pagination, filtering, sorting, search.
- Guest-side cancellation (admin-only in v1).
- Email notification on cancel (deferred — surfaced in the modal copy as a known v1 caveat).
- Soft-delete UI / undo of a cancellation.
- Per-event-type analytics (booking counts, last-used).

## Decisions (settled in brainstorming)

| Question | Choice | Reason |
|---|---|---|
| Cancel confirmation UX | **Confirm modal** with the booking's start time + guest name + a destructive button + the "guest is not notified" caveat | Cancel is destructive (frees a slot, no email is sent — spec §1). One extra click is cheap; an undoable misclick is not. |
| Empty state copy | **Title + one-line guidance + CTA** that navigates to `/admin/event-types` | Mirrors Phase 3's empty-state shape exactly so the admin surface stays visually consistent. |
| Notes display | **Truncate to ~80 chars** with a Mantine `Tooltip` revealing the full text | Keeps row heights uniform; full text remains accessible (keyboard- and touch-reachable per the post-review fix). |
| Cancel mutation pattern | **Optimistic remove + rollback on error** in the hook file (not the page), same shape as Phase 3's `useToggleActiveEventType` | Matches the convention in [`api/queries/eventTypesAdmin.ts`](../../../frontend/src/api/queries/eventTypesAdmin.ts). |

## Architecture

### Routing

One new route under the existing `<AdminGate>` → `<AdminLayout>` branch:

| Path | Component | Notes |
|---|---|---|
| `/admin/bookings` | `<BookingsPage />` | Sibling of `settings` + `event-types`. Index redirect (`<Navigate to="settings" replace />`) is unchanged. |

`<AdminLayout>` gains a third nav link, "Bookings", alongside Settings and Event types.

### File layout

```
contract/admin.tsp                                 # @opExample on AdminBookings.{list, cancel}
frontend/src/
├── api/queries/
│   └── bookingsAdmin.ts                           # types, keys, useAdminBookings, useCancelBooking
├── features/admin/
│   ├── BookingsPage.tsx                           # table, modal coordination, empty state
│   └── CancelBookingModal.tsx                     # confirm modal (booking summary + destructive button)
├── components/AdminLayout.tsx                     # Bookings nav link
└── routes.tsx                                     # 'bookings' child route
```

### Hard rules from the spec / contract (don't drift)

- **Render `durationMinutesSnapshot`** from the booking record — *not* the live event-type duration ([business spec §1.2](../../../docs/business-description.md)).
- **Past bookings are not displayed** — the contract guarantees the GET returns only upcoming.
- **No guest-side cancellation in v1** — cancel is owner-only.
- **No email is sent on cancel** — surface this in the cancel-confirmation copy.
- **Times are rendered in the owner timezone**, via [`formatFullHuman`](../../../frontend/src/lib/datetime.ts) with `<TimezoneBanner>` on the page.
- **No retries on 4xx** — every Phase 4 hook uses `retry: (count, err) => isHttp4xx(err) ? false : count < 1`. The cancel mutation uses `retry: false`.

## Cancel mutation (`useCancelBooking`)

The optimistic cancel lives in the hook file alongside `useAdminBookings`. The page only reads from the cache and dispatches the mutation; the hook owns the optimistic state and rollback.

```ts
useMutation<void, HttpError, { id: string }, { previous?: Booking[] }>({
  retry: false,
  mutationFn: ({ id }) => adminClient.DELETE('/admin/bookings/{id}', { params: { path: { id } } }),
  onMutate: async ({ id }) => {
    await queryClient.cancelQueries({ queryKey: bookingsAdminKeys.all });
    const previous = queryClient.getQueryData<Booking[]>(bookingsAdminKeys.all);
    queryClient.setQueryData<Booking[]>(bookingsAdminKeys.all, previous?.filter(b => b.id !== id));
    return { previous };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.previous) queryClient.setQueryData(bookingsAdminKeys.all, ctx.previous);
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: bookingsAdminKeys.all }),
})
```

The page handles user-facing notifications (`Booking cancelled` / `Already cancelled` for 404 / `Cancel failed` for everything else) and modal close, since notification copy lives next to the calling code — same split as Phase 3's toggle.

A 404 on cancel is treated as a benign race (the row was already removed, by another tab or the server). The page surfaces a gray "Already cancelled" toast rather than a red error, since the desired end state is reached.

## Page UX

**Layout sketch:**

```
Bookings
🌐 All times shown in Europe/Moscow.

┌─────────────────────────────────┬──────────────┬──────────┬─────────────┬──────────────────┬──────────┐
│ When                            │ Event type   │ Duration │ Guest       │ Notes            │          │
├─────────────────────────────────┼──────────────┼──────────┼─────────────┼──────────────────┼──────────┤
│ Tue, 12 May 2026 at 10:00       │ Intro call   │ 30 min   │ Jane Doe    │ Looking forward. │ [Cancel] │
│                                 │              │          │ jane@…      │                  │          │
│ Wed, 13 May 2026 at 14:00       │ Deep dive    │ 60 min   │ Carlos R.   │ —                │ [Cancel] │
│                                 │              │          │ carlos@…    │                  │          │
└─────────────────────────────────┴──────────────┴──────────┴─────────────┴──────────────────┴──────────┘
```

**Loading**: 3 skeleton rows (matches `<EventTypesPage>`).
**Error (non-401)**: existing `<ErrorState />` with Retry; reuses the shared component.
**Empty**: card placeholder with "No upcoming bookings yet" + a "Share a link from Event types" hint + a CTA button to `/admin/event-types`.
**Settings unavailable**: defensively fall back to UTC for time rendering so the page still works (settings is normally already cached after the AdminGate's first probe).

## Confirm modal (`<CancelBookingModal />`)

Pure presentational — receives `isPending`, `onConfirm`, `onClose` from the page. Body is the event-type name + guest name, the formatted start time, an optional Notes line (only when `guestNotes` is set), and a yellow Alert with the "guest is not notified" copy. Footer has a subtle **Keep booking** button and a destructive red **Cancel booking** button (with `loading={isPending}`).

`closeOnClickOutside={!isPending}` and `closeOnEscape={!isPending}` so the modal cannot be dismissed mid-mutation. Sets `aria-describedby` pointing at the booking-summary stack and the warning alert so opening the modal announces the load-bearing context for the destructive decision (Mantine wires `aria-labelledby` automatically).

## Accessibility

- **Per-row Cancel buttons** carry an `aria-label` of the form `Cancel <event type> with <guest> on <formatted start>` so screen-reader users can distinguish them without leaving the row.
- **Truncated notes** are keyboard- and touch-reachable: the wrapped `Text` has `tabIndex={0}` when truncated, an `aria-label` carrying the full notes, and the Tooltip is configured with `events={{ hover, focus, touch }}`.
- **Cancel modal** has `aria-describedby` pointing at the body summary + warning alert.

## Contract addition (small)

Add `@opExample` to `AdminBookings.{list, cancel}`:

- `list` returns 4 bookings spanning the same `intro-call` / `deep-dive` / `office-hours` slugs Phases 1 and 3 already seed, with mixed start times, mixed durations, one without `guestNotes` (exercises the optional-field path), and one with notes longer than 80 chars (exercises the truncate + tooltip path).
- `cancel` returns a 204 with no body.

Without these decorators, the page renders against an empty array.

## Testing

Smoke tests in [`frontend/src/test/`](../../../frontend/src/test/) — mocked `adminClient` at module boundary, mirrors the Phase 3 page test:

**`bookingsAdmin.test.tsx` — hook tests (5):**
1. `useAdminBookings` returns the list when GET succeeds.
2. `useAdminBookings` throws `HttpError` and does not retry on a 401.
3. `useCancelBooking` removes the row optimistically before the DELETE resolves.
4. `useCancelBooking` rolls the row back when the DELETE returns 500.
5. `useCancelBooking` invalidates `bookingsAdminKeys.all` on success.

**`CancelBookingModal.test.tsx` — modal tests (6):**
1. Renders the booking summary (event type, guest name, start time).
2. Surfaces the "guest is not notified" caveat.
3. `Cancel booking` button calls `onConfirm`.
4. `Keep booking` button calls `onClose` without calling `onConfirm`.
5. `loading` spinner shows on the destructive button while `isPending`.
6. Notes preview is omitted when `guestNotes` is missing.

**`BookingsPage.test.tsx` — page tests (8):**
1. Renders the rows from the GET response.
2. Renders `durationMinutesSnapshot`, guest email, and a truncated notes preview.
3. Empty state with CTA linking to `/admin/event-types`.
4. ErrorState renders on a non-401 list-load failure.
5. Cancel button opens the modal with the booking summary.
6. Confirm cancel removes the row optimistically and closes the modal on a 204.
7. 500 rolls the row back and closes the modal (toast carries the feedback).
8. 404 is treated as a benign race ("Already cancelled" toast).

## Risk register

| Risk | Mitigation |
|---|---|
| Optimistic remove vs. concurrent server changes (Prism doesn't have this; a real backend might). | The mutation's `onError` rolls the cache back; `onSettled` re-syncs. A 404 is treated as a benign race. |
| Settings query erroring while bookings succeeds. | Page falls back to UTC for rendering so the cancel flow still works. |
| Long notes dominating the table. | Truncated to 80 chars + Tooltip on hover/focus/touch with full content in `aria-label` for AT. |
| `<AdminLayout>` nav links growing crowded as Phase 5 lands. | Three links is fine; we'll review if Phase 5 adds more. |
