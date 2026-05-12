package domain

import (
	"fmt"
	"regexp"
	"strconv"
	"time"
)

var hhmmRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

// ValidateHHMM returns nil iff s is "HH:MM" (24h, no seconds).
func ValidateHHMM(s string) error {
	if !hhmmRe.MatchString(s) {
		return fmt.Errorf("must be HH:MM (24h)")
	}
	return nil
}

// ParseHHMM returns the (hour, minute) pair parsed from a validated HH:MM string.
// It panics if s is not HH:MM — callers must validate first.
func ParseHHMM(s string) (int, int) {
	h, _ := strconv.Atoi(s[:2])
	m, _ := strconv.Atoi(s[3:])
	return h, m
}

// LoadLocation wraps time.LoadLocation so callers can rely on a single import.
// Returns an error if name is not a valid IANA timezone on the host system.
func LoadLocation(name string) (*time.Location, error) {
	if name == "" {
		return nil, fmt.Errorf("timezone must not be empty")
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return nil, fmt.Errorf("invalid IANA timezone %q: %w", name, err)
	}
	return loc, nil
}

// StartOfDayInTZ returns the instant that is 00:00:00 in loc on the same
// calendar day as t (when t is viewed in loc).
func StartOfDayInTZ(t time.Time, loc *time.Location) time.Time {
	tInLoc := t.In(loc)
	y, m, d := tInLoc.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, loc)
}

// WallClockInTZ returns the absolute instant at hour:minute on the calendar
// date of day (interpreted in loc).
func WallClockInTZ(day time.Time, hour, minute int, loc *time.Location) time.Time {
	dayInLoc := day.In(loc)
	y, m, d := dayInLoc.Date()
	return time.Date(y, m, d, hour, minute, 0, 0, loc)
}

// FormatOffsetISO renders t in loc as "2006-01-02T15:04:05-07:00" (RFC 3339
// without sub-second precision). The contract uses this format throughout.
func FormatOffsetISO(t time.Time, loc *time.Location) string {
	return t.In(loc).Format("2006-01-02T15:04:05-07:00")
}

// FormatISODate renders t in loc as YYYY-MM-DD.
func FormatISODate(t time.Time, loc *time.Location) string {
	return t.In(loc).Format("2006-01-02")
}
