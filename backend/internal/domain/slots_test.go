package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
)

// makeWorkingHours returns Mon-Fri 09:00-18:00 / Sat-Sun closed by default,
// which is convenient when the tests want a "boring" schedule.
func makeWorkingHours() domain.WorkingHours {
	open := domain.WorkingDay{Status: domain.DayOpen, Start: "09:00", End: "18:00"}
	closed := domain.WorkingDay{Status: domain.DayClosed}
	return domain.WorkingHours{
		Monday: open, Tuesday: open, Wednesday: open, Thursday: open, Friday: open,
		Saturday: closed, Sunday: closed,
	}
}

func TestGenerateSlots_AlwaysReturns14Days(t *testing.T) {
	t.Parallel()
	loc, _ := time.LoadLocation("Europe/Moscow")
	res := domain.GenerateSlots(domain.GenerateSlotsInput{
		Timezone:        loc,
		WorkingHours:    makeWorkingHours(),
		DurationMinutes: 30,
		Now:             time.Date(2026, 5, 11, 7, 0, 0, 0, loc),
	})
	assert.Len(t, res.Days, 14)
	assert.True(t, res.WindowEnd.Sub(res.WindowStart) == 13*24*time.Hour)
}

func TestGenerateSlots_ClosedWeekend(t *testing.T) {
	t.Parallel()
	loc, _ := time.LoadLocation("Europe/Moscow")
	res := domain.GenerateSlots(domain.GenerateSlotsInput{
		Timezone:        loc,
		WorkingHours:    makeWorkingHours(),
		DurationMinutes: 30,
		Now:             time.Date(2026, 5, 11, 7, 0, 0, 0, loc), // Monday
	})
	// 14 days starting Monday: indices 5 (Sat) and 6 (Sun), 12 (Sat) and 13 (Sun) closed.
	for _, i := range []int{5, 6, 12, 13} {
		assert.Equal(t, domain.DayPickerClosed, res.Days[i].Status, "day %d (%s) should be closed", i, res.Days[i].Date.Weekday())
		assert.Empty(t, res.Days[i].Slots)
	}
	for _, i := range []int{0, 1, 2, 3, 4, 7, 8, 9, 10, 11} {
		assert.Equal(t, domain.DayPickerOpen, res.Days[i].Status, "day %d (%s) should be open", i, res.Days[i].Date.Weekday())
	}
}

func TestGenerateSlots_PastSlotsExcluded(t *testing.T) {
	t.Parallel()
	loc, _ := time.LoadLocation("Europe/Moscow")
	now := time.Date(2026, 5, 11, 11, 0, 0, 0, loc) // Monday 11:00
	res := domain.GenerateSlots(domain.GenerateSlotsInput{
		Timezone:        loc,
		WorkingHours:    makeWorkingHours(),
		DurationMinutes: 30,
		Now:             now,
	})
	require.Equal(t, domain.DayPickerOpen, res.Days[0].Status)
	for _, slot := range res.Days[0].Slots {
		assert.False(t, slot.Before(now), "slot %s must not be before now %s", slot, now)
	}
	// 11:00 itself is on the grid and equal to now (not before), so it should be present.
	first := res.Days[0].Slots[0]
	assert.True(t, first.Equal(now) || first.After(now))
}

func TestGenerateSlots_GridSpacingEqualsDuration(t *testing.T) {
	t.Parallel()
	loc, _ := time.LoadLocation("Europe/Moscow")
	now := time.Date(2026, 5, 11, 7, 0, 0, 0, loc)
	for _, duration := range []int{15, 30, 60, 90} {
		res := domain.GenerateSlots(domain.GenerateSlotsInput{
			Timezone:        loc,
			WorkingHours:    makeWorkingHours(),
			DurationMinutes: duration,
			Now:             now,
		})
		// First open day; the slots should be exactly D minutes apart.
		day := res.Days[0]
		require.Equal(t, domain.DayPickerOpen, day.Status, "duration %d", duration)
		for i := 1; i < len(day.Slots); i++ {
			diff := day.Slots[i].Sub(day.Slots[i-1])
			assert.Equal(t, time.Duration(duration)*time.Minute, diff, "duration %d, slots %v", duration, day.Slots)
		}
		// Last slot's interval must fit before 18:00.
		last := day.Slots[len(day.Slots)-1]
		assert.True(t, !last.Add(time.Duration(duration)*time.Minute).After(time.Date(2026, 5, 11, 18, 0, 0, 0, loc)))
	}
}

