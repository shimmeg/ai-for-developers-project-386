# Phase 2 — Admin token + settings (design)

**Status:** approved (2026-05-09), ready for implementation plan.
**Branch:** `claude/admin-token-settings`.
**Predecessor:** Phase 1 (guest happy path) shipped on `main`.

## Context

The Calendar Service [TypeSpec contract](../../../contract/) splits the API into a public catalog (no auth) and an admin namespace gated by an `X-Admin-Token` header. Phase 1 implemented every guest-facing route; the admin side is currently unbuilt. Phase 2 introduces just enough scaffolding for the owner to:

1. Authenticate to the admin namespace with a deployment-configured token.
2. View and edit their **timezone** and **weekly working hours** (`OwnerSettings` in the contract).

Admin event-types and bookings are deliberately deferred to Phases 3 and 4 ([frontend/ROADMAP.md](../../../frontend/ROADMAP.md)). This spec is intentionally narrow so the auth plumbing and one form land together as a small, reviewable unit.

## Goals

- Owner can navigate to `/admin/*`, get prompted for their token, and reach the admin shell.
- Owner can read and update `OwnerSettings` (timezone + 7-day working hours).
- A 401 response anywhere in the admin subtree clears the stored token and re-prompts inline; no silent failures.
- Frontend continues to be backend-agnostic — the only surface added is the `X-Admin-Token` header on admin requests, and Prism in static mode is enough to walk the UI end-to-end.

## Non-goals

- Admin event-types CRUD (Phase 3).
- Admin bookings list / cancel (Phase 4).
- Code-splitting / lazy admin bundle (Phase 5 polish).
- Per-field server-side validation mapping for 400s (top-level alert is enough; client-side Zod blocks the foreseeable cases).
- Token rotation UI ("change my token") — the next 401 forces a fresh prompt; that's the rotation flow.
- Multi-user admin or RBAC — explicitly out of v1 per the business spec.
- Persisting unsaved form state across reloads.

## Architecture

### Routes

| Path | Component | Notes |
|---|---|---|
| `/admin` | `<Navigate to="/admin/settings" replace />` | Phase 2 has only one admin page; the redirect keeps `/admin` always-meaningful as more land. |
| `/admin/settings` | `<SettingsPage />` | Sole admin route in this phase. |

The admin subtree is wrapped by `<AdminGate>` (auth, outermost) → `<AdminLayout>` (chrome) → `<Outlet />`. Putting the gate outermost means the admin chrome is never visible behind the unauthenticated modal: when no token is stored, the user sees a centered token-entry screen, not the admin shell with an overlay.

### File layout (new in Phase 2)

```
frontend/src/
├── api/
│   └── adminClient.ts             # openapi-fetch instance with X-Admin-Token middleware
├── components/
│   ├── AdminLayout.tsx            # AppShell with admin header + nav + Sign out
│   └── AdminGate.tsx              # gates the admin subtree on token presence
├── features/admin/
│   ├── AdminTokenModal.tsx        # blocking modal for token entry
│   ├── SettingsPage.tsx           # the form
│   └── settings-schema.ts         # Zod schema for OwnerSettings
├── lib/
│   ├── adminToken.ts              # localStorage-backed token store (pure functions)
│   ├── useAdminToken.ts           # useSyncExternalStore hook
│   └── timezones.ts               # Intl.supportedValuesOf("timeZone") + fallback
└── api/queries/
    └── settings.ts                # useAdminSettings, useUpdateAdminSettings
```

`routes.tsx` gains a child route group under the existing root layout pattern, with `<AdminLayout>` providing the admin chrome and `<AdminGate>` as the gate.

## Token storage & gate

### `lib/adminToken.ts`

Pure module with three functions backed by `localStorage` under key `calendar.adminToken`:

```ts
export function getAdminToken(): string | null
export function setAdminToken(token: string): void
export function clearAdminToken(): void
```

A module-level `subscribers: Set<() => void>` is notified on `set`/`clear`, plus on `storage` events (so multi-tab logout works). This is the contract for `useSyncExternalStore`.

A separate boolean flag `wasRejected: boolean` (also broadcast through `subscribers`) is set to `true` inside `clearAdminToken({ reason: 'rejected' })` and reset to `false` inside `setAdminToken(...)`. The modal reads it to decide whether to start with an inline "rejected" message or a clean state.

### `lib/useAdminToken.ts`

```ts
export function useAdminToken(): string | null
```

Implemented with `useSyncExternalStore(subscribe, getAdminToken, () => null)`. All consumers (`<AdminGate>`, the modal, the admin client middleware, the sign-out button) read through this hook so any state change re-renders everything that depends on it.

