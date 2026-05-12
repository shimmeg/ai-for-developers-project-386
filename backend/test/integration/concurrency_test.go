package integration_test

import (
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
)

func TestBooking_ConcurrentSubmissions_OneSucceeds(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 5, 11, 6, 0, 0, 0, time.UTC)
	h := newHarness(t, now)
	seedEventType(t, h, "intro-call", 30)

	body := api.BookingCreate{
		StartTime: mskTime(t, 10, 0), GuestName: "R", GuestEmail: "r@example.com",
	}

	const N = 20
	var wg sync.WaitGroup
	var ok, conflict int64
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func() {
			defer wg.Done()
			resp := h.request(t, http.MethodPost, "/event-types/intro-call/bookings", body, nil)
			switch resp.StatusCode {
			case http.StatusCreated:
				atomic.AddInt64(&ok, 1)
			case http.StatusConflict:
				atomic.AddInt64(&conflict, 1)
			}
		}()
	}
	wg.Wait()

	assert.Equal(t, int64(1), ok, "exactly one POST must succeed")
	assert.Equal(t, int64(N-1), conflict, "every other POST must return 409")

	// Verify there is exactly one booking persisted.
	resp := h.adminRequest(t, http.MethodGet, "/admin/bookings", nil)
	var bookings []api.Booking
	decodeJSON(t, resp, &bookings)
	require.Len(t, bookings, 1)
}