func TestGenerateSlots_CrossEventTypeOverlap(t *testing.T) {
	t.Parallel()
	loc, _ := time.LoadLocation("Europe/Moscow")
	// 60-min booking at 10:00-11:00 should block 30-min slots at 09:30, 10:00, 10:30.
	// 09:00 (09:00-09:30) and 11:00 (11:00-11:30) remain available.
	booking := domain.Booking{
		ID:                      "b1",
		StartTime:               time.Date(2026, 5, 11, 10, 0, 0, 0, loc),
		DurationMinutesSnapshot: 60,
	}
	res := domain.GenerateSlots(domain.GenerateSlotsInput{
		Timezone:        loc,
		WorkingHours:    makeWorkingHours(),
		DurationMinutes: 30,
		Now:             time.Date(2026, 5, 11, 7, 0, 0, 0, loc),
		Bookings:        []domain.Booking{booking},
	})
	day := res.Days[0]
	require.Equal(t, domain.DayPickerOpen, day.Status)

	present := map[string]bool{}
	for _, s := range day.Slots {
		present[s.Format("15:04")] = true
	}
	assert.True(t, present["09:00"], "09:00 should remain")
	assert.True(t, present["09:30"], "09:30 should remain (ends 10:00 — touching, not overlapping)")
	assert.False(t, present["10:00"], "10:00 should be blocked")
	assert.False(t, present["10:30"], "10:30 should be blocked")
	assert.True(t, present["11:00"], "11:00 should be free (booking ended)")
}

func TestGenerateSlots_FullyBookedDayShowsNoAvailability(t *testing.T) {
	t.Parallel()
	loc, _ := time.LoadLocation("Europe/Moscow")
	// Cover the whole Mon working window 09-18 with one giant 540-min booking.
	booking := domain.Booking{
		ID:                      "b1",
		StartTime:               time.Date(2026, 5, 11, 9, 0, 0, 0, loc),
		DurationMinutesSnapshot: 9 * 60,
	}
	res := domain.GenerateSlots(domain.GenerateSlotsInput{
		Timezone:        loc,
		WorkingHours:    makeWorkingHours(),
		DurationMinutes: 30,
		Now:             time.Date(2026, 5, 11, 7, 0, 0, 0, loc),
		Bookings:        []domain.Booking{booking},
	})
	assert.Equal(t, domain.DayPickerNoAvailability, res.Days[0].Status)
	assert.Empty(t, res.Days[0].Slots)
}

func TestIsOnSlotGrid(t *testing.T) {
	t.Parallel()
	loc, _ := time.LoadLocation("Europe/Moscow")
	dayStart := time.Date(2026, 5, 11, 0, 0, 0, 0, loc)
	wd := domain.WorkingDay{Status: domain.DayOpen, Start: "09:00", End: "18:00"}

	on := time.Date(2026, 5, 11, 9, 30, 0, 0, loc)
	assert.True(t, domain.IsOnSlotGrid(on, dayStart, wd, 30, loc))

	off := time.Date(2026, 5, 11, 9, 15, 0, 0, loc)
	assert.False(t, domain.IsOnSlotGrid(off, dayStart, wd, 30, loc))

	// Last slot for 30-min on a 09-18 window is 17:30 (17:30-18:00 fits exactly).
	last := time.Date(2026, 5, 11, 17, 30, 0, 0, loc)
	assert.True(t, domain.IsOnSlotGrid(last, dayStart, wd, 30, loc))

	// 18:00 would extend past close — not on the grid.
	tooLate := time.Date(2026, 5, 11, 18, 0, 0, 0, loc)
	assert.False(t, domain.IsOnSlotGrid(tooLate, dayStart, wd, 30, loc))
}
