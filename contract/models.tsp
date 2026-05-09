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

@example(#{ status: "closed" })
@doc("A day on which no bookings can occur.")
model ClosedDay {
  status: "closed";
}

@example(#{ status: "open", start: "09:00", end: "18:00" })
@doc("A day with an open working window. `end` must be strictly greater than `start`.")
model OpenDay {
  status: "open";
  start: HhMm;
  end: HhMm;
}

@example(#{
  monday: #{ status: "open", start: "09:00", end: "18:00" },
  tuesday: #{ status: "open", start: "09:00", end: "18:00" },
  wednesday: #{ status: "open", start: "09:00", end: "18:00" },
  thursday: #{ status: "open", start: "09:00", end: "18:00" },
  friday: #{ status: "open", start: "09:00", end: "17:00" },
  saturday: #{ status: "closed" },
  sunday: #{ status: "closed" },
})
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

@example(#{
  timezone: "Europe/Moscow",
  workingHours: #{
    monday: #{ status: "open", start: "09:00", end: "18:00" },
    tuesday: #{ status: "open", start: "09:00", end: "18:00" },
    wednesday: #{ status: "open", start: "09:00", end: "18:00" },
    thursday: #{ status: "open", start: "09:00", end: "18:00" },
    friday: #{ status: "open", start: "09:00", end: "17:00" },
    saturday: #{ status: "closed" },
    sunday: #{ status: "closed" },
  },
})
@doc("Owner-configurable settings. Singleton resource.")
model OwnerSettings {
  timezone: IanaTimezone;
  workingHours: WorkingHoursByDay;
}

// ===========================================================================
// Event types
// ===========================================================================

@example(#{
  slug: "intro-call",
  name: "Intro call",
  description: "A quick 30-minute introduction chat to get to know each other and discuss your project.",
  durationMinutes: 30,
  active: true,
})
@doc("An event type as visible to the owner (includes the active flag).")
model EventType {
  slug: EventTypeSlug;
  name: string;
  description: string;
  durationMinutes: DurationMinutes;
  active: boolean;
}

@example(#{
  slug: "intro-call",
  name: "Intro call",
  description: "A quick 30-minute introduction chat to get to know each other and discuss your project.",
  durationMinutes: 30,
})
@doc("An event type as visible to guests on the public catalog (always active).")
model PublicEventType {
  slug: EventTypeSlug;
  name: string;
  description: string;
  durationMinutes: DurationMinutes;
}

@example(#{
  slug: "deep-dive",
  name: "Deep dive",
  description: "Focused 60-minute discussion on a specific topic.",
  durationMinutes: 60,
})
@doc("Body for creating a new event type. The `active` flag defaults to true on creation.")
model EventTypeCreate {
  slug: EventTypeSlug;
  name: string;
  description: string;
  durationMinutes: DurationMinutes;
}

@example(#{ name: "Updated intro call", durationMinutes: 45 })
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

@example(#{
  date: "2026-05-12",
  status: DayStatus.open,
  slots: #[
    offsetDateTime.fromISO("2026-05-12T09:00:00+03:00"),
    offsetDateTime.fromISO("2026-05-12T09:30:00+03:00"),
    offsetDateTime.fromISO("2026-05-12T10:00:00+03:00"),
    offsetDateTime.fromISO("2026-05-12T14:30:00+03:00"),
    offsetDateTime.fromISO("2026-05-12T15:00:00+03:00"),
  ],
})
@doc("One day of the slot-picker response.")
model DaySlots {
  @doc("Calendar date in the configured timezone.")
  date: IsoDate;

  status: DayStatus;

  @doc("Available slot start times for this day (offset reflects the configured timezone). Empty unless `status` = `open`.")
  slots: offsetDateTime[];
}

