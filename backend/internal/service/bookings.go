package service

import (
	"errors"
	"time"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/repository"
)

// BookingService coordinates booking creation, listing and cancellation.
// CreatePublic is the hot path that enforces the cross-event-type
// non-overlap invariant via repository.BookingRepo.CreateWithOverlapCheck.
type BookingService struct {
	settings   repository.SettingsRepo
	eventTypes repository.EventTypeRepo
	bookings   repository.BookingRepo
	clock      domain.Clock
}

func NewBookingService(
	settings repository.SettingsRepo,
	eventTypes repository.EventTypeRepo,
	bookings repository.BookingRepo,
	clock domain.Clock,
) *BookingService {
	return &BookingService{
		settings:   settings,
		eventTypes: eventTypes,
		bookings:   bookings,
		clock:      clock,
	}
}

// AdminListUpcoming returns every booking ending after "now" (across all
// event types), sorted by start time ascending. Past bookings stay in the
// store but are not surfaced in v1 (spec §2.3).
func (s *BookingService) AdminListUpcoming() []domain.Booking {
	return s.bookings.ListUpcoming(s.clock.Now())
}

// Cancel removes the booking with the given ID. Returns ErrNotFound if no
// such booking exists.
func (s *BookingService) Cancel(id string) error {
	return s.bookings.DeleteByID(id)
}

// SlotPicker is the slot-picker response for one event type.
type SlotPicker struct {
	Timezone     string
	Location     *time.Location
	WindowStart  time.Time
	WindowEnd    time.Time
	Days         []domain.DaySlot
	DurationMins int
}

// PublicSlots produces the 14-day slot picker for an event type. The picker
// reflects the current settings, current bookings and the wall-clock "now".
func (s *BookingService) PublicSlots(slug string) (SlotPicker, error) {
	if err := domain.ValidateSlug(slug); err != nil {
		return SlotPicker{}, err
	}
	et, err := s.eventTypes.GetActiveBySlug(slug)
	if err != nil {
		return SlotPicker{}, err
	}
	settings := s.settings.Get()
	loc, err := domain.LoadLocation(settings.Timezone)
	if err != nil {
		return SlotPicker{}, err
	}
	now := s.clock.Now().In(loc)
	result := domain.GenerateSlots(domain.GenerateSlotsInput{
		Timezone:        loc,
		WorkingHours:    settings.WorkingHours,
		DurationMinutes: et.DurationMinutes,
		Now:             now,
		Bookings:        s.bookings.ListAll(),
	})
	return SlotPicker{
		Timezone:     settings.Timezone,
		Location:     loc,
		WindowStart:  result.WindowStart,
		WindowEnd:    result.WindowEnd,
		Days:         result.Days,
		DurationMins: et.DurationMinutes,
	}, nil
}

// CreatePublic is the booking submission hot path. It re-validates the
// requested startTime against current settings and the current event type,
// snapshots the event type fields into the new booking, and inserts via
// CreateWithOverlapCheck. Returns one of the typed domain errors mapped at
// the HTTP boundary to specific 400/404/409 codes.
func (s *BookingService) CreatePublic(slug string, in domain.BookingInput) (domain.Booking, error) {
	if err := domain.ValidateSlug(slug); err != nil {
		return domain.Booking{}, err
	}
	if in.GuestName == "" {
		return domain.Booking{}, domain.NewValidationError("guestName", "must not be empty")
	}
	if in.GuestEmail == "" {
		return domain.Booking{}, domain.NewValidationError("guestEmail", "must not be empty")
	}
	if in.StartTime.IsZero() {
		return domain.Booking{}, domain.NewValidationError("startTime", "must not be empty")
	}

	et, err := s.eventTypes.GetActiveBySlug(slug)
	if err != nil {
		return domain.Booking{}, err
	}

	settings := s.settings.Get()
	loc, err := domain.LoadLocation(settings.Timezone)
	if err != nil {
		return domain.Booking{}, err
	}

	now := s.clock.Now()
	requested := in.StartTime

	// Slot must not be in the past.
	if requested.Before(now) {
		return domain.Booking{}, domain.ErrSlotInPast
	}

	// Slot must fall inside the 14-day booking window.
	today := domain.StartOfDayInTZ(now, loc)
	windowEndExclusive := today.AddDate(0, 0, 14)
	if !requested.Before(windowEndExclusive) {
		return domain.Booking{}, domain.ErrSlotOutOfWindow
	}
	if requested.Before(today) {
		return domain.Booking{}, domain.ErrSlotOutOfWindow
	}

	// Slot's wall-clock weekday must be open per current settings.
	dayStart := domain.StartOfDayInTZ(requested, loc)
	wd := settings.WorkingHours.ForWeekday(dayStart.In(loc).Weekday())
	if wd.Status == domain.DayClosed {
		return domain.Booking{}, domain.ErrSlotNotInWorkingHours
	}

	// Slot must align to the per-event-type grid and fit before close.
	if !domain.IsOnSlotGrid(requested, dayStart, wd, et.DurationMinutes, loc) {
		// Distinguish "outside working hours" from "misaligned grid": if the
		// wall-clock is inside [open, close - duration], the start is on the
		// grid line set by openAt + k*D — failure here means misalignment.
		// If it's outside that window, report not_in_working_hours instead.
		startH, startM := domain.ParseHHMM(wd.Start)
		endH, endM := domain.ParseHHMM(wd.End)
		openAt := domain.WallClockInTZ(dayStart, startH, startM, loc)
		closeAt := domain.WallClockInTZ(dayStart, endH, endM, loc)
		latestSlotStart := closeAt.Add(-time.Duration(et.DurationMinutes) * time.Minute)
		if requested.Before(openAt) || requested.After(latestSlotStart) {
			return domain.Booking{}, domain.ErrSlotNotInWorkingHours
		}
		return domain.Booking{}, domain.ErrSlotGridMisaligned
	}

	booking := domain.NewBooking(et, in, now.UTC())
	if err := s.bookings.CreateWithOverlapCheck(booking); err != nil {
		if errors.Is(err, domain.ErrConflictSlot) {
			return domain.Booking{}, domain.ErrConflictSlot
		}
		return domain.Booking{}, err
	}
	return booking, nil
}
