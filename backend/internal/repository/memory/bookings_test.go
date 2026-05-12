package memory_test

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/repository/memory"
)

func mkBooking(start time.Time, dur int) domain.Booking {
	return domain.Booking{
		ID:                      "irrelevant",
		StartTime:               start,
		DurationMinutesSnapshot: dur,
	}
}

func TestBookingRepo_CreateWithOverlapCheck_RejectsOverlap(t *testing.T) {
	t.Parallel()
	r := memory.NewBookingRepo()
	base := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	require.NoError(t, r.CreateWithOverlapCheck(mkBooking(base, 60)))

	// Identical start: overlap.
	err := r.CreateWithOverlapCheck(mkBooking(base, 30))
	assert.ErrorIs(t, err, domain.ErrConflictSlot)

	// Cross-duration overlap.
	err = r.CreateWithOverlapCheck(mkBooking(base.Add(30*time.Minute), 60))
	assert.ErrorIs(t, err, domain.ErrConflictSlot)

	// Touching at boundary (10:00+60 = 11:00 == new 11:00 start): allowed.
	require.NoError(t, r.CreateWithOverlapCheck(mkBooking(base.Add(60*time.Minute), 30)))
}

func TestBookingRepo_CreateWithOverlapCheck_Concurrent(t *testing.T) {
	t.Parallel()
	r := memory.NewBookingRepo()
	const N = 50
	base := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)

	var wg sync.WaitGroup
	var ok, conflict int64
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := r.CreateWithOverlapCheck(mkBooking(base, 30))
			switch {
			case err == nil:
				atomic.AddInt64(&ok, 1)
			case errors.Is(err, domain.ErrConflictSlot):
				atomic.AddInt64(&conflict, 1)
			}
		}()
	}
	wg.Wait()
	assert.Equal(t, int64(1), ok, "exactly one goroutine must succeed")
	assert.Equal(t, int64(N-1), conflict, "every other goroutine must observe ErrConflictSlot")
	assert.Len(t, r.ListAll(), 1, "exactly one booking persisted")
}

func TestBookingRepo_DeleteAndUpcoming(t *testing.T) {
	t.Parallel()
	r := memory.NewBookingRepo()
	now := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	past := domain.Booking{ID: "past", StartTime: now.Add(-2 * time.Hour), DurationMinutesSnapshot: 30}
	upcoming := domain.Booking{ID: "u1", StartTime: now.Add(2 * time.Hour), DurationMinutesSnapshot: 30}
	require.NoError(t, r.CreateWithOverlapCheck(past))
	require.NoError(t, r.CreateWithOverlapCheck(upcoming))

	got := r.ListUpcoming(now)
	require.Len(t, got, 1)
	assert.Equal(t, "u1", got[0].ID)

	require.NoError(t, r.DeleteByID("u1"))
	assert.Len(t, r.ListUpcoming(now), 0)
	assert.ErrorIs(t, r.DeleteByID("does-not-exist"), domain.ErrNotFound)
}
