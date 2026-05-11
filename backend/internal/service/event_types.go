package service

import (
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/repository"
)

// EventTypeService wraps EventTypeRepo with validation and snapshot logic.
type EventTypeService struct {
	repo  repository.EventTypeRepo
	clock domain.Clock
}

func NewEventTypeService(repo repository.EventTypeRepo, clock domain.Clock) *EventTypeService {
	return &EventTypeService{repo: repo, clock: clock}
}

// AdminList returns all event types (active and inactive) in display order.
func (s *EventTypeService) AdminList() []domain.EventType {
	return s.repo.List()
}

// AdminGet returns the event type with the given slug (active or inactive).
func (s *EventTypeService) AdminGet(slug string) (domain.EventType, error) {
	if err := domain.ValidateSlug(slug); err != nil {
		return domain.EventType{}, err
	}
	return s.repo.GetBySlug(slug)
}

// EventTypeInput is the validated payload for create.
type EventTypeInput struct {
	Slug            string
	Name            string
	Description     string
	DurationMinutes int
}

// Create validates the input and inserts a new event type with Active=true.
func (s *EventTypeService) Create(in EventTypeInput) (domain.EventType, error) {
	if err := domain.ValidateEventTypeFields(in.Slug, in.Name, in.Description, in.DurationMinutes); err != nil {
		return domain.EventType{}, err
	}
	et := domain.EventType{
		Slug:            in.Slug,
		Name:            in.Name,
		Description:     in.Description,
		DurationMinutes: in.DurationMinutes,
		Active:          true,
		CreatedAt:       s.clock.Now(),
	}
	return s.repo.Create(et)
}

// EventTypePatch is the validated partial-update payload. Any nil pointer
// means "leave unchanged".
type EventTypePatch struct {
	Slug            *string
	Name            *string
	Description     *string
	DurationMinutes *int
	Active          *bool
}

// Update applies the supplied patch to the event type with the given slug.
// Each non-nil field is validated; the underlying repo enforces slug
// uniqueness.
func (s *EventTypeService) Update(slug string, patch EventTypePatch) (domain.EventType, error) {
	if err := domain.ValidateSlug(slug); err != nil {
		return domain.EventType{}, err
	}
	if patch.Slug != nil {
		if err := domain.ValidateSlug(*patch.Slug); err != nil {
			return domain.EventType{}, err
		}
	}
	if patch.Name != nil && *patch.Name == "" {
		return domain.EventType{}, domain.NewValidationError("name", "must not be empty")
	}
	if patch.Description != nil && *patch.Description == "" {
		return domain.EventType{}, domain.NewValidationError("description", "must not be empty")
	}
	if patch.DurationMinutes != nil && *patch.DurationMinutes < 1 {
		return domain.EventType{}, domain.NewValidationError("durationMinutes", "must be >= 1")
	}

	return s.repo.UpdateBySlug(slug, func(et *domain.EventType) {
		if patch.Slug != nil {
			et.Slug = *patch.Slug
		}
		if patch.Name != nil {
			et.Name = *patch.Name
		}
		if patch.Description != nil {
			et.Description = *patch.Description
		}
		if patch.DurationMinutes != nil {
			et.DurationMinutes = *patch.DurationMinutes
		}
		if patch.Active != nil {
			et.Active = *patch.Active
		}
	})
}

// PublicList returns only active event types — used by the guest catalog.
func (s *EventTypeService) PublicList() []domain.EventType {
	return s.repo.ListActive()
}

// PublicGet returns the event type only if it is active. Inactive types are
// reported as ErrNotFound so guests cannot probe for hidden slugs.
func (s *EventTypeService) PublicGet(slug string) (domain.EventType, error) {
	if err := domain.ValidateSlug(slug); err != nil {
		return domain.EventType{}, err
	}
	return s.repo.GetActiveBySlug(slug)
}
