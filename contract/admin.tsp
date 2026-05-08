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
  @get
  get(): OwnerSettings | UnauthorizedResponse;

  @doc("""
    Replace the entire owner settings document. Validation: timezone must be a
    valid IANA name; for every `open` day, `end` must be strictly greater than
    `start`. Existing bookings are not affected by changes here.
    """)
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
  @get
  list(): EventType[] | UnauthorizedResponse;

  @doc("""
    Create a new event type. The slug must be unique across all event types
    (active or not). Newly created event types are active by default.
    """)
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
