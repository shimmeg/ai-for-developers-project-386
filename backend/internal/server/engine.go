package server

import (
	"net/http"
	"path/filepath"
	"strings"

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
//
// When staticDir is non-empty, the engine additionally serves the built
// frontend from that directory so a single deployment can host the SPA
// and the API on the same origin. The SPA navigation guard runs BEFORE
// RequireAdminToken so a browser hitting /admin/settings — which collides
// with the API path of the same name — receives the SPA shell instead of
// a 401 JSON response.
func BuildEngine(s *Server, adminToken, frontendOrigin, staticDir string) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	if staticDir != "" {
		r.Use(spaFallback(staticDir))
	}
	r.Use(CORS(frontendOrigin), RequireAdminToken(adminToken))
	api.RegisterHandlers(r, s)
	if staticDir != "" {
		r.StaticFS("/assets", http.Dir(filepath.Join(staticDir, "assets")))
		r.StaticFile("/favicon.svg", filepath.Join(staticDir, "favicon.svg"))
		r.NoRoute(func(c *gin.Context) {
			c.File(filepath.Join(staticDir, "index.html"))
		})
	}
	return r
}

// spaFallback returns the SPA shell for browser navigation requests
// (GET with Accept: text/html) while letting API clients fall through
// to the regular handler chain. openapi-fetch sends Accept: */* or no
// Accept at all, so JSON requests are never intercepted.
func spaFallback(staticDir string) gin.HandlerFunc {
	indexPath := filepath.Join(staticDir, "index.html")
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet {
			c.Next()
			return
		}
		if strings.HasPrefix(c.Request.URL.Path, "/assets/") {
			c.Next()
			return
		}
		if !strings.Contains(c.GetHeader("Accept"), "text/html") {
			c.Next()
			return
		}
		c.File(indexPath)
		c.Abort()
	}
}
