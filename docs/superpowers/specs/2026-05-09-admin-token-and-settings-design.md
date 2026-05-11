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

| Path              | Component                                   | Notes                                                                                        |
| ----------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/admin`          | `<Navigate to="/admin/settings" replace />` | Phase 2 has only one admin page; the redirect keeps `/admin` always-meaningful as more land. |
| `/admin/settings` | `<SettingsPage />`                          | Sole admin route in this phase.                                                              |

The admin subtree is wrapped by `<AdminGate>` (auth, outermost) → `<AdminLayout>` (chrome) → `<Outlet />`. Putting the gate outermost means the admin chrome is never visible behind the unauthenticated modal: when no token is stored, the user sees a centered token-entry screen, not the admin shell with an overlay.

`/admin/*` is a **sibling** of the existing guest routes in `routes.tsx`, not a child of the existing `<Layout>`. The guest layout's "Calendar / Guest booking" header must never appear around an admin page. Concretely, the router will have two top-level branches:

```tsx
createBrowserRouter([
  {
    element: <Layout />,
    children: [
      /* guest routes */
    ],
  },
  {
    path: "/admin",
    element: <AdminGate />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="settings" replace /> },
          { path: "settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
```

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
│   ├── timezones.ts               # Intl.supportedValuesOf("timeZone"), inject-current helper
│   └── httpError.ts               # HttpError class for retry/error-classification
└── api/queries/
    └── settings.ts                # useAdminSettings, useUpdateAdminSettings
```

The existing `<NotFoundPage />` already covers the `*` catch-all, so we do not duplicate that route inside the admin branch — unmatched paths under `/admin/...` fall through to the top-level `*` handler.

## Token storage & gate

### `lib/adminToken.ts`

Pure module backed by `localStorage`. Two storage keys:

- `calendar.adminToken` — the token string itself (or absent when signed out).
- `calendar.adminTokenRejectedAt` — a millisecond timestamp written when the token is cleared with `reason: 'rejected'`, omitted otherwise. Persisting this flag is what makes the "your token was rejected" hint reliable across tabs (Codex finding 7): the storage event in another tab can read this key as well as the token key.

```ts
export function getAdminToken(): string | null;
export function setAdminToken(token: string): void; // also clears rejectedAt
export function clearAdminToken(opts?: {
  reason?: "rejected" | "signed-out";
}): void;
export function getRejectedAt(): number | null;
```

A module-level `subscribers: Set<() => void>` is notified on every `set`/`clear`, plus on the browser `storage` event (so multi-tab logout / cross-tab rejection both propagate). This is the contract for `useSyncExternalStore`.

### `lib/useAdminToken.ts`

```ts
export function useAdminToken(): string | null;
```

Implemented with `useSyncExternalStore(subscribe, getAdminToken, () => null)`. **Hook callers only** — React components (`<AdminGate>`, the modal, the sign-out button). Non-React contexts (the `adminClient` middleware, the modal's raw-fetch validation) call `getAdminToken()` directly: hooks cannot run inside fetch middleware. The pure store + hook split is exactly to make both kinds of access possible without duplicated state.

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

On submit, the modal validates the candidate token _before_ writing it to storage, so the gate doesn't flip mid-validation:

1. **Lock submissions while in flight.** The submit handler tracks a local `submitting` boolean; the button is disabled and additional Enter-key submits are no-ops while `submitting` is true. Combined with React's batching this guarantees only one validation request can be active at a time, eliminating the out-of-order-resolve race (Codex finding 4).
2. Call `GET /admin/settings` directly (raw `fetch` against `${env.apiBaseUrl}/admin/settings`, with `X-Admin-Token: <candidate>` in the headers). Bypassing the configured `adminClient` for this one call is what avoids the race — the candidate token never goes through the middleware.
3. On the result:
   - **200:** call `setAdminToken(candidate)` (which also clears `rejectedAt`), and seed the React Query cache via `queryClient.setQueryData(settingsKeys.all, json)` so the settings page lands with no second GET. `<AdminGate>` re-renders with a token → `<Outlet />` takes over.
   - **401:** do not store the token. Set local component state `error: 'rejected'` → inline alert "That token was rejected. Please try again." Token field is cleared and re-focused.
   - **Network error:** do not store the token. `error: 'network'` → inline alert "Couldn't reach the server. Please try again."

On mount, the modal reads `getRejectedAt()` — if non-null, it starts with the `'rejected'` inline error pre-populated. This handles the mid-session-401 case (token rotated server-side; a query refetch fails; middleware clears + flags; gate re-renders the modal). The flag is cleared the first time the user successfully signs in.

## Admin API client

### `api/adminClient.ts`

A second `openapi-fetch` client, separate from the public `apiClient`:

```ts
const adminClient = createClient<paths>({ baseUrl: env.apiBaseUrl });

adminClient.use({
  async onRequest({ request }) {
    const token = getAdminToken();
    if (token) {
      request.headers.set("X-Admin-Token", token);
      // Stash the token used so onResponse can compare on 401.
      (request as Request & { __sentToken?: string }).__sentToken = token;
    }
    return request;
  },
  async onResponse({ request, response }) {
    if (response.status === 401) {
      const sent = (request as Request & { __sentToken?: string }).__sentToken;
      const current = getAdminToken();
      // Only clear if the 401 was for the *currently stored* token.
      // Otherwise this is a stale in-flight response from a token the user
      // already replaced — ignoring it preserves the new valid token.
      if (sent && sent === current) clearAdminToken({ reason: "rejected" });
    }
    return response;
  },
});
```

The `sent === current` guard fixes Codex finding 2 (late 401 stomping on a newly valid token). Stale 401s are dropped on the floor; the new token's own queries succeed normally.

Two reasons for keeping `adminClient` separate from `apiClient`:

1. Guest pages can't accidentally send the admin header.
2. The 401-handling middleware is admin-only — guest pages have their own error flows.

`clearAdminToken({ reason: 'rejected' })` notifies subscribers, `<AdminGate>` re-renders, modal returns. End of cycle.

### Retry policy

The shared `queryClient` defaults to `retry: 1`. For admin queries we override per-hook to **disable retries on 4xx** so a 401 doesn't trigger a duplicate request after the token was just cleared (Codex finding 6). Concretely:

```ts
useQuery({
  queryKey: settingsKeys.all,
  queryFn: ...,
  retry: (failureCount, err) => {
    if (err instanceof HttpError && err.status >= 400 && err.status < 500) return false;
    return failureCount < 1;
  },
});
```

(`HttpError` is a small class the admin query/mutation hooks throw to carry status — analogous to the existing `BookingError` in `bookings.ts`.)

### `api/queries/settings.ts`

```ts
export const settingsKeys = {
  all: ["admin", "settings"] as const,
};

export function useAdminSettings() {
  /* GET /admin/settings */
}
export function useUpdateAdminSettings() {
  // PUT /admin/settings, invalidates settingsKeys.all on success
}
```

Both wrap `adminClient.GET` / `adminClient.PUT` and unwrap `{ data, error }` exactly the same way the existing public hooks do.

## Admin layout (`<AdminLayout>`)

Mantine `AppShell` mirroring the guest `Layout`, with admin-specific chrome:

- **Header brand:** "Calendar (admin)" — visually distinct so the owner knows which surface they're on.
- **Header nav:** in Phase 2, only a single `Settings` link. Event types / Bookings nav links are deliberately omitted — they'd route to unfinished pages and confuse the user (Codex finding 10). Phases 3 and 4 will add them.
- **Header actions:** small "Sign out" text button (right-aligned). On click: `clearAdminToken({ reason: 'signed-out' })` → `navigate('/')`. The `'signed-out'` reason ensures `rejectedAt` is _not_ set — re-entry won't show the rejection message.

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
- **Working hours rows:** one row per day, Mon → Sun (matches the contract property order). `Switch` for open/closed; two `TimeInput`s for `start` and `end` always visible. When the row is closed both inputs are `disabled` and visually display an em-dash placeholder (`—`) instead of any previous value, so a closed row never shows misleading old hours (Codex finding 11). Toggling open restores the inputs to their last open values (or sensible defaults like `09:00` / `18:00` if the row has never been open in this form).
- **Form library:** `@mantine/form` + Zod via the existing `mantine-form-zod-resolver`'s `zod4Resolver`.
- **Submit / Reset:** Save is disabled when `form.isDirty()` is false. Reset re-applies the last-fetched server snapshot.

### Zod schema (`features/admin/settings-schema.ts`)

```ts
const SUPPORTED_TIMEZONES = new Set<string>(Intl.supportedValuesOf("timeZone"));

const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");

const ClosedDay = z.object({ status: z.literal("closed") }).strict();
const OpenDay = z
  .object({ status: z.literal("open"), start: Hhmm, end: Hhmm })
  .strict()
  .refine((d) => d.end > d.start, {
    message: "End must be after start",
    path: ["end"],
  });

const WorkingDay = z.discriminatedUnion("status", [ClosedDay, OpenDay]);

export const SettingsFormSchema = z.object({
  timezone: z
    .string()
    .min(1, "Timezone is required")
    .refine(
      (v) => SUPPORTED_TIMEZONES.has(v),
      "Pick a recognised IANA timezone",
    ),
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

Two changes vs. the v1 sketch (Codex findings 3 and 5):

- `timezone` is validated against the runtime `Intl.supportedValuesOf('timeZone')` list, mirroring the contract's "valid IANA name" rule client-side.
- Both `ClosedDay` and `OpenDay` are `.strict()`, so any `start`/`end` left over from a closed→open→closed toggle are caught by Zod (and stripped by the submit normalizer below) before they ever reach the wire.

Lexicographic `end > start` works because `HH:MM` strings sort identically to clock time when both are zero-padded (the regex enforces zero-padding).

### Submit normalizer

Form values are not directly compatible with the contract: a row toggled open → closed may still hold its old `start`/`end` in `@mantine/form`'s state. Before PUT, we map each day:

```ts
function normalize(values: SettingsFormValues): components['schemas']['OwnerSettings'] {
  const days = Object.fromEntries(
    Object.entries(values.workingHours).map(([day, v]) =>
      v.status === 'closed' ? [day, { status: 'closed' }] : [day, v],
    ),
  );
  return { timezone: values.timezone, workingHours: days as ... };
}
```

This addresses Codex finding 3 — the wire payload is always `{ status: 'closed' }` for closed days, never `{ status: 'closed', start: '09:00', end: '18:00' }`.

### Submit flow

1. Form values already match `OwnerSettings` shape — no transformation needed; PUT directly.
2. **200:** `queryClient.invalidateQueries({ queryKey: settingsKeys.all })`, Mantine `notifications.show({ color: 'green', title: 'Settings saved.' })`. The form re-syncs to the new server response so `isDirty` resets.
3. **400:** top-level `Alert` with the `Error.message` from the response. Field-level mapping is intentionally deferred — Zod prevents the foreseeable client-side mistakes.
4. **401:** the `adminClient` response middleware already cleared the token with `reason: 'rejected'`; `<AdminGate>` re-renders, sees no token, and shows the modal. Because `<AdminGate>` is the outermost wrapper of the admin subtree, the settings page unmounts. **Unsaved form state is lost** — the user re-enters their token and starts editing again. Acceptable for v1 (token rotation is rare); preserving unsaved edits across re-auth would require lifting form state to a stable parent and is deferred to a later phase.

### Loading & error states

- **Initial load:** Mantine `Skeleton` placeholder with the right structural shape (timezone row + 7 day rows).
- **Initial load error (non-401):** the existing `<ErrorState />` component with a Retry button.
- **401 on initial load:** caught by the middleware → modal returns; nothing more to do at the page level.

## Contract addition (small)

Two `@opExample` decorators on `AdminSettings.get` and `AdminSettings.update` in `contract/admin.tsp`, reusing the existing `OwnerSettings` schema-level example. Without them, Prism's static mode returns nulls for `/admin/settings`, so the working-hours form has nothing to populate. After this change, the page is fully usable against Prism with a placeholder token.

(`@example` on the `OwnerSettings` model already exists from Phase 1 — this just propagates it to the admin operations.)

## Testing strategy

Smoke tests in `frontend/src/test/` (Vitest + RTL, mocking the admin client at the module boundary, same shape as the existing `catalog.test.tsx`):

1. **`AdminGate`:** modal is rendered when no token; outlet is rendered once a token is set.
2. **Modal happy path:** submit → mocked 200 → modal closes, child renders, query cache seeded.
3. **Modal rejects bad token:** submit → mocked 401 → token _not_ stored, inline error visible.
4. **Modal: persisted token on reload** — token in `localStorage` at mount → `<AdminGate>` skips the modal entirely.
5. **Modal: duplicate-submit lock** — fast double-click of Sign in → only one fetch fires; second click is a no-op while the first is pending.
6. **Settings page renders fetched data:** timezone + 7 rows match the mocked response.
7. **Settings page submit:** dirty the form → click Save → mutation called with the _normalized_ payload (closed days lack `start`/`end`) → success notification.
8. **Settings page Zod validation:** `end < start` blocks submission with field-level error.
9. **Settings page 400 PUT:** mocked 400 with `Error.message` → top-level `Alert` shows the message; query cache is unchanged; form values intact.
10. **Settings page non-401 load error:** mocked 500 → `<ErrorState />` with Retry; clicking Retry re-runs the query.
11. **Mid-session 401:** mocked 401 from `useAdminSettings` refetch → modal returns with the "rejected" inline message.
12. **Late 401 after re-auth:** stored token A; an in-flight request returns 401 with `__sentToken === A`, but storage is now token B → middleware does _not_ clear the token; the `<AdminGate>` does not flap.
13. **Cross-tab storage sync:** simulate a `storage` event with `calendar.adminToken` cleared → `useAdminToken` re-renders consumers as null; `<AdminGate>` flips to the modal.
14. **Sign out:** click Sign out in `<AdminLayout>` → token cleared with reason `'signed-out'`, navigation to `/`; modal that re-mounts on a future admin visit does _not_ show the "rejected" inline message.

Manual verification: `npm run dev:full` → `/admin/settings` → enter any non-empty token → form populates from contract examples → toggle a day, change a time, Save → success → Sign out → modal returns on next visit.

Pre-merge gate: typecheck, lint, all Vitest tests, build all green; existing Phase 1 tests untouched.

## Risk register

| Risk                                                                              | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`X-Admin-Token` in `localStorage` is exfiltratable via XSS.**                   | Accepted v1 trade-off (Codex finding 1). The frontend already has a strict policy of no `dangerouslySetInnerHTML` and no third-party-origin script tags; we'll codify this in a short security note in `frontend/README.md`. Long-term, when a real backend lands we can move to an `HttpOnly` cookie at the cost of a CSRF strategy — out of scope for v1 against Prism. The token is also coarse-grained (whole admin namespace), so the blast radius is bounded by the contract. |
| Mantine v9 polymorphic `component={Link}` typing pain (hit in Phase 1).           | We already wrap manually around `Title`/`Button` where polymorphism breaks. Use the same pattern in the admin shell.                                                                                                                                                                                                                                                                                                                                                                |
| `Intl.supportedValuesOf('timeZone')` availability.                                | Supported in all browsers we target (Chrome 99+, Safari 15.4+, Firefox 93+ — all ≥ 2022). No fallback list. If runtime support is missing we surface a clear console error rather than silently degrading.                                                                                                                                                                                                                                                                          |
| Mid-session 401 losing unsaved settings edits.                                    | Documented limitation; deferred to Phase 5.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Prism not honouring `@opExample` for admin endpoints.                             | Validated in Phase 1 that schema-level `@example` works; `@opExample` produces operation-level `examples` which Prism prefers. We'll verify against the running mock as part of the test pass.                                                                                                                                                                                                                                                                                      |
| Late 401 from a request sent with a previously stored token clears the new token. | `onResponse` middleware compares the request's `__sentToken` to the currently stored token before clearing (Codex finding 2).                                                                                                                                                                                                                                                                                                                                                       |
| Cross-tab "rejected" message reliability.                                         | `rejectedAt` is persisted to `localStorage`; the `storage` event triggers re-renders in other tabs which then read `getRejectedAt()` (Codex finding 7).                                                                                                                                                                                                                                                                                                                             |
