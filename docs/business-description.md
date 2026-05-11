# Calendar Service — Business Description (v1)

## Context

This is a greenfield Hexlet learning project. The repository currently contains only `README.md` and the `hexlet-check.yml` workflow — no application code yet.

**Goal of v1:** deliver the smallest useful slice of a Calendly-style booking service so that a single, fixed calendar owner can publish event types and anonymous guests can book free slots in the next 14 days. The focus is on the calendar logic (slots, conflicts, the booking window), not on auth, email, or scaling concerns. Auth, email, and other integrations are deliberately deferred so the v1 scope stays tight.

This document is the **business description** — the agreed-upon behaviour, entities, and rules. A separate implementation plan (with tech-stack choices, file structure, and tasks) will be produced after this description is approved.

---

## 1. Overview, roles, entities

### 1.1 Roles

- **Owner** — single, pre-defined account. No login form with username/password. Admin pages live at clean URLs (e.g., `/admin/...`); on first visit the frontend prompts for a deployment-configured admin token, stores it in browser local storage, and sends it on every admin API call as an `X-Admin-Token` HTTP header. Anyone who knows the token can act as owner; v1 has no further protection.
- **Guest** — anonymous visitor. Browses active event types, picks a free slot, submits a booking with name, email, and optional notes. No account, no login.

### 1.2 Core entities (business-level)

| Entity             | Key attributes                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner settings** | timezone (IANA string, e.g. `Europe/Moscow`); working hours per day-of-week (start, end, or "closed")                                                                      |
| **Event type**     | `slug` (owner-chosen, unique, URL-friendly), `name`, `description`, `duration_minutes`, `active` flag                                                                      |
| **Booking**        | reference to event type, `start_time`, `duration_snapshot` (copied from the event type at booking time), `guest_name`, `guest_email`, optional `guest_notes`, `created_at` |

The duration snapshot is required so future edits to an event type's duration cannot retroactively change history.

### 1.3 The defining invariant

> **No two bookings may overlap in time, regardless of which event types they belong to.**

A booking occupies the half-open interval `[start, start + duration)`. A new booking is admissible only if its interval does not overlap any existing booking's interval.

---

## 2. Owner flows

All owner admin pages live under `/admin/...`. The frontend prompts for the admin token on first visit and persists it in browser local storage. Subsequent admin API calls include the token in the `X-Admin-Token` HTTP header. If the API returns `401 Unauthorized`, the stored token is cleared and the owner is re-prompted.

### 2.1 Settings page (`/admin/settings`)

The owner configures:

- **Timezone** — selected from a dropdown of IANA timezones; defaults to the server's local timezone on first run.
- **Working hours** — for each day of the week (Mon–Sun), either a `(start, end)` pair or "closed". Times are entered as wall-clock in the configured timezone.

Validation: `end > start` when not closed; both aligned to whole minutes.

### 2.2 Event types page (`/admin/event-types`)

The owner sees a list of all event types (active and inactive) with their slug, name, duration, and active toggle. Actions:

- **Create** — form with `slug`, `name`, `description`, `duration_minutes`. Slug is validated as lowercase alphanumeric + hyphens, unique across all event types (active or not). New event types start active.
- **Edit** — change name / description / duration / slug. Editing duration does not change existing bookings (each booking carries its own `duration_snapshot`). Slug edits are subject to the same format and uniqueness rules as creation.
- **Toggle active/inactive** — single click. Inactive event types are hidden from the guest catalog and cannot accept new bookings, but their existing bookings remain unchanged and visible in the bookings list.

There is no delete operation in v1.

### 2.3 Bookings page (`/admin/bookings`)

Lists all upcoming bookings across all event types, sorted chronologically. For each booking the owner sees: start time (in configured timezone), event-type name, duration, guest name, guest email, guest notes, and a **Cancel** action.

Cancelling a booking removes it (or marks it cancelled — implementation choice; the business effect is the same): its interval no longer counts toward overlap checks and the slot becomes available again.

Past bookings are not displayed in v1. They remain in the database.

---

## 3. Guest flow

