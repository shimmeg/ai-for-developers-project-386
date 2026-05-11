package integration_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

func seedEventType(t *testing.T, h *harness, slug string, durationMinutes int32) {
	t.Helper()
	resp := h.adminRequest(t, http.MethodPost, "/admin/event-types", api.EventTypeCreate{
		Slug: slug, Name: slug, Description: slug, DurationMinutes: durationMinutes,
	})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestPublicSlots_ShapeAndStatuses(t *testing.T) {
	t.Parallel()
	// Reference: Monday 2026-05-11 07:00 UTC = 10:00 Europe/Moscow (UTC+3).
	now := time.Date(2026, 5, 11, 7, 0, 0, 0, time.UTC)
	h := newHarness(t, now)
	seedEventType(t, h, "intro-call", 30)

	resp := h.request(t, http.MethodGet, "/event-types/intro-call/slots", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var picker api.SlotPickerResponse
	decodeJSON(t, resp, &picker)
	assert.Equal(t, "Europe/Moscow", picker.Timezone)
	assert.Len(t, picker.Days, 14)
	assert.Equal(t, "2026-05-11", picker.WindowStart.String())
	assert.Equal(t, "2026-05-24", picker.WindowEnd.String())

	// Saturday (i=5, 2026-05-16) and Sunday (i=6, 2026-05-17) are closed.
	assert.Equal(t, api.DayStatusClosed, picker.Days[5].Status)
	assert.Equal(t, api.DayStatusClosed, picker.Days[6].Status)

	// Today (Monday 10:00 Moscow) has slots from 10:00 onwards.
	require.Equal(t, api.DayStatusOpen, picker.Days[0].Status)
	first := picker.Days[0].Slots[0]
	loc, _ := time.LoadLocation("Europe/Moscow")
	assert.Equal(t, 10, first.In(loc).Hour())
	assert.Equal(t, 0, first.In(loc).Minute())
}

func TestPublicSlots_404OnUnknownOrInactive(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	resp := h.request(t, http.MethodGet, "/event-types/no-such-thing/slots", nil, nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)

	seedEventType(t, h, "intro-call", 30)
	inactive := false
	_ = h.adminRequest(t, http.MethodPatch, "/admin/event-types/intro-call", api.EventTypeUpdate{Active: &inactive})
	resp = h.request(t, http.MethodGet, "/event-types/intro-call/slots", nil, nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}
