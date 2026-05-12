package integration_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

func TestBooking_RejectsSlotInPast(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 5, 11, 9, 0, 0, 0, time.UTC) // 12:00 Moscow
	h := newHarness(t, now)
	seedEventType(t, h, "intro-call", 30)

	body := api.BookingCreate{
		StartTime: mskTime(t, 10, 0), GuestName: "Past", GuestEmail: "past@example.com",
	}
	resp := h.request(t, http.MethodPost, "/event-types/intro-call/bookings", body, nil)
	require.Equal(t, http.StatusConflict, resp.StatusCode)
	var errBody api.Error
	decodeJSON(t, resp, &errBody)
	assert.Equal(t, "slot_in_past", errBody.Code)
}

func TestBooking_RejectsOutsideWorkingHours(t *testing.T) {
	t.Parallel()
	// 03:00 UTC = 06:00 Moscow — before the working day starts but a
	// requested slot at 08:30 Moscow is still in the future, so the past-slot
	// check passes and the request hits the working-hours rule.
	now := time.Date(2026, 5, 11, 3, 0, 0, 0, time.UTC)
	h := newHarness(t, now)
	seedEventType(t, h, "intro-call", 30)

	body := api.BookingCreate{
		StartTime: mskTime(t, 8, 30), GuestName: "Early", GuestEmail: "e@example.com",
	}
	resp := h.request(t, http.MethodPost, "/event-types/intro-call/bookings", body, nil)
	require.Equal(t, http.StatusConflict, resp.StatusCode)
	var errBody api.Error
	decodeJSON(t, resp, &errBody)
	assert.Equal(t, "slot_not_in_working_hours", errBody.Code)
}

func TestBooking_RejectsGridMisalignment(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 5, 11, 6, 0, 0, 0, time.UTC) // 09:00 Moscow
	h := newHarness(t, now)
	seedEventType(t, h, "intro-call", 30)

	// 09:07 Moscow is inside working hours but not on the 30-min grid.
	body := api.BookingCreate{
		StartTime: mskTime(t, 9, 7), GuestName: "Off", GuestEmail: "off@example.com",
	}
	resp := h.request(t, http.MethodPost, "/event-types/intro-call/bookings", body, nil)
	require.Equal(t, http.StatusConflict, resp.StatusCode)
	var errBody api.Error
	decodeJSON(t, resp, &errBody)
	assert.Equal(t, "slot_grid_misaligned", errBody.Code)
}

func TestBooking_RejectsCrossEventTypeOverlap(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 5, 11, 6, 0, 0, 0, time.UTC) // 09:00 Moscow
	h := newHarness(t, now)
	seedEventType(t, h, "deep-dive", 60)
	seedEventType(t, h, "office-hours", 30)

	// First, book 10:00-11:00 on deep-dive.
	first := api.BookingCreate{
		StartTime: mskTime(t, 10, 0), GuestName: "First", GuestEmail: "first@example.com",
	}
	resp := h.request(t, http.MethodPost, "/event-types/deep-dive/bookings", first, nil)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	// Now try to book 10:30-11:00 on office-hours: overlaps the existing 10:00-11:00.
	second := api.BookingCreate{
		StartTime: mskTime(t, 10, 30), GuestName: "Second", GuestEmail: "second@example.com",
	}
	resp = h.request(t, http.MethodPost, "/event-types/office-hours/bookings", second, nil)
	require.Equal(t, http.StatusConflict, resp.StatusCode)
	var errBody api.Error
	decodeJSON(t, resp, &errBody)
	assert.Equal(t, "slot_unavailable", errBody.Code)

	// 09:30 office-hours (09:30-10:00) is allowed: it ends exactly at the
	// overlap boundary, which the half-open rule treats as non-overlapping.
	third := api.BookingCreate{
		StartTime: mskTime(t, 9, 30), GuestName: "Third", GuestEmail: "third@example.com",
	}
	resp = h.request(t, http.MethodPost, "/event-types/office-hours/bookings", third, nil)
	require.Equal(t, http.StatusCreated, resp.StatusCode, "09:30 office-hours ending at 10:00 should NOT conflict with 10:00 deep-dive")
}

func TestBooking_404OnInactive(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 5, 11, 6, 0, 0, 0, time.UTC)
	h := newHarness(t, now)
	seedEventType(t, h, "intro-call", 30)
	inactive := false
	_ = h.adminRequest(t, http.MethodPatch, "/admin/event-types/intro-call", api.EventTypeUpdate{Active: &inactive})

	body := api.BookingCreate{
		StartTime: mskTime(t, 10, 0), GuestName: "X", GuestEmail: "x@example.com",
	}
	resp := h.request(t, http.MethodPost, "/event-types/intro-call/bookings", body, nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestBooking_400OnInvalidEmail(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 5, 11, 6, 0, 0, 0, time.UTC)
	h := newHarness(t, now)
	seedEventType(t, h, "intro-call", 30)

	body := map[string]any{
		"startTime":  mskTime(t, 10, 0).Format(time.RFC3339),
		"guestName":  "X",
		"guestEmail": "not-an-email",
	}
	resp := h.request(t, http.MethodPost, "/event-types/intro-call/bookings", body, nil)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}
