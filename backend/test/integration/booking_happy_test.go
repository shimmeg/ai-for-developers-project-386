package integration_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

func mskTime(t *testing.T, hour, minute int) time.Time {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Moscow")
	require.NoError(t, err)
	return time.Date(2026, 5, 11, hour, minute, 0, 0, loc)
}

func TestBooking_HappyPath(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 5, 11, 6, 0, 0, 0, time.UTC) // 09:00 Moscow — start-of-working-day
	h := newHarness(t, now)
	seedEventType(t, h, "intro-call", 30)

	body := api.BookingCreate{
		StartTime:  mskTime(t, 10, 0),
		GuestName:  "Jane Doe",
		GuestEmail: "jane.doe@example.com",
	}
	resp := h.request(t, http.MethodPost, "/event-types/intro-call/bookings", body, nil)
	require.Equal(t, http.StatusCreated, resp.StatusCode, "body must be 201")

	var booking api.Booking
	decodeJSON(t, resp, &booking)
	assert.Equal(t, "intro-call", booking.EventTypeSlug)
	assert.Equal(t, "Jane Doe", booking.GuestName)
	assert.EqualValues(t, 30, booking.DurationMinutesSnapshot)

	// Slot picker no longer offers 10:00 specifically. 10:30 may still be
	// offered because 10:30–11:00 does not overlap [10:00, 10:30).
	resp = h.request(t, http.MethodGet, "/event-types/intro-call/slots", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var picker api.SlotPickerResponse
	decodeJSON(t, resp, &picker)
	for _, slot := range picker.Days[0].Slots {
		inLoc := slot.In(mskLoc(t))
		assert.False(t, inLoc.Hour() == 10 && inLoc.Minute() == 0, "10:00 should be gone, got %s", slot)
	}

	// Admin sees the booking in /admin/bookings.
	resp = h.adminRequest(t, http.MethodGet, "/admin/bookings", nil)
	var bookings []api.Booking
	decodeJSON(t, resp, &bookings)
	require.Len(t, bookings, 1)
	assert.Equal(t, booking.Id, bookings[0].Id)
}

func mskLoc(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Moscow")
	require.NoError(t, err)
	return loc
}
