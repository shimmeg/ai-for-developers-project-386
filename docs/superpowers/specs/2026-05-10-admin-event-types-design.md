# Phase 3 — Admin event-types CRUD (design)

**Status:** approved (2026-05-10), in review on PR #5.
**Branch:** `claude/admin-event-types`.
**Predecessor:** Phase 2 (admin token + `/admin/settings`) — PR #4 merged into `main` on 2026-05-10.

## Context

Phase 2 wired up the admin token flow and the settings form. The owner can now log in, but they can only manage their working hours — the catalog of event types is whatever Prism (or eventually a real backend) seeded. Phase 3 introduces the ability to **create, edit, and toggle the active state of event types** from `/admin/event-types`, matching the behaviour described in the v1 [business spec §2.2](../../../docs/business-description.md). There is no delete operation, by design.

The slice is intentionally narrow: list + create + edit + active toggle on a single route, no bulk actions, no sort/filter/search, no pagination. It reuses every Phase 2 admin primitive (`adminClient`, `<AdminGate>`, `<AdminLayout>`, the per-hook 4xx-no-retry policy, `mantine-form-zod-resolver`) so the surface added is the page itself + the modal + a small contract-example addition.

## Goals

- Owner sees all event types — both active and inactive — in display order, with slug, name, duration, and an active toggle.
- Owner can create a new event type via a single modal on the same page; the new row appears once the server confirms.
- Owner can edit any field of an existing event type via the same modal pre-filled. Editing duration does not affect existing bookings (the contract's `durationMinutesSnapshot` carries booked durations); the form does not need to mention this — it Just Works server-side.
- Owner can toggle the active flag with a single switch click; the change is optimistic and rolls back on failure.
- All validation rules come from the contract (`EventTypeSlug` regex, `DurationMinutes >= 1`); the server stays authoritative but Zod blocks the foreseeable client-side mistakes.
- Frontend continues to be backend-agnostic. After the small contract addition, Prism in static mode is enough to walk the UI end-to-end.

## Non-goals

- Delete of event types (spec §2.2 explicitly forbids in v1).
- Bulk actions (multi-select toggle / archive).
- Sorting / filtering / pagination on the list.
- Search.
- Drag-to-reorder.
- Soft confirmation on slug rename (we ship a one-line help text but no modal).
- Per-event-type analytics (booking counts, last-used, etc.). Phase 4 surfaces bookings.
- Code-splitting / lazy admin bundle (still a Phase 5 polish item).

## Architecture

### Routes

One new route, sibling to `/admin/settings` under the existing admin gate + layout:

| Path | Component | Notes |
|---|---|---|
| `/admin/event-types` | `<EventTypesPage />` | List + modal-driven create/edit + inline active toggle. |

`<AdminLayout>` gains a second nav link, "Event types", alongside "Settings".

The router diff is one line in `routes.tsx`:

```tsx
{ path: 'event-types', element: <EventTypesPage /> },
```

### File layout

```
frontend/src/
├── api/queries/
│   └── eventTypesAdmin.ts          # useAdminEventTypes (GET list)
│                                   # useCreateEventType (POST)
│                                   # useUpdateEventType (PATCH)
└── features/admin/
    ├── EventTypesPage.tsx          # list page; owns modal open/mode state
    ├── EventTypeFormModal.tsx      # create + edit, single component
    └── event-type-schema.ts        # Zod schema mirroring the contract
```

### Reused from Phase 2

- `api/adminClient.ts` — already injects `X-Admin-Token`, already clears storage with `reason: 'rejected'` on 401 *only when the sent token still matches storage*.
- `lib/httpError.ts` — `HttpError` carrier; new admin hooks throw it the same way `useAdminSettings` does.
- `components/AdminGate.tsx`, `components/AdminLayout.tsx` — chrome and the route-level auth gate.
- `lib/queryClient.ts` — global defaults; the new hooks override `retry` to disable retries on 4xx.
- `mantine-form-zod-resolver`'s `zod4Resolver` — same form library and resolver used by `<SettingsPage>`.

## List page (`<EventTypesPage />`)

### Layout sketch

```
Event types                                     [+ New event type]
All event types — active and inactive. Toggle a row to publish or hide it from the public catalog.

┌─────────────┬───────────────┬──────────┬─────────┬───────────┐
│ Slug        │ Name          │ Duration │ Active  │           │
├─────────────┼───────────────┼──────────┼─────────┼───────────┤
│ intro-call  │ Intro call    │ 30 min   │  [● on] │ [Edit]    │
│ deep-dive   │ Deep dive     │ 60 min   │  [● on] │ [Edit]    │
│ office-hrs  │ Office hours  │ 15 min   │  [○ off]│ [Edit]    │
└─────────────┴───────────────┴──────────┴─────────┴───────────┘
```

### Components

- Mantine `Table` with five columns: slug (monospace `<Code>`), name, duration (`<n> min`), active (`<Switch>` per row), edit action (`<Button variant="subtle" size="xs">`).
- Active `Switch` is label-free with `aria-label="Toggle active"` per row.
- "+ New event type" header button on the page (right-aligned).
- Page intro paragraph (one line) explains the toggle's effect.
- **Loading**: 3 skeleton rows (matches `<SettingsPage>`).
- **Error (non-401)**: existing `<ErrorState />` with Retry; reuses the shared component.
- **Empty**: a card-shaped placeholder with "No event types yet" and the same "+ New event type" CTA when `data.length === 0`.

### Sort / display order

As returned by the server (the contract says "in display order" — server is authoritative).

### Active toggle behaviour (spec §2.2 "single click")

- Clicking the row's `Switch` immediately fires `useUpdateEventType.mutate({ slug, body: { active: nextValue } })`.
- **Optimistic update** — the local list is patched via `queryClient.setQueryData` so the row flips before the server replies.
- **Notification** — Mantine `notifications.show` with `color: 'green'` + `"<Name> is now active"` or `color: 'gray'` + `"<Name> is now hidden from the catalog"` on success (5 s auto-dismiss).
- **Rollback** — on mutation error, `queryClient.setQueryData` restores the previous state; a red toast surfaces `error.message`.
- **No confirmation modal**, per spec. Reversibility is built-in (toggle back) and the toast acknowledges what just happened.

## Form modal (`<EventTypeFormModal />`)

A single component used for both Create and Edit; mode is implied by props.

### Props

```ts
type Props =
  | { opened: boolean; onClose: () => void; mode: 'create' }
  | { opened: boolean; onClose: () => void; mode: 'edit'; eventType: EventType };
```

### Modal chrome

- Mantine `Modal`, medium size, `centered`, title "New event type" / `"Edit ${name}"`.
- `closeOnEscape: true` and `closeOnClickOutside: !form.isDirty()` — accidental dismissals never lose unsaved edits, but the empty form can be closed casually.

### Fields

| Field | Input | Validation (Zod, mirrors contract) |
|---|---|---|
| `slug` | `TextInput`, monospace, `minLength={1}`, `maxLength={64}` | `^[a-z0-9]+(-[a-z0-9]+)*$`. Edit mode shows a one-line help: "Changing the slug breaks any links you've shared." |
| `name` | `TextInput`, required | trim, `min(1)`, `max(120)` |
| `description` | `Textarea` (autosize, ≥3 rows), required | trim, `min(1)`, `max(2000)` |
| `durationMinutes` | `NumberInput`, `min={1}`, `max={60 * 24}`, default 30 in create mode | `int().min(1).max(60 * 24)` |

`active` is **not** in the form. Create defaults true server-side (`EventTypeCreate` has no `active` field). Toggling active is a row-level action, not a modal-level field — keeps the modal focused on the editable shape and makes the toggle one click instead of "open modal → flip switch → save".

### Zod schema (`features/admin/event-type-schema.ts`)

```ts
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
```

### Submit

- **Create** → `useCreateEventType.mutate(values)`.
- **Edit** → `useUpdateEventType.mutate({ slug: original, body: <only the fields that changed> })`. Diffing against the initial values keeps the PATCH minimal. (The Save button is disabled while `form.isDirty()` is false, so a no-op submit is unreachable.)
- On success → invalidate the list query; close the modal; green toast `"<Name> created"` / `"<Name> updated"`.

### Error handling inside the modal

- **409 on create** → inline error on the `slug` field: `"This slug is already in use. Pick a different one."` Modal stays open, values intact.
- **409 on edit (slug rename collision)** → same inline `slug`-field error.
- **400 BadRequest** → top-level `Alert` inside the modal with `Error.message`; covers anything Zod didn't catch.
- **404 on edit** → top-level Alert "This event type no longer exists" + a Close button that re-fetches the list. (Effectively unreachable in v1 since there is no delete, but the contract surfaces 404 and we honour it.)
- **401** → handled centrally by `adminClient` middleware (clear token, gate flips, modal returns). No special path here; the form state is lost — same caveat as in Phase 2.
- **Network / other** → top-level Alert with the message.

Submit button is disabled while `mutation.isPending` and shows the `loading` spinner.

## Query/mutation hooks (`api/queries/eventTypesAdmin.ts`)

```ts
export const eventTypesAdminKeys = {
  all: ['admin', 'event-types'] as const,
};

export function useAdminEventTypes(): UseQueryResult<EventType[], HttpError> {
  // GET /admin/event-types via adminClient. retry: false on 4xx.
}

export function useCreateEventType(): UseMutationResult<EventType, HttpError, EventTypeCreate> {
  // POST /admin/event-types. On success: invalidate eventTypesAdminKeys.all.
}

export function useUpdateEventType(): UseMutationResult<
  EventType,
  HttpError,
  { slug: string; body: EventTypeUpdate }
> {
  // PATCH /admin/event-types/{slug}. On success: invalidate.
  // Optimistic update wired in the list page (not in the hook) so it can
  // hold the rollback state next to the row component.
}
```

All three throw `HttpError` on a non-2xx and disable retries on 4xx, matching the Phase 2 pattern.

## Contract addition (small)

Add `@opExample` decorators on `AdminEventTypes.{list, create, get, update}` so Prism returns realistic mock data:

- `list` returns the same 3 event types Phase 1 already seeded for the public catalog (`intro-call`, `deep-dive`, `office-hours`), plus `active: true`. Plus one inactive example so the toggle has something to flip both directions.
- `create` returns the same payload echoed back with a generated `slug` (Prism doesn't actually create state).
- `get` returns the canonical `intro-call` example.
- `update` returns the input echoed back.

Same shape we used in Phase 1 (`PublicEventType` / `CatalogResponse`) and Phase 2 (`AdminSettings`). Without these, the page populates from null fields against Prism.

## Testing

Smoke tests in `frontend/src/test/` (mocked `adminClient` at module boundary, mirrors `settings-page.test.tsx`):

1. **List renders** — mocked GET returns 3 rows; the table shows them with the right slug/name/duration/switch state.
2. **Empty state** — mocked GET returns `[]`; placeholder + CTA visible.
3. **Toggle active (optimistic happy path)** — click switch; row flips immediately; PATCH body is `{ active: false }`; green toast.
4. **Toggle active (rollback on error)** — mocked PATCH 500; switch flips, then flips back; red toast visible.
5. **Create happy path** — open modal, fill, submit; mocked POST 201; modal closes; new row in the table.
6. **Create — 409 conflict** — mocked POST 409; inline `slug`-field error; modal stays open with values intact.
7. **Edit happy path** — Edit a row, change name + duration, submit; mocked PATCH receives only the changed fields; modal closes.
8. **Edit — slug collision** — change slug to one that mocked PATCH 409s on; inline `slug`-field error; modal stays open.
9. **Zod validation — slug regex** — type `Bad Slug!`; field-level error; no PATCH/POST fires.

**Schema unit tests** in `event-type-schema.test.ts`:

- Accepts the canonical example.
- Rejects empty / spaced / uppercase slugs.
- Rejects 0 / negative / non-integer / >24h duration.
- Rejects empty name / empty description.

**Manual verification** (after implementation):

`npm run dev:full` → sign in → `/admin/event-types`:

1. See the 3 mocked event types from the contract examples.
2. Toggle the `office-hours` row off → row flips and toast appears; reload → state persists (Prism returns whatever it returns; this proves only the wire format).
3. Click "+ New event type" with `slug: intro-call` → 409 inline error.
4. Click again with a fresh slug → success toast and new row.
5. Edit a row, change just the name → DevTools confirms the PATCH body has only `{ name: '…' }`.

Pre-merge gates: typecheck, lint, all Vitest tests, build all green; existing Phase 1/2 tests untouched.

## Risk register

| Risk | Mitigation |
|---|---|
| Optimistic toggle vs concurrent server changes (Prism doesn't have this; a real backend might). | The mutation's `onError` rolls the cache back; `onSuccess` re-syncs from the server response. The list query also gets invalidated on every mutation success so any drift is fixed by the next refetch. |
| Slug rename breaking shared public URLs. | Inline help text in edit mode; spec accepts this as v1 behaviour. |
| Form-state lost on mid-session 401. | Same as Phase 2 caveat; deferred to a later phase. |
| `AdminLayout` nav links growing crowded as Phase 4 lands. | Two nav links is fine; we'll review the chrome when Phase 4 adds Bookings. |
