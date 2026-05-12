package domain

import (
	"fmt"
	"time"
)

// DayStatus mirrors the contract's union discriminator: a WorkingDay is
// either "open" with start/end wall-clock times or "closed".
type DayStatus string

const (
	DayClosed DayStatus = "closed"
	DayOpen   DayStatus = "open"
)

// WorkingDay represents one weekday's schedule. When Status == DayOpen,
// Start and End are validated HH:MM wall-clock strings with End > Start.
// When Status == DayClosed, Start and End are empty.
type WorkingDay struct {
	Status DayStatus
	Start  string
	End    string
}

// Validate enforces the per-day invariants from spec §2.1: end > start when
// open; whole-minute HH:MM alignment.
func (d WorkingDay) Validate() error {
	switch d.Status {
	case DayClosed:
		return nil
	case DayOpen:
		if err := ValidateHHMM(d.Start); err != nil {
			return fmt.Errorf("start: %w", err)
		}
		if err := ValidateHHMM(d.End); err != nil {
			return fmt.Errorf("end: %w", err)
		}
		sh, sm := ParseHHMM(d.Start)
		eh, em := ParseHHMM(d.End)
		if sh*60+sm >= eh*60+em {
			return fmt.Errorf("end must be strictly greater than start")
		}
		return nil
	default:
		return fmt.Errorf("unknown day status %q", d.Status)
	}
}

// WorkingHours is the weekly schedule with one entry per weekday.
type WorkingHours struct {
	Monday    WorkingDay
	Tuesday   WorkingDay
	Wednesday WorkingDay
	Thursday  WorkingDay
	Friday    WorkingDay
	Saturday  WorkingDay
	Sunday    WorkingDay
}

// ForWeekday returns the WorkingDay configured for the given weekday.
func (w WorkingHours) ForWeekday(wd time.Weekday) WorkingDay {
	switch wd {
	case time.Monday:
		return w.Monday
	case time.Tuesday:
		return w.Tuesday
	case time.Wednesday:
		return w.Wednesday
	case time.Thursday:
		return w.Thursday
	case time.Friday:
		return w.Friday
	case time.Saturday:
		return w.Saturday
	case time.Sunday:
		return w.Sunday
	}
	// Unreachable: time.Weekday has 7 members; switch covers them all.
	return WorkingDay{Status: DayClosed}
}

// Validate checks every weekday entry.
func (w WorkingHours) Validate() error {
	for _, e := range []struct {
		name string
		d    WorkingDay
	}{
		{"monday", w.Monday},
		{"tuesday", w.Tuesday},
		{"wednesday", w.Wednesday},
		{"thursday", w.Thursday},
		{"friday", w.Friday},
		{"saturday", w.Saturday},
		{"sunday", w.Sunday},
	} {
		if err := e.d.Validate(); err != nil {
			return fmt.Errorf("%s: %w", e.name, err)
		}
	}
	return nil
}

// OwnerSettings is the singleton settings document.
type OwnerSettings struct {
	Timezone     string
	WorkingHours WorkingHours
}

// Validate enforces the spec's settings invariants: IANA timezone resolvable
// on this host, every weekday valid.
func (s OwnerSettings) Validate() error {
	if _, err := LoadLocation(s.Timezone); err != nil {
		return NewValidationError("timezone", err.Error())
	}
	if err := s.WorkingHours.Validate(); err != nil {
		return NewValidationError("workingHours", err.Error())
	}
	return nil
}

// DefaultSettings is the initial in-memory document on first boot.
// Mon-Fri 09:00-18:00 / Sat-Sun closed, in the supplied default timezone.
func DefaultSettings(defaultTZ string) OwnerSettings {
	weekday := WorkingDay{Status: DayOpen, Start: "09:00", End: "18:00"}
	closed := WorkingDay{Status: DayClosed}
	return OwnerSettings{
		Timezone: defaultTZ,
		WorkingHours: WorkingHours{
			Monday:    weekday,
			Tuesday:   weekday,
			Wednesday: weekday,
			Thursday:  weekday,
			Friday:    weekday,
			Saturday:  closed,
			Sunday:    closed,
		},
	}
}
