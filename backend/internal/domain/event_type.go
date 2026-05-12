package domain

import (
	"regexp"
	"time"
)

var slugRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// EventType is the admin-visible event type. Slug is unique and URL-safe.
type EventType struct {
	ID              string
	Slug            string
	Name            string
	Description     string
	DurationMinutes int
	Active          bool
	CreatedAt       time.Time
}

// ValidateSlug enforces the slug pattern + length bounds from the contract.
func ValidateSlug(s string) error {
	if len(s) == 0 || len(s) > 64 {
		return NewValidationError("slug", "must be 1..64 characters")
	}
	if !slugRe.MatchString(s) {
		return NewValidationError("slug", "must match ^[a-z0-9]+(-[a-z0-9]+)*$")
	}
	return nil
}

// ValidateEventTypeFields enforces all field invariants other than slug uniqueness
// (which is repository-enforced).
func ValidateEventTypeFields(slug, name, description string, durationMinutes int) error {
	if err := ValidateSlug(slug); err != nil {
		return err
	}
	if name == "" {
		return NewValidationError("name", "must not be empty")
	}
	if description == "" {
		return NewValidationError("description", "must not be empty")
	}
	if durationMinutes < 1 {
		return NewValidationError("durationMinutes", "must be >= 1")
	}
	return nil
}

// DefaultEventTypes is the seed catalog the service uses on first boot
// when the store is empty, so guests landing on the public URL never see
// a blank catalog. The in-memory store is wiped on every restart, so on
// Render free-plan cold spin-ups these reappear automatically; once the
// Postgres swap-in lands, the seed step should run only when the table
// is empty (same condition as today).
//
// Slugs and copy match the manually-created event types on the live
// Render deployment so a cold restart preserves the user-visible state.
func DefaultEventTypes(now time.Time) []EventType {
	return []EventType{
		{
			Slug:            "30-minutes-meeting",
			Name:            "30 Minutes meeting",
			Description:     "A focused half-hour conversation. Bring questions, demos, or a topic you want to dig into.",
			DurationMinutes: 30,
			Active:          true,
			CreatedAt:       now,
		},
		{
			Slug:            "15-minutes-meeting",
			Name:            "15 Minutes meeting",
			Description:     "A quick intro chat — good for first contact, sanity checks, or a short follow-up.",
			DurationMinutes: 15,
			Active:          true,
			CreatedAt:       now.Add(time.Millisecond),
		},
	}
}
