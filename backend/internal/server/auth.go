package server

import (
	"crypto/subtle"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

// adminAuthCtxKey is the gin.Context key that the generated wrapper sets
// (via c.Set) on every admin-tagged route. The middleware uses its presence
// as the signal that a route requires the admin token.
var adminAuthCtxKey = string(api.ApiKeyAuthScopes)

// RequireAdminToken returns a Gin middleware that rejects requests to
// admin-tagged routes unless the X-Admin-Token header matches expected.
// Public routes are left untouched because the generated wrapper only
// sets ApiKeyAuthScopes on operations with security: ApiKeyAuth.
func RequireAdminToken(expected string) gin.HandlerFunc {
	expectedBytes := []byte(expected)
	return func(c *gin.Context) {
		if _, isAdmin := c.Get(adminAuthCtxKey); !isAdmin {
			c.Next()
			return
		}
		got := c.GetHeader("X-Admin-Token")
		if got == "" || subtle.ConstantTimeCompare([]byte(got), expectedBytes) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, api.Error{
				Code:    "unauthorized",
				Message: "Admin token missing or invalid.",
			})
			return
		}
		c.Next()
	}
}
