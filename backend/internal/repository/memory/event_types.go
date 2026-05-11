package memory

import (
	"sort"
	"sync"

	"github.com/google/uuid"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
)

// EventTypeRepo is the in-memory implementation of repository.EventTypeRepo.
// Event types are stored in insertion order; lookups are linear in the
// number of event types, which is acceptable for v1 (the spec assumes a
// handful per deployment).
type EventTypeRepo struct {
	mu    sync.RWMutex
	items []domain.EventType
}

func NewEventTypeRepo() *EventTypeRepo {
	return &EventTypeRepo{items: make([]domain.EventType, 0)}
}

func (r *EventTypeRepo) List() []domain.EventType {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]domain.EventType, len(r.items))
	copy(out, r.items)
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out
}

func (r *EventTypeRepo) ListActive() []domain.EventType {
	all := r.List()
	out := make([]domain.EventType, 0, len(all))
	for _, et := range all {
		if et.Active {
			out = append(out, et)
		}
	}
	return out
}

func (r *EventTypeRepo) GetBySlug(slug string) (domain.EventType, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, et := range r.items {
		if et.Slug == slug {
			return et, nil
		}
	}
	return domain.EventType{}, domain.ErrNotFound
}

func (r *EventTypeRepo) GetActiveBySlug(slug string) (domain.EventType, error) {
	et, err := r.GetBySlug(slug)
	if err != nil {
		return domain.EventType{}, err
	}
	if !et.Active {
		return domain.EventType{}, domain.ErrNotFound
	}
	return et, nil
}

func (r *EventTypeRepo) Create(et domain.EventType) (domain.EventType, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, existing := range r.items {
		if existing.Slug == et.Slug {
			return domain.EventType{}, domain.ErrConflictSlug
		}
	}
	if et.ID == "" {
		et.ID = uuid.NewString()
	}
	r.items = append(r.items, et)
	return et, nil
}

// UpdateBySlug applies the mutator to a copy of the event type with the
// given slug, then replaces the stored row. Returns ErrNotFound if no row
// matches; ErrConflictSlug if the mutator changed Slug to one already in use.
func (r *EventTypeRepo) UpdateBySlug(slug string, mutate func(*domain.EventType)) (domain.EventType, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	idx := -1
	for i, et := range r.items {
		if et.Slug == slug {
			idx = i
			break
		}
	}
	if idx == -1 {
		return domain.EventType{}, domain.ErrNotFound
	}
	updated := r.items[idx]
	mutate(&updated)
	if updated.Slug != slug {
		for i, et := range r.items {
			if i != idx && et.Slug == updated.Slug {
				return domain.EventType{}, domain.ErrConflictSlug
			}
		}
	}
	r.items[idx] = updated
	return updated, nil
}
