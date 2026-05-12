### Hexlet tests and linter status:

[![Actions Status](https://github.com/shimmeg/ai-for-developers-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/shimmeg/ai-for-developers-project-386/actions)

# Calendar Service

A simple Calendly-style booking service built as a Hexlet learning project. A single, pre-defined calendar owner publishes the event types they offer; anonymous guests pick a type and book a free slot in the next 14 days. No accounts, no logins, no email — v1 is deliberately the smallest useful slice.

> **Status:** v1 is in active development. Behaviour spec, API contract, React/TypeScript frontend, and a Go backend with in-memory storage are in place. Persistence (PostgreSQL + GORM) follows in a future iteration.

## Security — do not deploy this version publicly

v1 has **no real authentication**. The owner-only `/admin/*` endpoints are protected by a single shared `X-Admin-Token` configured per-deployment, and the frontend stores that token in `localStorage`. There is no per-user account model, no password rotation, no rate limiting, and no email verification of guest bookings. This is an explicit non-goal for the learning slice and is documented in [`docs/business-description.md`](docs/business-description.md) §5.

**Do not deploy this version on the public internet.** Run it locally or behind a private network only. Real authentication, CSRF protection, and account management land in a future version.

## Repository structure

| Path                                                           | Purpose                                                                                                                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/business-description.md`](docs/business-description.md) | Authoritative description of the v1 behaviour: roles, entities, flows, slot rules, non-goals, verification scenarios.                                                                    |
| [`contract/`](contract)                                        | TypeSpec API contract that compiles to OpenAPI 3.1. Source of truth for the HTTP API shared between frontend and backend.                                                                |
| [`frontend/`](frontend)                                        | Vite + React + TypeScript + Mantine app. Consumes only the contract; talks to a Prism mock locally. See [`frontend/README.md`](frontend/README.md) for setup, scripts, and walkthroughs. |
| [`backend/`](backend)                                          | Go + Gin HTTP service. Implements the contract end-to-end; v1 uses in-memory storage. See [`backend/README.md`](backend/README.md).                                                      |

A database directory will be added in a future phase, alongside a PostgreSQL/GORM swap-in for the backend.

## Running the project locally

Prerequisites: **Go 1.23+** and **Node 22+**.

You can run the frontend against the **Prism mock** (no backend required, useful for FE-only work) or against the **real Go backend** (end-to-end behaviour, real auth, real conflict checks).

### One-time setup

```bash
( cd contract && npm ci && npm run build )            # build the OpenAPI YAML
( cd backend  && cp .env.example .env )               # then edit backend/.env and set
                                                       #   ADMIN_TOKEN=$(openssl rand -hex 24)
( cd frontend && npm ci && npm run gen:api )          # install deps + regenerate types
```

### Option A — frontend + Prism mock

```bash
cd frontend && npm run dev:full       # contract watcher + Prism on :4010 + Vite on :5173
```

The Prism mock returns the contract's example bodies for every operation and accepts any `X-Admin-Token`. Useful for working on the UI without touching the backend.

### Option B — frontend + Go backend

One command, in one terminal:

```bash
cd frontend && npm run dev:full:backend
# contract watcher + Go backend on :3000 + Vite on :5173 (under `concurrently`)
```

…or split across two terminals if you prefer separate log streams:

```bash
# Terminal 1
cd backend  && make run                       # :3000 (auto-loads backend/.env)

# Terminal 2
cd frontend && npm run dev                    # :5173
```

The backend auto-loads `backend/.env` on startup (process env vars win on conflict), so you do not need to export `ADMIN_TOKEN` manually as long as `.env` carries it.

Point the frontend at the backend with `frontend/.env.local`:

```bash
echo "VITE_API_BASE_URL=http://localhost:3000" > frontend/.env.local
```

Open <http://localhost:5173>. The admin token modal asks for the value of `ADMIN_TOKEN` from `backend/.env`. Full walkthroughs (guest happy path, admin flows, automated checks) live in [`frontend/README.md`](frontend/README.md) and the §7 verification scenarios in [`docs/business-description.md`](docs/business-description.md).

### Smoke checks once the backend is up

```bash
# Public catalog — should return your event types in the configured timezone.
curl -s http://localhost:3000/event-types | jq

# Admin auth — without token must be 401; with the right token, 200.
curl -i http://localhost:3000/admin/settings
curl -i -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:3000/admin/settings
```

## Working with the API contract

The HTTP contract is written in [TypeSpec](https://typespec.io) and compiles to `openapi.yaml`. The generated file is git-ignored — regenerate it locally on demand.

```bash
cd contract
npm install        # one-time
npm run build      # → tsp-output/@typespec/openapi3/openapi.yaml
npm run watch      # rebuild on change
npm run format     # tsp format **/*.tsp
```

Open the generated `tsp-output/@typespec/openapi3/openapi.yaml` in any OpenAPI viewer (Swagger UI, Redoc, Stoplight) to browse endpoints and schemas.
