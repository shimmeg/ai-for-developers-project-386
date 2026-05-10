import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CalendarService;

// ===========================================================================
// Admin authentication
// ===========================================================================
//
// All operations under the /admin route require an X-Admin-Token request
// header whose value matches the deployment-configured admin token. Any
// missing or wrong token yields 401 Unauthorized. The token is *not* part
// of the URL path; the frontend persists it in browser local storage and
// sends it on each admin request.

alias AdminAuth = ApiKeyAuth<ApiKeyLocation.header, "X-Admin-Token">;

// ===========================================================================
// Admin: Settings
// ===========================================================================

@tag("Admin: Settings")
@useAuth(AdminAuth)
@route("/admin/settings")
interface AdminSettings {
  @doc("Get the current owner settings (timezone + weekly working hours).")
  @opExample(#{
    returnType: #{
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
    },
  })
  @get
  get(): OwnerSettings | UnauthorizedResponse;

  @doc("""
    Replace the entire owner settings document. Validation: timezone must be a
    valid IANA name; for every `open` day, `end` must be strictly greater than
    `start`. Existing bookings are not affected by changes here.
    """)
  @opExample(#{
    parameters: #{
      settings: #{
        timezone: "Europe/Moscow",
        workingHours: #{
          monday: #{ status: "open", start: "10:00", end: "19:00" },
          tuesday: #{ status: "open", start: "10:00", end: "19:00" },
          wednesday: #{ status: "open", start: "10:00", end: "19:00" },
          thursday: #{ status: "open", start: "10:00", end: "19:00" },
          friday: #{ status: "open", start: "10:00", end: "16:00" },
          saturday: #{ status: "closed" },
          sunday: #{ status: "closed" },
        },
      },
    },
    returnType: #{
      timezone: "Europe/Moscow",
      workingHours: #{
        monday: #{ status: "open", start: "10:00", end: "19:00" },
        tuesday: #{ status: "open", start: "10:00", end: "19:00" },
        wednesday: #{ status: "open", start: "10:00", end: "19:00" },
        thursday: #{ status: "open", start: "10:00", end: "19:00" },
        friday: #{ status: "open", start: "10:00", end: "16:00" },
        saturday: #{ status: "closed" },
        sunday: #{ status: "closed" },
      },
    },
  })
  @put
  update(
    @body settings: OwnerSettings,
  ): OwnerSettings | BadRequestResponse | UnauthorizedResponse;
}

// ===========================================================================
// Admin: Event types
// ===========================================================================

@tag("Admin: Event types")
@useAuth(AdminAuth)
@route("/admin/event-types")
interface AdminEventTypes {
  @doc("List all event types — both active and inactive — in display order.")
  @opExample(#{
    returnType: #[
      #{
        slug: "intro-call",
        name: "Intro call",
        description: "A quick 30-minute introduction chat to get to know each other and discuss your project.",
        durationMinutes: 30,
        active: true,
      },
      #{
        slug: "deep-dive",
        name: "Deep dive",
        description: "Focused 60-minute discussion on a specific topic.",
        durationMinutes: 60,
        active: true,
      },
      #{
        slug: "office-hours",
        name: "Office hours",
        description: "Drop in for 15 minutes to ask anything.",
        durationMinutes: 15,
        active: true,
      },
      #{
        slug: "long-form",
        name: "Long-form workshop",
        description: "Hidden from the catalog; toggle on to publish.",
        durationMinutes: 90,
        active: false,
      },
    ],
  })
  @get
  list(): EventType[] | UnauthorizedResponse;

  @doc("""
    Create a new event type. The slug must be unique across all event types
    (active or not). Newly created event types are active by default.
    """)
  @opExample(#{
    parameters: #{
      body: #{
        slug: "deep-dive",
        name: "Deep dive",
        description: "Focused 60-minute discussion on a specific topic.",
        durationMinutes: 60,
      },
    },
    returnType: #{
      statusCode: 201,
      created: #{
        slug: "deep-dive",
        name: "Deep dive",
        description: "Focused 60-minute discussion on a specific topic.",
        durationMinutes: 60,
        active: true,
      },
    },
  })
  @post
  create(@body body: EventTypeCreate):
    | {
        @statusCode statusCode: 201;
        @body created: EventType;
      }
    | BadRequestResponse
    | UnauthorizedResponse
    | ConflictResponse;

  @doc("Get a single event type by slug (active or inactive).")
  @opExample(#{
    parameters: #{ slug: "intro-call" },
    returnType: #{
      slug: "intro-call",
      name: "Intro call",
      description: "A quick 30-minute introduction chat to get to know each other and discuss your project.",
      durationMinutes: 30,
      active: true,
    },
  })
  @get
  @route("/{slug}")
  get(
    @path slug: EventTypeSlug,
  ): EventType | UnauthorizedResponse | NotFoundResponse;

  @doc("""
    Partially update an event type. Any subset of fields may be present.
    Editing `durationMinutes` does not change existing bookings (they keep the
    duration snapshot taken at booking time). Editing `slug` is subject to the
    same uniqueness and format rules as creation.
    """)
  @opExample(#{
    parameters: #{
      slug: "intro-call",
      body: #{ name: "Intro chat", durationMinutes: 20 },
    },
    returnType: #{
      slug: "intro-call",
      name: "Intro chat",
      description: "A quick 30-minute introduction chat to get to know each other and discuss your project.",
      durationMinutes: 20,
      active: true,
    },
  })
  @patch
  @route("/{slug}")
  update(@path slug: EventTypeSlug, @body body: EventTypeUpdate):
    | EventType
    | BadRequestResponse
    | UnauthorizedResponse
    | NotFoundResponse
    | ConflictResponse;
}

// ===========================================================================
// Admin: Bookings
// ===========================================================================

@tag("Admin: Bookings")
@useAuth(AdminAuth)
@route("/admin/bookings")
interface AdminBookings {
  @doc("""
    List all upcoming bookings across every event type, sorted by start time
    ascending. Past bookings are not returned. There is no pagination in v1.
    """)
  @get
  list(): Booking[] | UnauthorizedResponse;

  @doc("""
    Cancel an upcoming booking. The booking is removed (or marked cancelled —
    server's choice) and its time slot becomes immediately available again.
    """)
  @delete
  @route("/{id}")
  cancel(@path id: BookingId): {
    @statusCode statusCode: 204;
  } | UnauthorizedResponse | NotFoundResponse;
}