Guest pages are public (no token, no login). All times are shown in the owner's configured timezone, with the timezone label displayed on every page that shows times (e.g., _"All times shown in Europe/Moscow"_).

### 3.1 Catalog page (`/`)

Lists every **active** event type as a card with name, description, and duration. Inactive event types are hidden. Each card links to the event type's slot-picker page.

### 3.2 Slot picker (`/events/<slug>`)

Shows the next 14 days as a calendar/agenda view. For each day in the window, the page lists the **available slots** for this event type, computed by §4. Days with no available slots (closed, fully booked, or only-past slots) are shown but marked unavailable. The guest clicks a slot to proceed.

Slot availability is recomputed on every page load — slots can become unavailable between visits.

### 3.3 Confirmation page (`/events/<slug>/confirm?slot=<iso>`)

Shows the chosen event type, date, time, and duration. Below it, a form collects:

- **Name** (required)
- **Email** (required, validated as email format)
- **Notes** (optional, free-form textarea)

Two actions: **Confirm booking** and **Back** (returns to slot picker, no booking created).

On submit, the server re-validates that the slot is still available.

- **Success** — booking is created and the guest sees a success page with the booked details and a note: _"Please save these details — there is no email confirmation in this version."_
- **Slot now taken / now in the past / event type became inactive** — booking is rejected; guest is sent back to the slot picker with an explanatory message; no partial state is written.
- **Validation error** (missing fields, malformed email) — form is re-shown with the offending field highlighted.

---

## 4. Slot generation & booking rules

### 4.1 Definitions

- `now` — current moment, interpreted in the owner's configured timezone.
- `D` — duration of the selected event type, in minutes.
- A **slot** is the half-open interval `[start, start + D)`.
- The **booking window** is the 14 calendar days starting at the beginning of today (in the configured timezone): `today, today+1, …, today+13`.

### 4.2 Slot generation (per event type)

For each day `d` in the booking window:

1. Look up working hours for `d`'s day-of-week from owner settings.
2. If "closed", emit no slots for that day.
3. Otherwise, starting at `working_hours_start`, emit slot starts spaced by `D` minutes while `slot_start + D ≤ working_hours_end`. Slots must fit fully inside the working window.
4. Filter out any slot with `slot_start < now`.
5. Filter out any slot whose interval overlaps an existing booking (any event type).

Each event type has its own grid because slot spacing equals that event type's duration.

### 4.3 Conflict rule

Two intervals `[a1, a2)` and `[b1, b2)` **overlap** iff `a1 < b2` AND `b1 < a2`.
A new booking is admissible iff its interval does not overlap any existing booking.

### 4.4 Booking submission

When the guest submits the confirmation form:

1. **Re-validate availability** server-side using the same rules in §4.2 (in-window, in working hours, not in the past, no overlap, event type still active).
2. If valid, persist the booking with a `duration_snapshot` copied from the event type's current duration.
3. If invalid, reject with a clear message and send the guest back to the slot picker. No partial state is written.

### 4.5 Concurrency

Step 4.4.1 is an availability re-check, not a guarantee — a concurrent booking could land between the check and the write. The system must therefore enforce non-overlap at the persistence layer too. Acceptable approaches:

- A **uniqueness constraint on `start_time`** + the application-level overlap check is sufficient for the common case (two guests targeting the same slot for the same event type).
- For cross-event-type overlaps (a 30-min and a 60-min event whose intervals would intersect), the application-level overlap check inside a serialisable transaction is sufficient.

Pick whichever the chosen DB supports cleanly. The contract from the guest's perspective is: of any set of conflicting submissions, at most one succeeds; the others get a clear "slot no longer available" message.

### 4.6 Effect of configuration changes

Existing bookings are immutable when configuration changes:

- Editing **working hours** affects only future slot generation. Existing bookings outside the new working hours remain in place.
- Editing **timezone** changes how times are displayed but does not move bookings; each booking remains anchored to its original absolute moment.
- Editing an **event type's duration** affects only future slot generation. Existing bookings keep their `duration_snapshot`.
- Toggling an event type **inactive** removes it from the guest catalog but leaves its existing bookings intact and visible in the owner's bookings list.

---

## 5. Explicit non-goals for v1

