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
func BuildEngine(s *Server, adminToken, frontendOrigin string) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery(), CORS(frontendOrigin))
	api.RegisterHandlersWithOptions(r, s, api.GinServerOptions{
		Middlewares: []api.MiddlewareFunc{
			api.MiddlewareFunc(RequireAdminToken(adminToken)),
		},
	})
	return r
}
