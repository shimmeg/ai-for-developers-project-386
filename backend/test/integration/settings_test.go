package integration_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

func TestSettings_GetReturnsSeedDefaults(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	resp := h.adminRequest(t, http.MethodGet, "/admin/settings", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var got api.OwnerSettings
	decodeJSON(t, resp, &got)
	assert.Equal(t, "Europe/Moscow", got.Timezone)
}

func TestSettings_UpdateRoundTrips(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	var open api.WorkingDay
	require.NoError(t, open.FromOpenDay(api.OpenDay{Status: api.Open, Start: "10:00", End: "19:00"}))
	var closed api.WorkingDay
	require.NoError(t, closed.FromClosedDay(api.ClosedDay{Status: api.ClosedDayStatusClosed}))

	payload := api.OwnerSettings{
		Timezone: "Europe/Moscow",
		WorkingHours: api.WorkingHoursByDay{
			Monday: open, Tuesday: open, Wednesday: open, Thursday: open, Friday: open,
			Saturday: closed, Sunday: closed,
		},
	}
	resp := h.adminRequest(t, http.MethodPut, "/admin/settings", payload)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	resp = h.adminRequest(t, http.MethodGet, "/admin/settings", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var got api.OwnerSettings
	decodeJSON(t, resp, &got)

	mon, err := got.WorkingHours.Monday.AsOpenDay()
	require.NoError(t, err)
	assert.Equal(t, "10:00", mon.Start)
	assert.Equal(t, "19:00", mon.End)
}

func TestSettings_RejectsBadTimezone(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	payload := map[string]any{
		"timezone": "Not/A_Real/Zone",
		"workingHours": map[string]any{
			"monday":    map[string]any{"status": "closed"},
			"tuesday":   map[string]any{"status": "closed"},
			"wednesday": map[string]any{"status": "closed"},
			"thursday":  map[string]any{"status": "closed"},
			"friday":    map[string]any{"status": "closed"},
			"saturday":  map[string]any{"status": "closed"},
			"sunday":    map[string]any{"status": "closed"},
		},
	}
	resp := h.adminRequest(t, http.MethodPut, "/admin/settings", payload)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSettings_RejectsEndBeforeStart(t *testing.T) {
	t.Parallel()
	h := newHarness(t, refNow)
	payload := map[string]any{
		"timezone": "Europe/Moscow",
		"workingHours": map[string]any{
			"monday":    map[string]any{"status": "open", "start": "18:00", "end": "09:00"},
			"tuesday":   map[string]any{"status": "closed"},
			"wednesday": map[string]any{"status": "closed"},
			"thursday":  map[string]any{"status": "closed"},
			"friday":    map[string]any{"status": "closed"},
			"saturday":  map[string]any{"status": "closed"},
			"sunday":    map[string]any{"status": "closed"},
		},
	}
	resp := h.adminRequest(t, http.MethodPut, "/admin/settings", payload)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}
