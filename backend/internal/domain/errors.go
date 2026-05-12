package domain

import "errors"

// Sentinel errors mapped at the HTTP boundary to status codes and stable
// codes from the contract's Error envelope.
var (
	ErrNotFound              = errors.New("not_found")
	ErrConflictSlug          = errors.New("slug_taken")
	ErrConflictSlot          = errors.New("slot_unavailable")
	ErrSlotInPast            = errors.New("slot_in_past")
	ErrSlotOutOfWindow       = errors.New("slot_out_of_window")
	ErrSlotNotInWorkingHours = errors.New("slot_not_in_working_hours")
	ErrSlotGridMisaligned    = errors.New("slot_grid_misaligned")
	ErrEventTypeInactive     = errors.New("event_type_inactive")
)

// ValidationError carries a per-field validation failure. The HTTP layer
// reports it as a 400 with the contract's bad_request code.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	if e.Field == "" {
		return e.Message
	}
	return e.Field + ": " + e.Message
}

func NewValidationError(field, message string) *ValidationError {
	return &ValidationError{Field: field, Message: message}
}
