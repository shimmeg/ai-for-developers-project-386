# Backend — Calendar Service

Go + Gin HTTP service that implements the [TypeSpec contract](../contract) for
the v1 calendar booking app. State is held in memory (data is lost on
restart); a future iteration will swap the repository layer for
PostgreSQL + GORM behind the same interfaces.

## Quickstart

```bash
# Prerequisites: Go 1.23+, Node 22+ (for contract codegen)

# One-time: compile the contract and generate Go DTO/server stubs.
cd ../contract && npm ci && npm run build && cd -
make generate

# Run the server. ADMIN_TOKEN is mandatory and must be ≥16 chars.
# The backend auto-loads backend/.env on startup; real process env vars
# always win when both are set.
cp .env.example .env
# Edit .env and replace the placeholder ADMIN_TOKEN with a real secret,
# e.g. `ADMIN_TOKEN="$(openssl rand -hex 24)"`, then:
make run
# Listens on http://localhost:3000
```

## Environment

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3000` | matches the contract's `@server` URL |
| `ADMIN_TOKEN` | — | **required**, ≥16 characters |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS allow-list |
| `DEFAULT_TZ` | `UTC` | seeds OwnerSettings on first boot |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

## Make targets

```
make generate   # regenerate internal/api/api.gen.go from openapi.yaml
make build      # go build ./...
make run        # go run ./cmd/calendar-service
make test       # go test ./... -count=1
make test-race  # go test ./... -count=1 -race
make lint       # golangci-lint run
make fmt        # gofmt
make tidy       # go mod tidy
```

## Layout

```
cmd/calendar-service/   binary entrypoint
internal/api/           generated DTOs + Gin server interface
internal/config/        env loader
internal/server/        Gin glue, auth, CORS, error mapping, ServerInterface impl
internal/domain/        pure business types (settings, event types, bookings, slot generation, overlap)
internal/service/       service layer wiring repositories + clock to domain rules
internal/repository/    persistence contracts
  └── memory/           sync.RWMutex-guarded in-memory implementation
test/integration/       httptest end-to-end coverage
```

## Notes on the contract

The TypeSpec contract uses `oneOf` for `WorkingDay`, which oapi-codegen
represents as a union struct with `AsClosedDay`/`AsOpenDay`/`FromClosedDay`/
`FromOpenDay` helpers. Conversion to/from the domain happens in
`internal/server/mapping.go` and peeks at the `status` discriminator.

`oapi-codegen` v2 warns that the spec is OpenAPI 3.1; the warning is benign
for this contract — every shape that v3.1 brings is already understood by
the generator (no `unevaluatedProperties`, no JSON-Schema-2020-12 keywords).

## Running against the frontend

Multi-workspace orchestration lives in the [root Makefile](../Makefile):

```bash
echo "VITE_API_BASE_URL=http://localhost:3000" > ../frontend/.env.local
make -C .. dev        # contract watcher + this backend + Vite, in one process
```

Use the value of `ADMIN_TOKEN` from `.env` when the frontend prompts for the
admin token on the first `/admin/*` visit. CORS is allow-listed for
`FRONTEND_ORIGIN`, which defaults to `http://localhost:5173`.

## Verification

The §7 verification scenarios in
[`../docs/business-description.md`](../docs/business-description.md) are
exercised programmatically by `make test`:

- `test/integration/auth_test.go` and `auth_ordering_test.go` — token gating,
  including the regression test that auth fires before generated path-param
  binding (so `DELETE /admin/bookings/not-a-uuid` without a token is 401, not 400).
- `test/integration/settings_test.go` — GET/PUT round-trip, bad timezone,
  end ≤ start.
- `test/integration/event_types_test.go` — CRUD lifecycle, slug uniqueness,
  inactive types hidden from guests but visible to admin.
- `test/integration/public_slots_test.go` — 14-day window shape, closed
  weekends, inactive-event-type 404.
- `test/integration/booking_happy_test.go` — happy path with snapshots,
  slot removal from picker, admin visibility.
- `test/integration/booking_conflict_test.go` — past slot, outside working
  hours, grid misalignment, cross-event-type overlap, inactive event type,
  malformed email.
- `test/integration/cancel_test.go` — cancel frees the slot.
- `test/integration/concurrency_test.go` — 20 goroutines POST the same slot;
  exactly one 201 and 19 × 409 `slot_unavailable`, with a single row in storage.

The same scenarios can be walked through the UI by following the
"Against the Go backend" section in [`../frontend/README.md`](../frontend/README.md).

## CI

A `backend` workflow at [`../.github/workflows/backend.yml`](../.github/workflows/backend.yml)
runs on every push/PR to `main`. It builds the contract, regenerates
`internal/api/api.gen.go` via `oapi-codegen`, runs `go vet`,
`go test ./... -race`, and `go build`. The repo-wide Prettier check still
lives in the frontend workflow because Prettier doesn't touch Go.

## Future: PostgreSQL + GORM

The plan is to add `internal/repository/postgres/` with GORM implementations
of `SettingsRepo`, `EventTypeRepo`, `BookingRepo`. The booking repo will
run inside a `SERIALIZABLE` transaction and a `bookings` table will carry
an `EXCLUDE USING gist (tstzrange(start_time, start_time + interval, '[)') WITH &&)`
constraint. The service, HTTP and domain layers stay untouched.
