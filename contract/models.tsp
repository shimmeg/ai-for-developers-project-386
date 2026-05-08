import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CalendarService;

// ===========================================================================
// Shared scalar types
// ===========================================================================

@doc("ISO 8601 calendar date in YYYY-MM-DD form, interpreted in the configured timezone.")
@format("date")
scalar IsoDate extends string;

@doc("Wall-clock time as HH:MM (24h, no seconds), interpreted in the configured timezone.")
@pattern("^([01]\\d|2[0-3]):[0-5]\\d$")
scalar HhMm extends string;

@doc("URL-friendly identifier for an event type. Lowercase, alphanumeric, hyphen-separated.")
@pattern("^[a-z0-9]+(-[a-z0-9]+)*$")
@minLength(1)
@maxLength(64)
scalar EventTypeSlug extends string;

@doc("Server-assigned booking identifier (UUID v4).")
@format("uuid")
scalar BookingId extends string;

@doc("RFC 5322 email address.")
@format("email")
scalar EmailAddress extends string;

@doc("IANA timezone identifier, e.g. \"Europe/Moscow\".")
scalar IanaTimezone extends string;

@doc("Positive event duration, in whole minutes.")
@minValue(1)
scalar DurationMinutes extends int32;

// ===========================================================================
// Owner settings
// ===========================================================================

@doc("A single day's schedule: either closed, or an open interval [start, end). Discriminated by `status`.")
@oneOf
union WorkingDay {
  closed: ClosedDay,
  open: OpenDay,
}

@doc("A day on which no bookings can occur.")
model ClosedDay {
  status: "closed";
}

@doc("A day with an open working window. `end` must be strictly greater than `start`.")
model OpenDay {
  status: "open";
  start: HhMm;
  end: HhMm;
}

@doc("Weekly working-hours schedule, with one entry per day of the week.")
model WorkingHoursByDay {
  monday: WorkingDay;
  tuesday: WorkingDay;
  wednesday: WorkingDay;
  thursday: WorkingDay;
  friday: WorkingDay;
  saturday: WorkingDay;
  sunday: WorkingDay;
}

@doc("Owner-configurable settings. Singleton resource.")
model OwnerSettings {
  timezone: IanaTimezone;
  workingHours: WorkingHoursByDay;
}

// ===========================================================================
// Event types
// ===========================================================================

@doc("An event type as visible to the owner (includes the active flag).")
model EventType {
  slug: EventTypeSlug;
  name: string;
  description: string;
  durationMinutes: DurationMinutes;
  active: boolean;
}

@doc("An event type as visible to guests on the public catalog (always active).")
model PublicEventType {
  slug: EventTypeSlug;
  name: string;
  description: string;
  durationMinutes: DurationMinutes;
}

@doc("Body for creating a new event type. The `active` flag defaults to true on creation.")
model EventTypeCreate {
  slug: EventTypeSlug;
  name: string;
  description: string;
  durationMinutes: DurationMinutes;
}

@doc("""
  Body for partially updating an event type. Any subset of fields may be present;
  omitted fields are unchanged. Editing `durationMinutes` does not affect existing
  bookings (each booking carries its own duration snapshot). Editing `slug` is subject
  to the same format and uniqueness rules as creation.
  """)
model EventTypeUpdate {
  slug?: EventTypeSlug;
  name?: string;
  description?: string;
  durationMinutes?: DurationMinutes;
  active?: boolean;
}

// ===========================================================================
// Slot picker
// ===========================================================================

@doc("Status of a single day in the slot picker response.")
enum DayStatus {
  @doc("The day is within working hours and has at least one available slot.")
  open,

  @doc("The day is marked closed in the owner's working-hours settings.")
  closed,

  @doc("The day is open per settings, but every slot is either booked or already past.")
  noAvailability: "no-availability",
}

@doc("One day of the slot-picker response.")
model DaySlots {
  @doc("Calendar date in the configured timezone.")
  date: IsoDate;

  status: DayStatus;

  @doc("Available slot start times for this day (offset reflects the configured timezone). Empty unless `status` = `open`.")
  slots: offsetDateTime[];
}

@doc("Response for the slot-picker endpoint. Always covers exactly 14 consecutive days.")
model SlotPickerResponse {
  @doc("IANA timezone the times are interpreted in.")
  timezone: IanaTimezone;

  @doc("First date of the booking window (inclusive), in the configured timezone.")
  windowStart: IsoDate;

  @doc("Last date of the booking window (inclusive). Always equals `windowStart` + 13 days.")
  windowEnd: IsoDate;

  @doc("14 day entries from `windowStart` to `windowEnd`, oldest first.")
  days: DaySlots[];
}

// ===========================================================================
// Bookings
// ===========================================================================

@doc("A booking record.")
model Booking {
  id: BookingId;

  @doc("Slug of the event type at booking time. May be stale if the slug is later edited.")
  eventTypeSlug: EventTypeSlug;

  @doc("Snapshot of the event type's name at booking time.")
  eventTypeName: string;

  @doc("Booking start time (ISO 8601 with offset).")
  startTime: offsetDateTime;

  @doc("Snapshot of the event type's duration at booking time, in minutes.")
  durationMinutesSnapshot: DurationMinutes;

  guestName: string;
  guestEmail: EmailAddress;
  guestNotes?: string;

  @doc("Server-assigned creation timestamp.")
  createdAt: offsetDateTime;
}

@doc("Body for creating a new booking under an event type.")
model BookingCreate {
  @doc("Chosen slot start time. Must exactly match an available slot returned by the slot-picker endpoint.")
  startTime: offsetDateTime;

  guestName: string;
  guestEmail: EmailAddress;
  guestNotes?: string;
}

// ===========================================================================
// Public catalog
// ===========================================================================

@doc("Response for the public event-type catalog.")
model CatalogResponse {
  @doc("IANA timezone the times throughout the API are interpreted in.")
  timezone: IanaTimezone;

  @doc("All currently active event types, in display order.")
  eventTypes: PublicEventType[];
}

// ===========================================================================
// Errors
// ===========================================================================

@doc("Error envelope returned for any non-2xx response.")
model Error {
  @doc("Stable error code for programmatic handling.")
  code: string;

  @doc("Human-readable message; safe to display to end users.")
  message: string;
}

@error
@doc("Generic 400 Bad Request for malformed input or validation failures.")
model BadRequestResponse {
  @statusCode statusCode: 400;
  @body error: Error;
}

@error
@doc("401 Unauthorized: admin token is missing or invalid.")
model UnauthorizedResponse {
  @statusCode statusCode: 401;
  @body error: Error;
}

@error
@doc("404 Not Found: the requested resource does not exist (or, for guests, is inactive).")
model NotFoundResponse {
  @statusCode statusCode: 404;
  @body error: Error;
}

@error
@doc("""
  409 Conflict: the requested change conflicts with current state. Examples:
  duplicate slug on create/edit, slot already booked, slot now in the past,
  event type became inactive between slot-picker view and booking submit.
  """)
model ConflictResponse {
  @statusCode statusCode: 409;
  @body error: Error;
}
