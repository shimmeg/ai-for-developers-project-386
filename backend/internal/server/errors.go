package server

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
)

// respondError translates a domain error into the contract's Error envelope
// and writes the corresponding HTTP status. Unknown errors map to 500
// internal_error so they remain visible to the client without leaking
// internals.
func respondError(c *gin.Context, err error) {
	status, code, message := classify(err)
	c.AbortWithStatusJSON(status, api.Error{Code: code, Message: message})
}

func classify(err error) (int, string, string) {
	var verr *domain.ValidationError
	switch {
	case errors.As(err, &verr):
		msg := verr.Message
		if verr.Field != "" {
			msg = verr.Field + ": " + verr.Message
		}
		return http.StatusBadRequest, "bad_request", msg
	case errors.Is(err, domain.ErrNotFound):
		return http.StatusNotFound, "not_found", "The requested resource was not found."
	case errors.Is(err, domain.ErrConflictSlug):
		return http.StatusConflict, "slug_taken", "Another event type already uses this slug."
	case errors.Is(err, domain.ErrConflictSlot):
		return http.StatusConflict, "slot_unavailable", "This slot is no longer available. Please pick a different time."
	case errors.Is(err, domain.ErrSlotInPast):
		return http.StatusConflict, "slot_in_past", "The chosen slot is in the past."
	case errors.Is(err, domain.ErrSlotOutOfWindow):
		return http.StatusConflict, "slot_out_of_window", "The chosen slot is outside the 14-day booking window."
	case errors.Is(err, domain.ErrSlotNotInWorkingHours):
		return http.StatusConflict, "slot_not_in_working_hours", "The chosen slot falls outside the configured working hours."
	case errors.Is(err, domain.ErrSlotGridMisaligned):
		return http.StatusConflict, "slot_grid_misaligned", "The chosen slot does not align to a valid start time for this event type."
	case errors.Is(err, domain.ErrEventTypeInactive):
		return http.StatusConflict, "event_type_inactive", "This event type is no longer accepting bookings."
	default:
		return http.StatusInternalServerError, "internal_error", "An unexpected error occurred. Please try again."
	}
}
