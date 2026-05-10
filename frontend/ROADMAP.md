# Frontend Roadmap

What's left after the [v1 vertical slice](README.md). Phases are independently shippable; each lands its own PR. Tasks are concrete enough to start without re-planning, but each phase still gets a brief brainstorming pass for open UX questions before implementation.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Foundations + guest happy path (catalog → slot picker → confirm → success) | ✅ Shipped |
| 2 | Admin token + settings | ✅ Shipped (PR #4, merged 2026-05-10) |
| 3 | Admin event-type CRUD | 🟡 In review (PR #5) |
| 4 | Admin bookings (list + cancel) | ⬜ Next |
| 5 | Cross-cutting polish (code-split, a11y, tests, CI) | ⬜ |
| 6 | Real backend integration | ⬜ |

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
- [ ] Add `@example` decorators to `OwnerSettings`-related admin operations in the contract so Prism returns useful settings data. *(small contract change)*

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

**Goal:** Owner can see upcoming bookings and cancel any of them.

**Open UX questions:** confirmation modal copy for cancel; whether to show past bookings (contract only returns upcoming, but we may want a tab); empty-state copy.

### Tasks

- [ ] `GET /admin/bookings` query hook.
- [ ] `DELETE /admin/bookings/{id}` mutation hook.
- [ ] `/admin/bookings` list page:
  - Table sorted by `startTime` ascending: date/time, event type, guest, email, notes (truncated).
  - Per-row "Cancel" button → confirm modal → DELETE → optimistic remove + invalidate.
  - Empty state.
- [ ] Smoke tests: list render, cancel happy path, 404 on stale id.

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

- [ ] **Heading hierarchy** — give each route an explicit `Title order={1}` (the page title) and adjust `EmptyState` to take an `order` prop so it doesn't insert an h4 inside an h2 region.
- [ ] **Form-input plumbing in SettingsPage** — replace the manual `value` / `onChange` / `error` triplets on the working-hours `TimeInput`s with `form.getInputProps('workingHours.<day>.<start|end>')` so per-field validation messages also appear on the `start` input.
- [ ] **Centralised `pingAdmin` helper** — move `AdminTokenModal`'s raw `fetch` call into a typed helper that knows the contract path, so the URL isn't duplicated in feature code.
- [ ] **Prettier hygiene** — run `npm run format` once across the tree to clear the 13 currently-unformatted files; pair with the CI step above.
- [ ] **EmptyState `role`** — drop the redundant `role="link"` on the catalog `Card` (it already renders an anchor via React Router's `Link`).
- [ ] **HMR-safe storage listener** — guard the `window.addEventListener('storage', …)` in `lib/adminToken.ts` with `import.meta.hot?.dispose(...)` so long Vite dev sessions don't accumulate listeners.
- [ ] **Drop `as any`** in `lib/timezones.ts` once the lib config makes `Intl.supportedValuesOf` directly typed.
- [ ] **Booking failure UX** — `BookingFailure.kind` has separate `'badRequest'` and `'other'` variants that the UI renders identically; either render distinct copy or collapse into one kind.
- [ ] **`react-router-dom` → `react-router` v7** — the unified package; cosmetic but clears a deprecation pathway.

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
