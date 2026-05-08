import "@typespec/http";
import "@typespec/openapi";
import "@typespec/openapi3";

import "./models.tsp";
import "./admin.tsp";
import "./public.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{ title: "Calendar Service" })
@info(#{ version: "0.1.0" })
@doc("""
  API contract for the v1 calendar booking service. The owner manages event
  types and views bookings; guests browse active event types and book free
  slots in the next 14 days. All times throughout the API are in the owner's
  configured IANA timezone, formatted as ISO 8601 with offset.
  """)
@server("http://localhost:3000", "Local development server")
namespace CalendarService;