Calling these out so the implementation phase does not drift into them:

- **No authentication or authorisation in the proper sense.** The owner is identified solely by knowledge of a deployment-configured admin token, supplied in the `X-Admin-Token` request header. There is no user database, no login with username/password, no sessions, no roles. The README must clearly state: do not deploy this version publicly without adding real auth.
- **No email or notifications.** The system never sends mail. The success page is the guest's only "receipt."
- **No multi-timezone support.** Times are always shown in the owner's configured timezone, labelled.
- **No guest-side booking management.** Guests cannot cancel or reschedule. They contact the owner out-of-band.
- **No rescheduling.** Owner can only cancel; moving a booking means cancel + the guest re-books.
- **No buffer time between meetings.** Slots are generated back-to-back within working hours.
- **No event-type deletion.** Event types can only be toggled inactive.
- **No history view.** Past bookings remain in the database but are not surfaced in any UI.
- **No recurring availability exceptions.** Working hours are a fixed weekly schedule (no holidays, no vacation overrides).
- **No payments, no integrations** (no Google/Outlook calendar sync, no Zoom links, no SMS, no webhooks).
- **No internationalisation.** The UI is single-language; pick one language at implementation time.

---

## 6. Files to be created (high level)

This is a greenfield project. The implementation plan will decide the tech stack and concrete file layout. At minimum, the v1 codebase will contain:

- A **frontend** delivering the catalog, slot picker, confirmation, and success pages for guests, plus settings, event types, and bookings pages for the owner.
- A **backend** exposing the data and business rules above (event-type CRUD without delete; booking submission with re-validation; cancel; settings get/put).
- A **database** persisting `owner_settings` (single row), `event_types`, and `bookings`.
- A **secret admin token** value supplied by environment configuration on the backend, validated against the `X-Admin-Token` header on every admin API call. The frontend persists this token in browser local storage after the owner enters it on first visit; the token never appears in URLs.

There are no existing functions or utilities in this repo to reuse.

---

## 7. Verification (how to validate v1 end-to-end)

The implementation is correct when all of the following pass — exercised manually via the UI, or as automated end-to-end tests:

**Setup**

- Configure timezone in settings; configure working hours for each day of the week (some days closed).
- Create three event types with different durations (e.g., 15, 30, 60 min). Toggle one inactive.
- Verify the inactive event type is hidden from `/` but still appears on `/<token>/admin/event-types`.

**Slot generation**

- For each active event type, the slot picker for `/events/<slug>` shows slots only within working hours, only in the 14-day window, only for days not marked closed, only for slots that fit inside the day's working window, and never in the past relative to "now."

**Booking happy path**

- Book a slot as a guest. Verify it appears in `/<token>/admin/bookings` with correct fields and that the slot is no longer available in the slot picker for the same event type or any overlapping event type.

**Cross-event-type conflict**

- Book a 60-min slot at 10:00. On a 30-min event type, verify that 10:00 and 10:30 are both unavailable, and that 09:30 (which would end at 10:00, not overlap) is available.

**Cancellation**

- Cancel the booking from `/<token>/admin/bookings`. Verify the slot becomes available again immediately for both the original event type and overlapping ones.

**Concurrency**

- Open two browser windows on the same slot's confirmation page; submit both. Verify exactly one succeeds and the other gets a "slot no longer available" message; verify only one booking exists in the DB.

**Past slots**

- At, say, 11:00, verify slots earlier than 11:00 today are not shown. Verify that yesterday is not in the window.

**Configuration changes preserve bookings**

- With an existing booking at 09:30, change working hours to start at 10:00. Verify the existing booking still appears in `/<token>/admin/bookings`. Verify new slot pickers no longer offer 09:30.
- Toggle an event type with existing bookings to inactive. Verify the existing bookings still appear. Verify the event type is hidden from `/`.

**Owner-only access**

- Verify admin API calls with the correct `X-Admin-Token` header succeed.
- Verify admin API calls with a missing or wrong token are rejected with `401 Unauthorized`.
- Verify the admin web pages prompt for the token when local storage is empty, persist it after entry, and clear it on a `401` response so the prompt re-appears.
