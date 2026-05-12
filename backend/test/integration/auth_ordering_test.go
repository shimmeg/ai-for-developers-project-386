package integration_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

// TestAdmin_AuthRunsBeforePathBinding guards against a regression where the
// admin-token middleware fired only after the generated oapi-codegen wrapper
// bound the {id} path parameter. In that ordering, DELETE /admin/bookings/not-a-uuid
// with no token returned 400 (bind error) instead of the contract-documented
// 401. Auth must run first.
func TestAdmin_AuthRunsBeforePathBinding(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)

	// No token + malformed UUID → must be 401, not 400.
	resp := h.request(t, http.MethodDelete, "/admin/bookings/not-a-uuid", nil, nil)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	var body api.Error
	decodeJSON(t, resp, &body)
	assert.Equal(t, "unauthorized", body.Code)

	// Wrong token + malformed UUID → still 401.
	resp = h.request(t, http.MethodDelete, "/admin/bookings/not-a-uuid", nil, map[string]string{
		"X-Admin-Token": "nope",
	})
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	// Correct token + malformed UUID → 400 from the binding layer (expected).
	resp = h.adminRequest(t, http.MethodDelete, "/admin/bookings/not-a-uuid", nil)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}
