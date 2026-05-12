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
