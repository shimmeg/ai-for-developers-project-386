package domain

import "time"

// Clock abstracts time.Now so the service layer can be tested deterministically.
// Production code wires a SystemClock; tests use a fixed-instant fake.
type Clock interface {
	Now() time.Time
}

// SystemClock returns the real wall-clock time in UTC.
type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now().UTC() }

// FixedClock always returns the same instant. Useful for deterministic tests.
type FixedClock struct{ Instant time.Time }

func (c FixedClock) Now() time.Time { return c.Instant }
