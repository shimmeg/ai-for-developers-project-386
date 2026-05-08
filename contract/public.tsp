import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CalendarService;

// ===========================================================================
// Public: Catalog
// ===========================================================================

@tag("Public")
@route("/event-types")
interface PublicEventTypes {
  @doc("""
    Public catalog of bookable event types. Returns only currently active
    event types, plus the configured timezone so the frontend can label times.
    """)
  @get
  list(): CatalogResponse;

  @doc("""
    Get a single active event type by slug. Inactive event types respond with
    404 even though they exist server-side, so guests cannot probe them.
    """)
  @get
  @route("/{slug}")
  get(@path slug: EventTypeSlug): PublicEventType | NotFoundResponse;

  @doc("""
    Get the 14-day slot-picker view for an active event type. The response
    always contains exactly 14 day entries. Slots earlier than the current
    moment, slots that overlap an existing booking (any event type), and days
    marked closed in settings are not surfaced as available — they are
    reflected in the per-day `status` field instead.
    """)
  @get
  @route("/{slug}/slots")
  slots(@path slug: EventTypeSlug): SlotPickerResponse | NotFoundResponse;

  @doc("""
    Submit a booking for an active event type. The server re-validates that the
    requested `startTime` is still a valid available slot (in-window, in working
    hours, not in the past, no overlap with any existing booking, event type
    still active). On conflict the response is 409 and no booking is created;
    the client should re-fetch the slot picker and ask the guest to pick again.
    """)
  @post
  @route("/{slug}/bookings")
  book(@path slug: EventTypeSlug, @body body: BookingCreate):
    | {
        @statusCode statusCode: 201;
        @body created: Booking;
      }
    | BadRequestResponse
    | NotFoundResponse
    | ConflictResponse;
}
