// Package repository declares the persistence contracts used by the service
// layer. The v1 binary wires the in-memory implementation under
// internal/repository/memory; a future PostgreSQL/GORM implementation
// satisfies the same interfaces without changes to service or HTTP code.
package repository

import (
	"time"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
)

// SettingsRepo persists the singleton OwnerSettings.
type SettingsRepo interface {
	Get() domain.OwnerSettings
	Update(domain.OwnerSettings) domain.OwnerSettings
}

// EventTypeRepo persists event types, keyed by slug.
//
// Create and UpdateBySlug return domain.ErrConflictSlug if the slug would
// collide with another event type. GetBySlug returns domain.ErrNotFound
// when the slug is not present. ListActive returns only Active==true rows;
// List returns everything in stable display order.
type EventTypeRepo interface {
	List() []domain.EventType
	ListActive() []domain.EventType
	GetBySlug(slug string) (domain.EventType, error)
	GetActiveBySlug(slug string) (domain.EventType, error)
	Create(domain.EventType) (domain.EventType, error)
	UpdateBySlug(slug string, mutate func(*domain.EventType)) (domain.EventType, error)
}

// BookingRepo persists bookings.
//
// CreateWithOverlapCheck atomically rejects any booking whose half-open
// interval overlaps an existing booking — that is the no-cross-event-type-
// overlap invariant from spec §1.3.
//
// ListAll returns every booking (used by slot-generation for overlap
// filtering); ListUpcoming returns only bookings ending after `now`,
// chronologically.
type BookingRepo interface {
	ListAll() []domain.Booking
	ListUpcoming(now time.Time) []domain.Booking
	GetByID(id string) (domain.Booking, error)
	DeleteByID(id string) error
	CreateWithOverlapCheck(domain.Booking) error
}
