package domain

import (
	"time"

	"github.com/google/uuid"
)

// Booking is a snapshotted booking record. EventTypeID is the FK back to the
// event type; the slug, name and duration fields are snapshots taken at
// booking time (spec §1.2: "The duration snapshot is required so future
// edits to an event type's duration cannot retroactively change history.").
type Booking struct {
	ID                      string
	EventTypeID             string
	EventTypeSlugSnapshot   string
	EventTypeNameSnapshot   string
	StartTime               time.Time
	DurationMinutesSnapshot int
	GuestName               string
	GuestEmail              string
	GuestNotes              *string
	CreatedAt               time.Time
}

// BookingInput is the guest-supplied payload for a new booking.
type BookingInput struct {
	StartTime  time.Time
	GuestName  string
	GuestEmail string
	GuestNotes *string
}

// NewBooking constructs a fully-snapshotted booking from the event type's
// current state plus the guest input. The caller is responsible for having
// validated the slot before calling.
func NewBooking(et EventType, in BookingInput, now time.Time) Booking {
	return Booking{
		ID:                      uuid.NewString(),
		EventTypeID:             et.ID,
		EventTypeSlugSnapshot:   et.Slug,
		EventTypeNameSnapshot:   et.Name,
		StartTime:               in.StartTime,
		DurationMinutesSnapshot: et.DurationMinutes,
		GuestName:               in.GuestName,
		GuestEmail:              in.GuestEmail,
		GuestNotes:              in.GuestNotes,
		CreatedAt:               now,
	}
}

// Interval returns the booking's half-open time interval.
func (b Booking) Interval() Interval {
	return IntervalFor(b.StartTime, b.DurationMinutesSnapshot)
}
