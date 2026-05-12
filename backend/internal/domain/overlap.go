package domain

import "time"

// Interval is the half-open time interval [Start, End).
type Interval struct {
	Start time.Time
	End   time.Time
}

// Overlaps reports whether two half-open intervals share any instant.
// Per the spec §4.3: [a1,a2) and [b1,b2) overlap iff a1 < b2 AND b1 < a2.
// Intervals that merely touch at the boundary (a.End == b.Start) do NOT overlap.
func Overlaps(a, b Interval) bool {
	return a.Start.Before(b.End) && b.Start.Before(a.End)
}

// IntervalFor returns the half-open [start, start + duration) interval for a booking.
func IntervalFor(start time.Time, durationMinutes int) Interval {
	return Interval{
		Start: start,
		End:   start.Add(time.Duration(durationMinutes) * time.Minute),
	}
}
