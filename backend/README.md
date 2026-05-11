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
cp .env.example .env
ADMIN_TOKEN="$(openssl rand -hex 24)" make run
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

## Future: PostgreSQL + GORM

The plan is to add `internal/repository/postgres/` with GORM implementations
of `SettingsRepo`, `EventTypeRepo`, `BookingRepo`. The booking repo will
run inside a `SERIALIZABLE` transaction and a `bookings` table will carry
an `EXCLUDE USING gist (tstzrange(start_time, start_time + interval, '[)') WITH &&)`
constraint. The service, HTTP and domain layers stay untouched.
