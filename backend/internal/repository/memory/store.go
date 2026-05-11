// Package memory provides an in-memory implementation of the repository
// interfaces declared in internal/repository. Data is lost when the
// process exits — acceptable for v1; the PostgreSQL/GORM implementation
// will swap in behind the same interfaces.
package memory

import "github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"

// Store bundles the three in-memory repositories so callers can hand a
// single value to the service layer.
type Store struct {
	Settings   *SettingsRepo
	EventTypes *EventTypeRepo
	Bookings   *BookingRepo
}

// NewStore seeds an empty store with the supplied default settings.
func NewStore(defaults domain.OwnerSettings) *Store {
	return &Store{
		Settings:   NewSettingsRepo(defaults),
		EventTypes: NewEventTypeRepo(),
		Bookings:   NewBookingRepo(),
	}
}
