package integration_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/repository/memory"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/server"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/service"
)

const testAdminToken = "test-admin-token-1234"

type harness struct {
	server *httptest.Server
	store  *memory.Store
	clock  *settableClock
}

type settableClock struct{ now time.Time }

func (c *settableClock) Now() time.Time { return c.now }

// newHarness boots a fresh in-memory backend with the given clock instant.
// The default settings use Europe/Moscow with Mon–Fri 09:00–18:00 so tests
// don't have to seed working hours unless they want a specific schedule.
func newHarness(t *testing.T, now time.Time) *harness {
	t.Helper()
	gin.SetMode(gin.TestMode)
	store := memory.NewStore(domain.OwnerSettings{
		Timezone: "Europe/Moscow",
		WorkingHours: domain.WorkingHours{
			Monday:    domain.WorkingDay{Status: domain.DayOpen, Start: "09:00", End: "18:00"},
			Tuesday:   domain.WorkingDay{Status: domain.DayOpen, Start: "09:00", End: "18:00"},
			Wednesday: domain.WorkingDay{Status: domain.DayOpen, Start: "09:00", End: "18:00"},
			Thursday:  domain.WorkingDay{Status: domain.DayOpen, Start: "09:00", End: "18:00"},
			Friday:    domain.WorkingDay{Status: domain.DayOpen, Start: "09:00", End: "18:00"},
			Saturday:  domain.WorkingDay{Status: domain.DayClosed},
			Sunday:    domain.WorkingDay{Status: domain.DayClosed},
		},
	})
	clock := &settableClock{now: now}

	srv := server.New(
		service.NewSettingsService(store.Settings),
		service.NewEventTypeService(store.EventTypes, clock),
		service.NewBookingService(store.Settings, store.EventTypes, store.Bookings, clock),
	)
	engine := server.BuildEngine(srv, testAdminToken, "http://localhost:5173", "")

	ts := httptest.NewServer(engine)
	t.Cleanup(ts.Close)
	return &harness{server: ts, store: store, clock: clock}
}

func (h *harness) URL(path string) string { return h.server.URL + path }

func (h *harness) request(t *testing.T, method, path string, body any, headers map[string]string) *http.Response {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, h.URL(path), reader)
	require.NoError(t, err)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })
	return resp
}

func (h *harness) adminRequest(t *testing.T, method, path string, body any) *http.Response {
	t.Helper()
	return h.request(t, method, path, body, map[string]string{"X-Admin-Token": testAdminToken})
}

func decodeJSON(t *testing.T, resp *http.Response, out any) {
	t.Helper()
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(raw, out), "raw body: %s", string(raw))
}