### `<AdminGate />`

```tsx
export function AdminGate() {
  const token = useAdminToken();
  if (!token) return <AdminTokenModal />;
  return <Outlet />;
}
```

That's the entire gate. The modal is the only thing rendered when no token is present; once a token is set, the outlet renders and child routes proceed.

## Token modal

### `<AdminTokenModal />`

Mantine `Modal`:
- `opened={true}` permanently while rendered (the gate decides whether to render it at all)
- `withCloseButton={false}`, `closeOnEscape={false}`, `closeOnClickOutside={false}` — admin must enter a token or navigate away
- A small "Back to public catalog" link in the modal body navigates to `/`

Form: a single `PasswordInput` labelled "Admin token", required, plus a `Sign in` submit button.

On submit, the modal validates the candidate token *before* writing it to storage, so the gate doesn't flip mid-validation:

1. Call `GET /admin/settings` directly (raw `fetch` against `${env.apiBaseUrl}/admin/settings`, with `X-Admin-Token: <candidate>` in the headers). Bypassing the configured `adminClient` for this one call is what avoids the race — the candidate token never goes through the middleware.
2. On the result:
   - **200:** call `setAdminToken(candidate)` (which also clears `wasRejected`), and seed the React Query cache via `queryClient.setQueryData(settingsKeys.all, json)` so the settings page lands with no second GET. `<AdminGate>` re-renders with a token → `<Outlet />` takes over.
   - **401:** do not store the token. Set local component state `error: 'rejected'` → inline alert "That token was rejected. Please try again." Token field is cleared and re-focused.
   - **Network error:** do not store the token. `error: 'network'` → inline alert "Couldn't reach the server. Please try again."

On mount, the modal reads `wasRejected` — if `true`, it starts with the `'rejected'` inline error pre-populated. This handles the mid-session-401 case (token rotated server-side; a query refetch fails; middleware clears + flags; gate re-renders the modal).

## Admin API client

### `api/adminClient.ts`

A second `openapi-fetch` client, separate from the public `apiClient`:

```ts
const adminClient = createClient<paths>({ baseUrl: env.apiBaseUrl });

adminClient.use({
  onRequest({ request }) {
    const token = getAdminToken();
    if (token) request.headers.set('X-Admin-Token', token);
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401) clearAdminToken({ reason: 'rejected' });
    return response;
  },
});
```

Two reasons for keeping it separate from `apiClient`:
1. Guest pages can't accidentally send the admin header.
2. The 401-handling middleware is admin-only — guest pages have their own error flows.

`clearAdminToken()` notifies subscribers, `<AdminGate>` re-renders, modal returns. End of cycle.

### `api/queries/settings.ts`

```ts
export const settingsKeys = {
  all: ['admin', 'settings'] as const,
};

export function useAdminSettings() { /* GET /admin/settings */ }
export function useUpdateAdminSettings() {
  // PUT /admin/settings, invalidates settingsKeys.all on success
}
```

Both wrap `adminClient.GET` / `adminClient.PUT` and unwrap `{ data, error }` exactly the same way the existing public hooks do.

## Settings page UX

### Layout

```
Settings

[Timezone — Select (searchable)            ▾]

Working hours
┌───────────┬──────────┬──────────┬──────────┐
│ Monday    │ ●Open    │ [09:00]  │ [18:00]  │
│ Tuesday   │ ●Open    │ [09:00]  │ [18:00]  │
│ Wednesday │ ●Open    │ [09:00]  │ [18:00]  │
│ Thursday  │ ●Open    │ [09:00]  │ [18:00]  │
│ Friday    │ ●Open    │ [09:00]  │ [17:00]  │
│ Saturday  │ ○Closed  │   —      │    —     │
│ Sunday    │ ○Closed  │   —      │    —     │
└───────────┴──────────┴──────────┴──────────┘

[Reset]                          [Save changes]
```

### Components

- **Timezone field:** Mantine `Select` with `searchable`. Data is `Intl.supportedValuesOf('timeZone')` — typically ~400+ entries, runtime-supplied, no hard-coded list. If the API returns a zone not in that list (rare but possible), `lib/timezones.ts` injects it so the Select keeps it selectable.
- **Working hours rows:** one row per day, Mon → Sun (matches the contract property order). `Switch` for open/closed; two `TimeInput`s for `start` and `end` that are visible-but-disabled when the row is closed (no layout shift on toggle).
- **Form library:** `@mantine/form` + Zod via the existing `mantine-form-zod-resolver`'s `zod4Resolver`.
- **Submit / Reset:** Save is disabled when `form.isDirty()` is false. Reset re-applies the last-fetched server snapshot.

