### Hexlet tests and linter status:

[![Actions Status](https://github.com/shimmeg/ai-for-developers-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/shimmeg/ai-for-developers-project-386/actions)

# Calendar Service

A simple Calendly-style booking service built as a Hexlet learning project. A single, pre-defined calendar owner publishes the event types they offer; anonymous guests pick a type and book a free slot in the next 14 days. No accounts, no logins, no email — v1 is deliberately the smallest useful slice.

> **Status:** v1 is in active development. Behaviour spec, API contract, and the React/TypeScript frontend (Phases 1-3) are in place; the backend will follow.

## Security — do not deploy this version publicly

v1 has **no real authentication**. The owner-only `/admin/*` endpoints are protected by a single shared `X-Admin-Token` configured per-deployment, and the frontend stores that token in `localStorage`. There is no per-user account model, no password rotation, no rate limiting, and no email verification of guest bookings. This is an explicit non-goal for the learning slice and is documented in [`docs/business-description.md`](docs/business-description.md) §5.

**Do not deploy this version on the public internet.** Run it locally or behind a private network only. Real authentication, CSRF protection, and account management land in a future version.

## Repository structure

| Path                                                           | Purpose                                                                                                                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/business-description.md`](docs/business-description.md) | Authoritative description of the v1 behaviour: roles, entities, flows, slot rules, non-goals, verification scenarios.                                                                    |
| [`contract/`](contract)                                        | TypeSpec API contract that compiles to OpenAPI 3.1. Source of truth for the HTTP API shared between frontend and backend.                                                                |
| [`frontend/`](frontend)                                        | Vite + React + TypeScript + Mantine app. Consumes only the contract; talks to a Prism mock locally. See [`frontend/README.md`](frontend/README.md) for setup, scripts, and walkthroughs. |

`backend/` and database directories will be added in a future phase.

## Running the project locally

The frontend is the only runnable component today; it ships with a Prism mock of the contract so no backend is required.

```bash
cd frontend
npm install                       # one-time
npm run gen:api                   # regenerate src/api/types.ts from the contract
npm run dev:full                  # contract watcher + Prism mock + Vite, in one process
```

Open <http://localhost:5173>. Full walkthroughs (guest happy path, admin flows, automated checks) live in [`frontend/README.md`](frontend/README.md).

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
