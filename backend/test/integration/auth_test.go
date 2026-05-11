package integration_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

var refNow = time.Date(2026, 5, 11, 7, 0, 0, 0, time.UTC)

func TestAdmin_MissingToken_Returns401(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	resp := h.request(t, http.MethodGet, "/admin/settings", nil, nil)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	var body api.Error
	decodeJSON(t, resp, &body)
	assert.Equal(t, "unauthorized", body.Code)
}

func TestAdmin_WrongToken_Returns401(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	resp := h.request(t, http.MethodGet, "/admin/settings", nil, map[string]string{"X-Admin-Token": "nope"})
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestAdmin_CorrectToken_Returns200(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	resp := h.adminRequest(t, http.MethodGet, "/admin/settings", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestPublicRoute_NoTokenRequired(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	resp := h.request(t, http.MethodGet, "/event-types", nil, nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
