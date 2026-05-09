# Frontend Implementation Notes

This document is for a developer arriving at this repository to build the UI. It complements [`business-description.md`](business-description.md): the spec covers *what* the system does; this file covers the UI-side decisions and operational details that aren't part of the spec.

## Read first, in order

1. [`docs/business-description.md`](business-description.md) — the source of truth for behaviour: roles, entities, flows, slot rules, and explicit non-goals.
2. [`contract/`](../contract) — the TypeSpec API contract. Run `cd contract && npm install && npm run build` to generate `tsp-output/@typespec/openapi3/openapi.yaml`. That YAML is the source of truth for HTTP request/response shapes.
3. [`README.md`](../README.md) — repository orientation and the security caveat.

## Routes the UI must implement

Owner routes are gated by an admin token (header-based, see "Admin-token UX"); guest routes are public.

| Route | Audience | Source section in spec |
|---|---|---|
| `/` | Guest | §3.1 Catalog |
| `/events/{slug}` | Guest | §3.2 Slot picker |
| `/events/{slug}/confirm?slot=<iso>` | Guest | §3.3 Confirmation |
| `/events/{slug}/booked/{id}` | Guest | §3.4 Success |
| `/admin/login` | Owner | (UI-only; see "Admin-token UX") |
| `/admin/settings` | Owner | §2.1 |
| `/admin/event-types` | Owner | §2.2 (list + create) |
| `/admin/event-types/{slug}` | Owner | §2.2 (edit, toggle active) |
| `/admin/bookings` | Owner | §2.3 |

The `{slug}` segment is the owner-chosen, lowercase-alphanumeric-with-hyphens identifier; validation rules are in the OpenAPI schema (`EventTypeSlug`).

## API contract

The HTTP contract is OpenAPI 3.1 generated from TypeSpec.

```bash
cd contract
npm install        # one-time
npm run build      # → tsp-output/@typespec/openapi3/openapi.yaml
```

Conventions to keep in mind on the UI side:

- **Admin endpoints** (paths under `/admin/*` in OpenAPI) require an `X-Admin-Token` request header. Missing or wrong token → `401`.
- **Public endpoints** (paths under `/event-types/*`) take no auth header.
- **All times** in request and response bodies are ISO 8601 with offset, e.g. `2026-05-08T10:00:00+03:00`. The offset reflects the owner's configured IANA timezone.
- **Errors** use a uniform `{ code, message }` envelope on every non-2xx response.

Two reasonable approaches to a typed API client:

- **Generate from OpenAPI** — for example with `openapi-typescript` + `openapi-fetch`, `orval`, or `@hey-api/openapi-ts`. Types stay in sync with the contract automatically; build dependency.
- **Hand-write fetch wrappers** — a small `api.ts` with one function per endpoint. Zero generation step; manual drift risk.

Either is acceptable. Pick once and stick with it.

## Admin-token UX

The admin token is configured server-side at deployment and given to the owner out-of-band; the frontend just remembers it. Recommended flow:

1. Visiting any `/admin/*` route checks `localStorage` for a fixed key (e.g. `calendar.adminToken`).
2. If absent, redirect to `/admin/login`. That page is a simple form with one password-style input and a Submit button. Submit stores the value under the key and redirects back to the originally requested `/admin/*` route.
3. Every admin API call sends `X-Admin-Token: <stored value>`.
4. If any admin API call returns `401`, clear the stored key and redirect to `/admin/login` with a "Token rejected, please re-enter" banner.

There is no logout button in v1; the owner can clear local storage manually if they want to switch tokens.

## Time and timezone

The owner picks one IANA timezone in settings; every page that shows times labels them with that timezone (e.g., *"All times shown in Europe/Moscow"*).

- **Settings dropdown source.** Use `Intl.supportedValuesOf('timeZone')` (Safari 15.4+, Chrome 99+, Firefox 93+). For older browsers, ship a static list. Don't roll your own subset — guests will choose surprising timezones.
- **`?slot=` URL encoding.** A slot like `2026-05-08T10:00:00+03:00` contains `+`, which decodes to space. Use `encodeURIComponent` when building the URL and `decodeURIComponent` when reading it back.
- **Display formatting.** The API emits ISO 8601 with offset. Render in any locale-friendly format you like, but always show the date, the time, and the timezone label so the guest is sure.

## States to design per page

The spec covers behaviour. The UI dev still designs:

- **Catalog (`/`).** Empty state: zero active event types — friendly placeholder. Loading and network-error states.
- **Slot picker (`/events/{slug}`).** Empty state: every day in the 14-day window is closed or fully booked. `404` state: slug doesn't exist or event type is inactive.
- **Confirmation (`/events/{slug}/confirm`).** Inline validation errors. `409` on submit (slot taken / event went inactive / slot now in past): clear message and route back to the slot picker. Other network errors: re-show the form with an error banner.
- **Success (`/events/{slug}/booked/{id}`).** Direct access without booking data: graceful "Booking not found, return to catalog" message.
- **Admin pages.** `401` → clear stored token, redirect to `/admin/login` with a banner. Other errors: inline banner per page.

## Open decisions for the UI session

These have not been picked. The UI session should choose and record them here (replace this list with the choices once made):

- **Frontend framework.** React, Vue, Svelte, Solid, plain HTML+JS — open.
- **Styling.** Component library (Mantine, Chakra, Tailwind UI, etc.) vs hand-written CSS — open.
- **Routing.** Client-side router (single-page app) vs server-rendered pages — open. The route paths above work either way.
- **API client.** Generate from OpenAPI vs hand-written fetch wrappers (see "API contract") — open.
- **Build tool.** Vite, Next.js, plain Node, etc. — tied to framework choice.

## Out of scope for v1 (UI side)

These mirror the explicit non-goals from §5 of the spec; the UI must not build them:

- Login forms with username/password. The admin token is *not* a username/password — it is a single shared deployment secret.
- Email-confirmation UIs.
- Rescheduling / "move to a different time" UIs.
- Cancel-by-guest UIs.
- Past-bookings / history pages.
- Internationalisation. Pick one language and keep all copy in that language.
- Buffer-time settings, holiday/vacation overrides, calendar-sync UIs — none of these exist in the API.
