# Calendar Service — Frontend

Vite + React + TypeScript + Mantine. Consumes only the [TypeSpec API contract](../contract/) — no knowledge of any backend implementation. During development you can run the frontend either against a [Prism](https://stoplight.io/open-source/prism) mock of the contract's OpenAPI (fast, no backend needed) or against the real [Go backend](../backend/) (real auth, real slot-conflict behaviour).

## Stack

- Vite + React 19 + TypeScript 5
- Mantine 9 (`@mantine/core`, `@mantine/hooks`, `@mantine/form`, `@mantine/dates`, `@mantine/notifications`)
- React Router 7
- TanStack Query 5
- `openapi-typescript` + `openapi-fetch` (types and client generated from the contract)
- Zod 4 (form validation)
- Vitest + React Testing Library + jsdom

## Prerequisites

- Node 20+
- The [contract](../contract/) workspace must have its dependencies installed (`cd ../contract && npm install`).

## Setup

```bash
npm install
cp .env.example .env   # the default points at the local Prism mock
npm run gen:api        # builds the contract and regenerates src/api/types.ts
```

## Running locally

The frontend talks only to `VITE_API_BASE_URL`. There are two supported targets.

### Against the Prism mock (no backend required)

`.env.example` already points at `http://127.0.0.1:4010` (Prism). One-command dev (contract watcher + Prism + Vite, all in one process):

```bash
npm run dev:full
```

> **Note on the dev mock:** Prism returns the contract's example bodies for any `X-Admin-Token` header value — it does not enforce token validity, will not block double-booking, and ignores the configured timezone. Token-rejection and conflict paths are exercised via Vitest unit tests against a mocked client; for real auth and real slot-conflict behaviour, switch to the Go backend below.

Or run each piece separately in three terminals:

```bash
# 1) keep the contract YAML up to date
npm run contract:watch

# 2) serve the contract as a mock API
npm run mock          # Prism on http://127.0.0.1:4010

# 3) run the dev server
npm run dev           # Vite on http://localhost:5173
```

### Against the Go backend

Prerequisite: follow [`../backend/README.md`](../backend/README.md) once to copy `.env.example` to `.env` and put a real `ADMIN_TOKEN` in it.

Then point the frontend at `:3000` and use the `dev:full:backend` script that runs the contract watcher, the Go backend, and Vite together:

```bash
echo "VITE_API_BASE_URL=http://localhost:3000" > .env.local
npm run dev:full:backend
```

Or split into two terminals:

```bash
# Terminal 1 — backend on :3000
( cd ../backend && make run )

# Terminal 2 — frontend on :5173
npm run dev
```

Unlike the Prism mock, the Go backend enforces the admin token, the cross-event-type non-overlap invariant, the working-hours grid, and the 14-day window. The §7 verification scenarios in [`../docs/business-description.md`](../docs/business-description.md) all work end-to-end here.

Open [http://localhost:5173](http://localhost:5173) and walk the guest happy path:

1. **Catalog** at `/` — lists active event types from `GET /event-types`.
2. **Slot picker** at `/events/:slug` — 14-day grid from `GET /event-types/:slug/slots`. Click a slot to select it.
3. **Confirm** at `/events/:slug/confirm?slot=…` — Mantine form with Zod validation; `POST /event-types/:slug/bookings` on submit.
4. **Success** at `/events/:slug/booked/:id` — confirmation details.

### Admin flows

Visit `/admin/settings` or `/admin/event-types`. The token modal appears on first admin visit. Against the Prism mock you can type **any value** — it's not enforced (see the dev-mock note above). Against the Go backend, supply the value of `ADMIN_TOKEN` from [`../backend/.env`](../backend/.env.example).

- **Settings** (`/admin/settings`) — change timezone or working hours, Save → success notification, refresh persists (Prism replays the example body).
- **Event types** (`/admin/event-types`) — list, toggle active (optimistic update), create, edit. Slug-conflict UX is exercised when the contract returns 409.
- **Sign out** clears the stored token; the modal re-appears on the next admin route visit.

### Failure-mode behaviour worth knowing

Prism only returns example success bodies, so error paths are easiest to reach by stopping the mock and reloading:

- **Slots fetch fails** — the slot picker shows the event-type header followed by a "Couldn't load slots" alert with a Retry button (the picker grid is hidden until slots load).
- **Inactive event type (404)** — both the slot picker and the booking confirm page render a dedicated "Event type not available" message instead of a generic error.
- **Booking 409** — the confirm page shows "Slot is no longer available" with a link back to the picker; the slot cache is invalidated automatically.

Token rejection (401) and the booking-flow status branches (400/404/409/5xx) are exercised in unit tests under `src/test/`; see `AdminTokenModal.test.tsx` and `bookings-conflict.test.tsx`.

## Automated checks

```bash
npm run typecheck      # tsc -b --noEmit
npm run lint           # eslint .
npm run test           # vitest run
npm run build          # tsc -b && vite build
```

All four should pass on a clean checkout. `npm test` works without a `.env` file (the Vitest config supplies a default `VITE_API_BASE_URL`).

## Pointing at a different backend

The frontend doesn't care whether `VITE_API_BASE_URL` is Prism, the in-repo Go backend, or a deployed API. Override it with `.env.local` (Vite picks this up automatically and `.env.local` wins over `.env`):

```bash
echo "VITE_API_BASE_URL=https://calendar.example.com" > .env.local
```

…and restart Vite. Anything that conforms to the contract should work.

## Scripts

| Script             | What it does                                                                  |
| ------------------ | ----------------------------------------------------------------------------- |
| `dev`              | Run the Vite dev server.                                                      |
| `dev:full`         | Contract watcher + Prism mock + Vite together (via `concurrently`).           |
| `dev:full:backend` | Contract watcher + Go backend on :3000 + Vite (via `concurrently`).           |
| `backend`          | Run only the Go backend (`go run ./cmd/calendar-service` from `../backend/`). |
| `mock`             | Run Prism against the contract-generated OpenAPI on port 4010.                |
| `contract:build`   | Build the OpenAPI YAML from the TypeSpec contract.                            |
| `contract:watch`   | Watch and rebuild the contract on changes.                                    |
| `gen:api`          | Build the contract and regenerate `src/api/types.ts`.                         |
| `build`            | Type-check and produce a production bundle in `dist/`.                        |
| `preview`          | Serve the production build locally.                                           |
| `typecheck`        | Run `tsc -b --noEmit` against the project references.                         |
| `lint`             | Run ESLint.                                                                   |
| `format`           | Run Prettier on the workspace.                                                |
| `test`             | Run Vitest once.                                                              |

## Security note: admin token storage

The admin `X-Admin-Token` is stored in `localStorage` so the owner does not have to re-enter it on every refresh. This is acceptable in v1 because:

- The token is a single deployment-configured shared secret, not a per-user credential.
- The frontend has a strict no-`dangerouslySetInnerHTML` / no-third-party-script-tags policy, so any XSS would have to be introduced deliberately during development.

When a real backend lands the long-term plan is to switch to an `HttpOnly` cookie (with a CSRF strategy). Tracked in [`ROADMAP.md`](ROADMAP.md) under Phase 6.

## Project layout

```
src/
├── api/                  # openapi-fetch client, generated types, query/mutation hooks
├── components/           # shared building blocks (Layout, ErrorState, EmptyState, …)
├── features/             # one folder per route group (catalog, slot-picker, booking, admin)
├── lib/                  # env, queryClient, theme, datetime, timezones, adminToken,
│                         #   useAdminToken, httpError
├── test/                 # Vitest setup + smoke tests
└── main.tsx              # bootstrap: providers, router
```

The frontend is intentionally decoupled from the backend. The only edge over the boundary is `src/api/`, which depends solely on the contract.
