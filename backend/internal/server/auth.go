package server

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

// adminPathPrefix gates which incoming requests must carry an admin token.
// The contract puts every admin operation under /admin/, so a path prefix
// match is sufficient and lets us install the middleware on the engine root —
// crucially, before oapi-codegen's generated route wrapper binds path
// parameters, so a request like DELETE /admin/bookings/not-a-uuid without a
// token returns 401 (the contract-documented response) instead of the 400
// the binding layer would otherwise emit.
const adminPathPrefix = "/admin/"

// RequireAdminToken returns a Gin middleware that rejects requests under
// /admin/ unless the X-Admin-Token header matches expected. Public routes
// pass through untouched.
func RequireAdminToken(expected string) gin.HandlerFunc {
	expectedBytes := []byte(expected)
	return func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.URL.Path, adminPathPrefix) {
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