@example(#{
  timezone: "Europe/Moscow",
  windowStart: "2026-05-09",
  windowEnd: "2026-05-22",
  days: #[
    #{ date: "2026-05-09", status: DayStatus.closed, slots: #[] },
    #{ date: "2026-05-10", status: DayStatus.closed, slots: #[] },
    #{
      date: "2026-05-11",
      status: DayStatus.open,
      slots: #[
        offsetDateTime.fromISO("2026-05-11T09:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-11T09:30:00+03:00"),
        offsetDateTime.fromISO("2026-05-11T10:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-11T14:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-11T14:30:00+03:00"),
      ],
    },
    #{
      date: "2026-05-12",
      status: DayStatus.open,
      slots: #[
        offsetDateTime.fromISO("2026-05-12T09:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-12T09:30:00+03:00"),
        offsetDateTime.fromISO("2026-05-12T10:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-12T15:00:00+03:00"),
      ],
    },
    #{
      date: "2026-05-13",
      status: DayStatus.open,
      slots: #[
        offsetDateTime.fromISO("2026-05-13T11:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-13T11:30:00+03:00"),
        offsetDateTime.fromISO("2026-05-13T13:00:00+03:00"),
      ],
    },
    #{
      date: "2026-05-14",
      status: DayStatus.open,
      slots: #[
        offsetDateTime.fromISO("2026-05-14T09:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-14T16:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-14T16:30:00+03:00"),
        offsetDateTime.fromISO("2026-05-14T17:00:00+03:00"),
      ],
    },
    #{
      date: "2026-05-15",
      status: DayStatus.open,
      slots: #[
        offsetDateTime.fromISO("2026-05-15T09:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-15T09:30:00+03:00"),
        offsetDateTime.fromISO("2026-05-15T10:00:00+03:00"),
      ],
    },
    #{ date: "2026-05-16", status: DayStatus.closed, slots: #[] },
    #{ date: "2026-05-17", status: DayStatus.closed, slots: #[] },
    #{
      date: "2026-05-18",
      status: DayStatus.open,
      slots: #[
        offsetDateTime.fromISO("2026-05-18T09:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-18T11:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-18T14:00:00+03:00"),
      ],
    },
    #{
      date: "2026-05-19",
      status: DayStatus.open,
      slots: #[
        offsetDateTime.fromISO("2026-05-19T10:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-19T13:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-19T15:00:00+03:00"),
      ],
    },
    #{ date: "2026-05-20", status: DayStatus.noAvailability, slots: #[] },
    #{
      date: "2026-05-21",
      status: DayStatus.open,
      slots: #[
        offsetDateTime.fromISO("2026-05-21T09:00:00+03:00"),
        offsetDateTime.fromISO("2026-05-21T09:30:00+03:00"),
      ],
    },
    #{
      date: "2026-05-22",
      status: DayStatus.open,
      slots: #[offsetDateTime.fromISO("2026-05-22T16:00:00+03:00")],
    },
  ],
})
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

@example(#{
  id: "5b3f8a2c-e7f4-4a1b-9c5d-2f7e8b0a6d3c",
  eventTypeSlug: "intro-call",
  eventTypeName: "Intro call",
  startTime: offsetDateTime.fromISO("2026-05-12T10:00:00+03:00"),
  durationMinutesSnapshot: 30,
  guestName: "Jane Doe",
  guestEmail: "jane.doe@example.com",
  guestNotes: "Looking forward to chatting about the project.",
  createdAt: offsetDateTime.fromISO("2026-05-09T14:23:11+03:00"),
})
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

@example(#{
  startTime: offsetDateTime.fromISO("2026-05-12T10:00:00+03:00"),
  guestName: "Jane Doe",
  guestEmail: "jane.doe@example.com",
  guestNotes: "Looking forward to chatting.",
})
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

@example(#{
  timezone: "Europe/Moscow",
  eventTypes: #[
    #{
      slug: "intro-call",
      name: "Intro call",
      description: "A quick 30-minute introduction chat to get to know each other and discuss your project.",
      durationMinutes: 30,
    },
    #{
      slug: "deep-dive",
      name: "Deep dive",
      description: "Focused 60-minute discussion on a specific topic.",
      durationMinutes: 60,
    },
    #{
      slug: "office-hours",
      name: "Office hours",
      description: "Drop in for 15 minutes to ask anything.",
      durationMinutes: 15,
    },
  ],
})
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

@example(#{
  code: "slot_unavailable",
  message: "This slot is no longer available. Please pick a different time.",
})
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
