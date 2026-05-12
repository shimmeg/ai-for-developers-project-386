package server

import (
	"github.com/gin-gonic/gin"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

// BuildEngine wires the Gin router with CORS, recovery, the admin-token
// middleware, and the generated route handlers. It is the single entry
// point used by both cmd/calendar-service/main.go and the integration
// tests, so it can be exercised through httptest without spawning a real
// listener.
//
// RequireAdminToken is registered as a Gin-level middleware (NOT via the
// oapi-codegen `Middlewares` slot) so that auth runs BEFORE generated
// parameter binding. Otherwise a malformed UUID under /admin/bookings/{id}
// would 400 with a binding error before the auth check ever fires.
func BuildEngine(s *Server, adminToken, frontendOrigin string) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery(), CORS(frontendOrigin), RequireAdminToken(adminToken))
	api.RegisterHandlers(r, s)
	return r
}
