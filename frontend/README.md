# Calendar Service — Frontend

Vite + React + TypeScript + Mantine. Consumes only the [TypeSpec API contract](../contract/) — no knowledge of any backend implementation. During development the API is served by [Prism](https://stoplight.io/open-source/prism) mocking the contract's generated OpenAPI 3.

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

The frontend talks only to `VITE_API_BASE_URL`. By default that's `http://127.0.0.1:4010`, where Prism mocks the contract.

One-command dev (contract watcher + Prism + Vite, all in one process):

```bash
npm run dev:full
```

Or run each piece separately in three terminals:

```bash
# 1) keep the contract YAML up to date
npm run contract:watch

# 2) serve the contract as a mock API
npm run mock          # Prism on http://127.0.0.1:4010

# 3) run the dev server
npm run dev           # Vite on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) and walk the guest happy path:

1. **Catalog** at `/` — lists active event types from `GET /event-types`.
2. **Slot picker** at `/events/:slug` — 14-day grid from `GET /event-types/:slug/slots`. Click a slot to select it.
3. **Confirm** at `/events/:slug/confirm?slot=…` — Mantine form with Zod validation; `POST /event-types/:slug/bookings` on submit.
4. **Success** at `/events/:slug/booked/:id` — confirmation details.

## Pointing at a real backend

The frontend doesn't care whether `VITE_API_BASE_URL` is Prism, a real local backend, or a deployed API. To point at something else, set the variable in `.env`:

```bash
VITE_API_BASE_URL=http://localhost:8080
```

…and restart Vite. Anything that conforms to the contract should work.

## Scripts

| Script              | What it does                                                                 |
| ------------------- | ---------------------------------------------------------------------------- |
| `dev`               | Run the Vite dev server.                                                     |
| `dev:full`          | Run contract watcher + Prism mock + Vite together (via `concurrently`).      |
| `mock`              | Run Prism against the contract-generated OpenAPI on port 4010.               |
| `contract:build`    | Build the OpenAPI YAML from the TypeSpec contract.                           |
| `contract:watch`    | Watch and rebuild the contract on changes.                                   |
| `gen:api`           | Build the contract and regenerate `src/api/types.ts`.                        |
| `build`             | Type-check and produce a production bundle in `dist/`.                       |
| `preview`           | Serve the production build locally.                                          |
| `typecheck`         | Run `tsc --noEmit`.                                                          |
| `lint`              | Run ESLint.                                                                  |
| `format`            | Run Prettier on the workspace.                                               |
| `test`              | Run Vitest once.                                                             |

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
├── features/             # one folder per route group (catalog, slot-picker, booking)
├── lib/                  # env, queryClient, theme
├── test/                 # Vitest setup + smoke tests
└── main.tsx              # bootstrap: providers, router
```

The frontend is intentionally decoupled from the backend. The only edge over the boundary is `src/api/`, which depends solely on the contract.
