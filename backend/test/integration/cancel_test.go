package integration_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

func TestCancel_FreesSlot(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 5, 11, 6, 0, 0, 0, time.UTC)
	h := newHarness(t, now)
	seedEventType(t, h, "intro-call", 30)

	body := api.BookingCreate{
		StartTime: mskTime(t, 10, 0), GuestName: "Jane", GuestEmail: "j@example.com",
	}
	resp := h.request(t, http.MethodPost, "/event-types/intro-call/bookings", body, nil)
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var created api.Booking
	decodeJSON(t, resp, &created)

	resp = h.adminRequest(t, http.MethodDelete, "/admin/bookings/"+created.Id.String(), nil)
	require.Equal(t, http.StatusNoContent, resp.StatusCode)

	// The slot is offered again.
	resp = h.request(t, http.MethodGet, "/event-types/intro-call/slots", nil, nil)
	var picker api.SlotPickerResponse
	decodeJSON(t, resp, &picker)
	loc := mskLoc(t)
	found := false
	for _, s := range picker.Days[0].Slots {
		if s.In(loc).Hour() == 10 && s.In(loc).Minute() == 0 {
			found = true
		}
	}
	assert.True(t, found, "10:00 should be available again after cancel")
}

func TestCancel_404OnUnknown(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	resp := h.adminRequest(t, http.MethodDelete, "/admin/bookings/00000000-0000-0000-0000-000000000000", nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}
