### Hexlet tests and linter status:
[![Actions Status](https://github.com/shimmeg/ai-for-developers-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/shimmeg/ai-for-developers-project-386/actions)

# Calendar Service

A simple Calendly-style booking service built as a Hexlet learning project. A single, pre-defined calendar owner publishes the event types they offer; anonymous guests pick a type and book a free slot in the next 14 days. No accounts, no logins, no email — v1 is deliberately the smallest useful slice.

> **Status:** v1 is in early development. Behaviour spec and API contract are in place; frontend and backend implementations will follow.

## Security

This v1 has **no real authentication**. The owner is identified solely by knowledge of a deployment-configured admin token sent in the `X-Admin-Token` HTTP header; anyone who knows the token can read or change owner data. **Do not deploy this version on the public internet without first adding real authentication.**

## Repository structure

| Path | Purpose |
|---|---|
| [`docs/business-description.md`](docs/business-description.md) | Authoritative description of the v1 behaviour: roles, entities, flows, slot rules, non-goals, verification scenarios. |
| [`contract/`](contract) | TypeSpec API contract that compiles to OpenAPI 3.1. Source of truth for the HTTP API shared between frontend and backend. |

`frontend/`, `backend/`, and database directories will be added as v1 is implemented.

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
