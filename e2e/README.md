# End-to-end tests

Browser-driven tests that exercise the full stack — the Go backend, the Vite frontend, and the React UI — using Playwright. Tests live in `tests/*.spec.ts` and run in headless Chromium.

## Prerequisites

- Go 1.23+
- Node 22+
- Generated OpenAPI + stubs:

  ```bash
  make generate          # run from the repo root
  ```

## One-time setup

```bash
make test-e2e-install
```

Installs npm deps and the Chromium browser binary. On Linux that includes system libraries via `apt-get` (sudo prompt). On macOS no system deps are needed.

## Run

```bash
make test-e2e          # headless
make test-e2e-ui       # Playwright UI mode (interactive)

# Or directly:
cd e2e && npm test
```

Playwright launches the Go backend (`go run ./cmd/calendar-service`) on `:3000` and the Vite dev server on `:5173` automatically (see `webServer` in `playwright.config.ts`).

The **backend is always spawned fresh** — `reuseExistingServer` is intentionally off for it, because reusing a backend whose `ADMIN_TOKEN` doesn't match the e2e default would make `global-setup.ts` fail with 401 in a confusing way. If you already have `make dev-backend` running, stop it before `make test-e2e` (you'll see a "port 3000 in use" error otherwise).

The **frontend is reused when available** (`reuseExistingServer: !CI`) — Vite has no auth, so attaching to a running `make dev-frontend` is safe and fast.

## Configuration

| Env var       | Default                            | Purpose                               |
| ------------- | ---------------------------------- | ------------------------------------- |
| `ADMIN_TOKEN` | `e2e-admin-token-please-change-me` | Admin auth header used by the seeder. |
| `CI`          | unset locally, `true` in CI        | Switches reporters, retries, workers. |

## Scenarios

v1 covers a single end-to-end scenario:

1. Guest opens the catalog and clicks the seeded **Intro call** card.
2. Guest picks the first available time slot from the 14-day picker.
3. Guest fills in the booking form (name, email, optional notes).
4. Guest sees the **Booking confirmed** screen with the same details.

Future additions (out of v1 scope): form validation errors, slot-conflict (409) handling, admin smoke (token gate + bookings list), cross-browser matrix.

## How the seed data works

The Go backend has no persistence yet — every restart is a clean slate. `global-setup.ts` runs once per Playwright invocation, before any spec, and:

1. PUTs `/admin/settings` to pin `Europe/Moscow` + Mon–Fri 09:00–18:00 working hours, so the 14-day window always has slots.
2. POSTs `/admin/event-types` to create the deterministic `intro-call` (30 min) event type the spec navigates to. A `409 Conflict` from a backend that was reused locally is treated as success.

Both requests carry `X-Admin-Token`, sourced from the `ADMIN_TOKEN` env (or the dev default if unset).

## Selector conventions

Tests use semantic selectors only — `getByRole`, `getByLabel`, `getByText`. No `data-testid` attributes have been added to the production code; Mantine renders accessible labels and roles, which is enough for the booking flow.

Note: Mantine `<Button component={Link}>` renders as `<a>`, so it's `getByRole('link', { name: '…' })`, not `'button'`.

## CI

Runs in [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) on every PR and push to `main`. On failure, two artifacts are uploaded:

- `playwright-report` — HTML report (always uploaded).
- `playwright-test-results` — traces, screenshots, video (only on failure).

To debug a remotely-failing test locally, download the trace.zip and run:

```bash
npx playwright show-trace path/to/trace.zip
```

## Troubleshooting

- **Port 3000 in use.** Playwright always spawns its own backend; stop any `make dev-backend` you have running. (The frontend on `:5173` is reused if present, so it's fine to leave `make dev-frontend` up.)
- **`global-setup.ts` fails with 401 on `PUT /admin/settings`.** Shouldn't happen via the normal flow — `ADMIN_TOKEN` is shared between `webServer.env` and the seeder via one constant in `playwright.config.ts`. If you've set `ADMIN_TOKEN=` in your shell, make sure it has the minimum length (16+ chars) the backend requires.
- **Spec times out at the slot picker.** Verify `globalSetup` ran (look for the `PUT /admin/settings` and `POST /admin/event-types` calls in backend logs). The seeded working hours guarantee at least one slot in any 14-day window.
- **CORS errors in browser console.** `FRONTEND_ORIGIN` on the backend and the Vite host must match exactly — both are `http://127.0.0.1:5173` (not `localhost`).