### Zod schema (`features/admin/settings-schema.ts`)

```ts
const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

const ClosedDay = z.object({ status: z.literal('closed') });
const OpenDay = z
  .object({ status: z.literal('open'), start: Hhmm, end: Hhmm })
  .refine((d) => d.end > d.start, { message: 'End must be after start', path: ['end'] });

const WorkingDay = z.discriminatedUnion('status', [ClosedDay, OpenDay]);

export const SettingsFormSchema = z.object({
  timezone: z.string().min(1, 'Timezone is required'),
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
```

The schema mirrors the contract exactly. Lexicographic `end > start` works because `HH:MM` strings sort identically to clock time when both are zero-padded (the regex enforces zero-padding).

### Submit flow

1. Form values already match `OwnerSettings` shape — no transformation needed; PUT directly.
2. **200:** `queryClient.invalidateQueries({ queryKey: settingsKeys.all })`, Mantine `notifications.show({ color: 'green', title: 'Settings saved.' })`. The form re-syncs to the new server response so `isDirty` resets.
3. **400:** top-level `Alert` with the `Error.message` from the response. Field-level mapping is intentionally deferred — Zod prevents the foreseeable client-side mistakes.
4. **401:** the `adminClient` response middleware already cleared the token with `reason: 'rejected'`; `<AdminGate>` re-renders, sees no token, and shows the modal. Because `<AdminGate>` is the outermost wrapper of the admin subtree, the settings page unmounts. **Unsaved form state is lost** — the user re-enters their token and starts editing again. Acceptable for v1 (token rotation is rare); preserving unsaved edits across re-auth would require lifting form state to a stable parent and is deferred to a later phase.

### Loading & error states

- **Initial load:** Mantine `Skeleton` placeholder with the right structural shape (timezone row + 7 day rows).
- **Initial load error (non-401):** the existing `<ErrorState />` component with a Retry button.
- **401 on initial load:** caught by the middleware → modal returns; nothing more to do at the page level.

## Sign out

Small text button in the admin header (`<AdminLayout>`):

```tsx
<Button variant="subtle" size="xs" onClick={() => { clearAdminToken(); navigate('/'); }}>
  Sign out
</Button>
```

Nothing fancier — clearing storage and navigating to the public catalog is enough.

## Contract addition (small)

Two `@opExample` decorators on `AdminSettings.get` and `AdminSettings.update` in `contract/admin.tsp`, reusing the existing `OwnerSettings` schema-level example. Without them, Prism's static mode returns nulls for `/admin/settings`, so the working-hours form has nothing to populate. After this change, the page is fully usable against Prism with a placeholder token.

(`@example` on the `OwnerSettings` model already exists from Phase 1 — this just propagates it to the admin operations.)

## Testing strategy

Smoke tests in `frontend/src/test/` (Vitest + RTL, mocking the admin client at the module boundary, same shape as the existing `catalog.test.tsx`):

1. **`AdminGate`:** modal is rendered when no token; outlet is rendered once a token is set.
2. **Modal happy path:** submit → mocked 200 → modal closes, child renders.
3. **Modal rejects bad token:** submit → mocked 401 → token cleared, inline error visible.
4. **Settings page renders fetched data:** timezone + 7 rows match the mocked response.
5. **Settings page submit:** dirty the form → click Save → mutation called with correct payload → success notification.
6. **Settings page Zod validation:** `end < start` blocks submission with field-level error.
7. **Mid-session 401:** mocked 401 from `useAdminSettings` refetch → modal returns with the rejected message.

Manual verification: `npm run dev:full` → `/admin/settings` → enter any non-empty token → form populates from contract examples → toggle a day, change a time, Save → success → Sign out → modal returns on next visit.

Pre-merge gate: typecheck, lint, all Vitest tests, build all green; existing Phase 1 tests untouched.

## Risk register

| Risk | Mitigation |
|---|---|
| Mantine v9 polymorphic `component={Link}` typing pain (hit in Phase 1). | We already wrap manually around `Title`/`Button` where polymorphism breaks. Use the same pattern in the admin shell. |
| `Intl.supportedValuesOf('timeZone')` availability. | Supported in all browsers we target (Chrome 99+, Safari 15.4+, Firefox 93+ — all ≥ 2022). No fallback list. If runtime support is missing we surface a clear console error rather than silently degrading. |
| Mid-session 401 losing unsaved settings edits. | Documented limitation; deferred to Phase 5. |
| Prism not honouring `@opExample` for admin endpoints. | Validated in Phase 1 that schema-level `@example` works; `@opExample` produces operation-level `examples` which Prism prefers. We'll verify against the running mock as part of the test pass. |
