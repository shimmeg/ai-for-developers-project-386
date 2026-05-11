package integration_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

func TestEventTypes_CRUDLifecycle(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)

	// Create.
	create := api.EventTypeCreate{
		Slug: "intro-call", Name: "Intro call", Description: "Short chat", DurationMinutes: 30,
	}
	resp := h.adminRequest(t, http.MethodPost, "/admin/event-types", create)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var et api.EventType
	decodeJSON(t, resp, &et)
	assert.Equal(t, "intro-call", et.Slug)
	assert.True(t, et.Active)

	// Duplicate slug → 409.
	resp = h.adminRequest(t, http.MethodPost, "/admin/event-types", create)
	require.Equal(t, http.StatusConflict, resp.StatusCode)
	var conflict api.Error
	decodeJSON(t, resp, &conflict)
	assert.Equal(t, "slug_taken", conflict.Code)

	// Get.
	resp = h.adminRequest(t, http.MethodGet, "/admin/event-types/intro-call", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Patch — toggle inactive.
	inactive := false
	patch := api.EventTypeUpdate{Active: &inactive}
	resp = h.adminRequest(t, http.MethodPatch, "/admin/event-types/intro-call", patch)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	decodeJSON(t, resp, &et)
	assert.False(t, et.Active)

	// 404 for unknown slug.
	resp = h.adminRequest(t, http.MethodGet, "/admin/event-types/does-not-exist", nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestEventTypes_PublicHidesInactive(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)

	visible := api.EventTypeCreate{Slug: "visible", Name: "V", Description: "d", DurationMinutes: 30}
	hidden := api.EventTypeCreate{Slug: "hidden", Name: "H", Description: "d", DurationMinutes: 30}
	_ = h.adminRequest(t, http.MethodPost, "/admin/event-types", visible)
	_ = h.adminRequest(t, http.MethodPost, "/admin/event-types", hidden)
	inactive := false
	_ = h.adminRequest(t, http.MethodPatch, "/admin/event-types/hidden", api.EventTypeUpdate{Active: &inactive})

	// Public catalog returns only visible.
	resp := h.request(t, http.MethodGet, "/event-types", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var catalog api.CatalogResponse
	decodeJSON(t, resp, &catalog)
	require.Len(t, catalog.EventTypes, 1)
	assert.Equal(t, "visible", catalog.EventTypes[0].Slug)

	// Public GET on hidden → 404.
	resp = h.request(t, http.MethodGet, "/event-types/hidden", nil, nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)

	// Admin still sees both.
	resp = h.adminRequest(t, http.MethodGet, "/admin/event-types", nil)
	var admin []api.EventType
	decodeJSON(t, resp, &admin)
	assert.Len(t, admin, 2)
}

func TestEventTypes_InvalidSlugRejected(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	resp := h.adminRequest(t, http.MethodPost, "/admin/event-types", api.EventTypeCreate{
		Slug: "Bad Slug", Name: "x", Description: "y", DurationMinutes: 15,
	})
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}
