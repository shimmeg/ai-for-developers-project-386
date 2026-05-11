# Frontend Roadmap

What's left after the [v1 vertical slice](README.md). Phases are independently shippable; each lands its own PR. Tasks are concrete enough to start without re-planning, but each phase still gets a brief brainstorming pass for open UX questions before implementation.

## Status

| Phase | Scope                                                                      | State                                 |
| ----- | -------------------------------------------------------------------------- | ------------------------------------- |
| 1     | Foundations + guest happy path (catalog → slot picker → confirm → success) | ✅ Shipped                            |
| 2     | Admin token + settings                                                     | ✅ Shipped (PR #4, merged 2026-05-10) |
| 3     | Admin event-type CRUD                                                      | ✅ Shipped (PR #5, merged 2026-05-10) |
| 4     | Admin bookings (list + cancel)                                             | ✅ Shipped (PR #9, merged 2026-05-11) |
| 5     | Cross-cutting polish (code-split, a11y, tests, CI)                         | 🟡 Next                               |
| 6     | Real backend integration                                                   | ⬜                                    |

---

## Conventions established in Phases 1-3

Read this section first if you're starting a new phase cold. These are the patterns to mirror — drift from them only with a deliberate reason.

### Architecture

- **Two `openapi-fetch` clients**: [`apiClient`](src/api/client.ts) for the public surface, [`adminClient`](src/api/adminClient.ts) for `/admin/*`. The admin client injects `X-Admin-Token` from [`lib/adminToken.ts`](src/lib/adminToken.ts) and clears storage on a 401 _only when the sent token still matches the stored one_ (prevents a late stale 401 from stomping a fresh valid token). Never put admin endpoints on `apiClient` or vice versa.
- **Admin auth is route-level**: `<AdminGate>` (in [`components/AdminGate.tsx`](src/components/AdminGate.tsx)) is the outermost wrapper of `/admin/*`. It renders [`AdminTokenModal`](src/features/admin/AdminTokenModal.tsx) when no token is stored, otherwise the outlet. New admin pages don't add any per-page auth — they just live under that branch in [`routes.tsx`](src/routes.tsx).
- **Admin chrome**: add new admin pages under `<AdminLayout>` ([`components/AdminLayout.tsx`](src/components/AdminLayout.tsx)) and add a `<AdminNavLink>` for the page in the header `Group`. Phase 4's "Bookings" link sits next to the existing Settings / Event types links.
- **Sibling routing**: `/admin/*` is a top-level branch in [`routes.tsx`](src/routes.tsx), _not_ nested inside the guest `<Layout>` — the guest "Calendar / Guest booking" header must never appear around an admin page.

### TanStack Query hooks

- **One file per query group** under [`api/queries/`](src/api/queries). Each file exports a `*Keys` object, the typed hooks, and (for admin) re-exports the relevant contract types from `components['schemas']`.
- **`HttpError` carrier**: every admin hook throws [`HttpError`](src/lib/httpError.ts) on a non-2xx (`new HttpError(response.status, error.code, error.message)`). Don't `throw error` from openapi-fetch directly — the status is the load-bearing field for retry/rollback decisions.
- **Disable retries on 4xx**: every admin hook has `retry: (count, err) => isHttp4xx(err) ? false : count < 1`. Prevents a 401 (which `adminClient` already cleared the token for) from triggering a duplicate request.
- **Optimistic mutation pattern** (Phase 3's active toggle, Phase 4's cancel will use the same shape):

  ```ts
  useMutation<Result, HttpError, Vars, { previous?: T[] }>({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<T[]>(queryKey);
      queryClient.setQueryData<T[]>(queryKey /* optimistic next state */);
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
      notifications.show({ color: 'red', title: 'Failed', message: err.message });
    },
    onSuccess: () => notifications.show({ color: 'green', title: 'Done' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  ```

### TypeScript

- **Strict mode is on** ([`tsconfig.app.json`](tsconfig.app.json) `"strict": true`). New code must be null-safe.
- **`openapi-fetch` narrowing quirk**: with `strictNullChecks`, the success branch of `{ data, error, response }` makes `data` non-nullable, so `if (!data) throw …` after `if (res.error) throw …` narrows to `never`. Just `return res.data` after the error check — see Phase 2's [`api/queries/settings.ts`](src/api/queries/settings.ts) for the canonical pattern.

### Forms (`@mantine/form` + Zod)

- **Schemas mirror the contract exactly**: regex / min / max constraints come from `contract/models.tsp`. The `slug` regex in Phase 3 ([`features/admin/event-type-schema.ts`](src/features/admin/event-type-schema.ts)) and the timezone-list in Phase 2 ([`features/admin/settings-schema.ts`](src/features/admin/settings-schema.ts)) are good templates.
- **Resolver**: `zod4Resolver` from `mantine-form-zod-resolver`. Don't reach for `react-hook-form`; the codebase is consistent on Mantine's form.
- **PATCH diffing**: edit forms send only changed fields (Phase 3's [`diffEventType`](src/features/admin/event-type-schema.ts) helper). Don't send the whole record — and disable Save when `!form.isDirty()` so empty submits are unreachable.

### Contract (`@opExample`)

- Every admin endpoint that the UI consumes gets `@opExample` decorators in [`contract/admin.tsp`](../contract/admin.tsp) so Prism in static mode returns realistic data. The list endpoint should include enough variety to exercise UI states (active + inactive, empty notes vs. populated notes, etc.).
- After editing the contract, `npm run gen:api` from `frontend/` rebuilds the OpenAPI YAML and regenerates `src/api/types.ts`.

### Testing

- **Vitest + RTL + jsdom** with the polyfills already in [`src/test/setup.ts`](src/test/setup.ts) — `localStorage` (jsdom 29 + `about:blank` URL doesn't expose it), `matchMedia`, `ResizeObserver`, `document.fonts` (Mantine's `Textarea` autosize). New tests don't need to repeat these; just import-by-side-effect via the configured `setupFiles`.
- **Mock the admin client at the module boundary** for component tests, e.g.:

  ```ts
  vi.mock('../api/adminClient', () => ({
    adminClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
      PATCH: (...args: unknown[]) => patchMock(...args),
      DELETE: (...args: unknown[]) => deleteMock(...args),
    },
  }));
  ```

- **Optimistic-mutation tests need deferred mocks**, otherwise the post-mutation `onSettled` invalidate triggers a refetch that resets the row before the assertion sees the optimistic flip. See `frontend/src/test/EventTypesPage.test.tsx` — the Phase 3 page test is the canonical example.
- **Hook tests**: `renderHook` from `@testing-library/react`, wrap in a `QueryClientProvider`, prime cache via `queryClient.setQueryData(...)` if the hook needs state.

### Times

- All times are rendered in the owner's configured timezone (spec §3 first paragraph). Phase 1 helpers in [`lib/datetime.ts`](src/lib/datetime.ts):
  - `formatHourMinute(iso, timezone)` — `09:00`-style.
  - `formatFullHuman(iso, timezone)` — `Tuesday, 12 May 2026 at 09:00`-style.
  - `formatDayHeader(isoDate)` — calendar date, no instant math, used by the slot picker.
- The owner's timezone lives on `OwnerSettings.timezone` (admin) and `CatalogResponse.timezone` (public). Pull it from whichever query is closest to the page.
- `<TimezoneBanner timezone={...} />` is the consistent label component — drop it on every admin page that shows wall-clock times.

### Tools available

- **Frontend review**: invoke the `frontend-reviewer` subagent (or the `/frontend-review` slash command) before opening a PR for any non-trivial slice. The agent runs read-only, exercises the gates, and returns a severity-grouped report. Skill is at `.claude/skills/frontend-review/SKILL.md`.
- **Codex parallel review**: see how Phase 2 used it ([commit `a52a4c1`](https://github.com/shimmeg/ai-for-developers-project-386/commit/a52a4c1) and the codex-review thread in that PR's discussion). Useful as a second opinion alongside the frontend-reviewer subagent.

### Pre-merge gate

Every PR must pass:

```bash
cd contract && npm test
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
```

Phase 5 will codify this as a CI workflow.

---

## Phase 2 — Admin token + settings

**Goal:** Owner can authenticate with their `X-Admin-Token` and edit timezone + weekly working hours.

**Open UX questions to brainstorm before coding:** modal vs. dedicated `/admin/login` page for token entry; whether to expose a "logged out" indicator vs. silent re-prompt; timezone picker UX (typeahead Select vs. free text).

### Tasks

- [ ] Token capture — modal on first admin route visit, persisted in `localStorage` (key: `calendar.adminToken`), cleared on 401.
- [ ] `src/api/adminClient.ts` — separate openapi-fetch instance that injects `X-Admin-Token` from storage.
- [ ] Centralised 401 handling — TanStack Query mutation/query `onError` interceptor that clears the token and re-opens the prompt.
- [ ] Admin layout (`src/components/AdminLayout.tsx`) — AppShell with admin nav (Settings / Event types / Bookings) + "Sign out" button.
- [ ] Route guard for `/admin/*` — if no token, show prompt before rendering.
- [ ] `GET /admin/settings` query hook + `useSettings`.
- [ ] `PUT /admin/settings` mutation hook + `useUpdateSettings`.
- [ ] `/admin/settings` page:
  - Timezone picker (Mantine `Select` seeded with common IANA zones; "Other" → free text).
  - Working-hours table: 7 rows (Mon–Sun); per-row open/closed toggle; when open, two `TimeInput`s for start/end.
  - Client-side validation: `end > start` per open day; mirrors contract rule.
  - Submit → invalidate settings query; show success notification.
- [ ] Smoke tests: settings page render, token modal capture, 401 → re-prompt flow.
- [ ] Add `@example` decorators to `OwnerSettings`-related admin operations in the contract so Prism returns useful settings data. _(small contract change)_

---

## Phase 3 — Admin event-type CRUD

**Goal:** Owner can create, edit, and toggle active state on event types. (No delete — per contract.)

**Open UX questions:** create/edit as a modal vs. dedicated routes; inline toggle UI vs. detail-page toggle; how to surface 409 (slug conflict) errors.

### Tasks

- [ ] `GET /admin/event-types` query hook.
- [ ] `POST /admin/event-types` mutation hook.
- [ ] `GET /admin/event-types/{slug}` query hook.
- [ ] `PATCH /admin/event-types/{slug}` mutation hook.
- [ ] `/admin/event-types` list page:
  - Table or card grid: slug, name, durationMinutes, active flag.
  - Inline active toggle (PATCH `{ active: bool }`).
  - "Create" button → modal or `/admin/event-types/new`.
  - Empty state with CTA.
- [ ] Create form (`/admin/event-types/new` or modal):
  - Fields: slug (with pattern hint), name, description, durationMinutes.
  - Zod schema mirroring contract constraints (slug regex, duration ≥ 1).
  - 409 conflict UX: "this slug is already in use".
- [ ] Edit form (`/admin/event-types/:slug/edit` or modal):
  - Same fields plus active toggle; PATCH on submit.
  - 404 on stale slug navigation; 409 on slug rename collision.
- [ ] Smoke tests: list render, create happy path, edit + active toggle.

---

## Phase 4 — Admin bookings

**Status:** ✅ Shipped — `/admin/bookings` lists upcoming bookings in the owner's timezone with a per-row Cancel that opens a confirm modal and triggers an optimistic DELETE. Spec: [`docs/superpowers/specs/2026-05-10-admin-bookings-design.md`](../docs/superpowers/specs/2026-05-10-admin-bookings-design.md). Plan: [`docs/superpowers/plans/2026-05-10-admin-bookings.md`](../docs/superpowers/plans/2026-05-10-admin-bookings.md).

The v1 admin surface is now feature-complete; Phase 5 (polish, CI, a11y) is the natural next pickup.

### Patterns introduced (worth mirroring in future phases)

- **Modal-with-`isPending` over mount/unmount**: the cancel modal stays mounted while the DELETE is in flight, the destructive button shows a loading spinner, and `closeOnEscape` / `closeOnClickOutside` / the outer `onClose` all gate on `isPending` so the user can't accidentally dismiss mid-mutation.
- **404-as-benign-race for delete**: if the server returns 404 on a cancel, the hook's `onError` short-circuits without rolling back (the row was optimistically removed, the server agrees it's gone) and the page surfaces a gentler `"Already cancelled"` toast.
- **Aria-labelled per-row destructive button**: every row's Cancel renders with `aria-label="Cancel {eventType} with {guestName} on {date}"` so screen-reader users know which row's button they're on.
- **Tooltip-only-when-truncated for free-form text**: explicit `truncate()` at a fixed character limit; the tooltip only renders when the cell is actually clipped, and the trigger is a real interactive element (`<UnstyledButton>`) so the tooltip is keyboard-reachable.
- **`PageHeader` hoisted across loading / error / data branches** so the `<h1>` landmark stays visible regardless of query state.

### Hard rules from the spec / contract (don't drift)

- **Display `durationMinutesSnapshot`** from the booking record — _not_ the live event-type duration ([business spec §1.2](../docs/business-description.md)). Editing an event type's duration must not retroactively change historical bookings.
- **Past bookings are not displayed** in v1 (spec §2.3). The contract guarantees the GET returns only upcoming, so the page does not need to filter or hide anything client-side.
- **No guest-side cancellation** is in v1 — cancel is owner-only.
- **No email** is sent on cancel — surface this in the cancel-confirmation copy ("the guest is not notified") so the owner isn't surprised.
- **Times are rendered in the owner's configured timezone**, not the browser's, with the timezone label on every page that shows times (spec §3 first paragraph and the Phase 1 review fix). Use [`lib/datetime.ts`](src/lib/datetime.ts).

---

## Phase 5 — Cross-cutting polish

These are independent tasks; each can be its own small PR.

### Tasks

- [ ] **Code-split admin routes** — `React.lazy` + `Suspense` so the guest bundle stays small (current single bundle is ~563 KB minified).
- [ ] **Route-level error boundary** — single `ErrorBoundary` wrapping `<Outlet />` to catch render errors per route.
- [ ] **Loading skeletons** — replace spinners with Mantine `Skeleton` shapes on catalog/slot-picker for less jumpy loading.
- [ ] **Mobile responsive pass** — slot picker grid below `sm` breakpoint currently shows 2 columns; verify all admin tables/forms work below 600 px.
- [ ] **Dark mode toggle** — `useMantineColorScheme` already wired; add a header switch.
- [ ] **Accessibility audit:**
  - Focus management on route transitions.
  - Slot grid keyboard nav (arrow keys to move between slots).
  - ARIA on the day-status pills and selected-slot pressed state.
  - Run axe-core via `@axe-core/react` in dev.
- [ ] **Test coverage expansion:**
  - Confirm form: 400/404 paths and the inline conflict alert (the 409 → invalidate path is covered in Phase 2).
  - Slot picker: selection + URL persistence + `?slot=` round-trip with `+` offset.
  - Success page: render-from-cache vs. render-without-state.
  - (Optional) Playwright E2E happy path against Prism.
- [ ] **CI workflow** — `.github/workflows/frontend.yml`: install, gen:api, typecheck, lint, test, build, and `prettier --check .` on every PR.
- [ ] **Bundle analysis** — `rollup-plugin-visualizer` once to spot large deps; consider trimming Tabler icons import.
- [ ] **Add `@example` decorators on admin operations** — finish the work started in Phase 1 so Prism mocks all admin endpoints realistically.

### Follow-ups from the May 2026 code review

These came out of the independent review of Phase 1 + Phase 2 ([review prompt at `docs/...`]) and are deferred to Phase 5 since they aren't spec-blocking.

**Status (2026-05-11):** all nine follow-ups are now closed. PR-A (Phase 5 hygiene) shipped #1 (heading hierarchy) and #4 (Prettier sweep); #2, #3, #5, #6, #7, #9 quietly landed during Phase 3 / 4 cleanup; #8 was verified at [src/features/booking/ConfirmPage.tsx](src/features/booking/ConfirmPage.tsx) — the UI renders distinct copy for `status === 400` vs. the fall-through "service is unreachable" case.

- [x] **Heading hierarchy** — each route now renders a visible `<Title order={1} fz="h2">` page title (PR-A); brand marks in `Layout` / `AdminLayout` demoted to non-heading `Text`. `EmptyState` already accepts an `order` prop; callers pass `order={3}`.
- [x] **Form-input plumbing in SettingsPage** — working-hours `TimeInput`s use `form.getInputProps('workingHours.<day>.<start|end>')` at [src/features/admin/SettingsPage.tsx](src/features/admin/SettingsPage.tsx).
- [x] **Centralised `pingAdmin` helper** — `pingAdmin(token)` lives in [src/api/adminClient.ts](src/api/adminClient.ts); `AdminTokenModal` consumes it.
- [x] **Prettier hygiene** — full tree passes `prettier --check .` (PR-A).
- [x] **EmptyState `role`** — no `role="link"` remains in `src/`.
- [x] **HMR-safe storage listener** — `window.addEventListener('storage', …)` in [src/lib/adminToken.ts](src/lib/adminToken.ts) is guarded by `import.meta.hot?.dispose(...)`.
- [x] **Drop `as any`** — [src/lib/timezones.ts](src/lib/timezones.ts) uses `Intl.supportedValuesOf?.('timeZone')` directly.
- [x] **Booking failure UX** — `ConfirmPage` renders distinct copy for `bookingError.status === 400` ("Please check your details") and the fall-through ("service is unreachable").
- [x] **`react-router-dom` → `react-router` v7** — `package.json` already on `react-router@^7.15.0`; no `react-router-dom` imports remain.

---

## Phase 6 — Real backend integration

Lands when a backend implementation exists.

### Tasks

- [ ] Confirm contract still matches the live backend (run contract tests against the deployed schema).
- [ ] Per-environment `.env` support: `.env.development`, `.env.staging`, `.env.production` with appropriate `VITE_API_BASE_URL`.
- [ ] CORS / cookie behaviour review depending on backend choices.
- [ ] (Optional) Sentry or similar error reporting.
- [ ] (Optional) Web vitals reporting.

---

## Backlog / nice-to-haves

Things noticed along the way that aren't on a critical path:

- Replace `frontend/public/icons.svg` (unused Vite scaffold leftover) — delete.
- Audit `npm audit` warnings; most are dev-only via Prism's deps. Decide whether to upgrade or pin.
- Consider `@tanstack/react-query` devtools in dev only.
- Consider migrating from `react-router-dom` to the new `react-router` package (v7 unified).
- Stop committing `frontend/.env`; it duplicates `.env.example` and will tempt someone to drop secrets in there once a real backend lands.
- Decide on a logo/branding pass — currently uses the default Vite favicon.
