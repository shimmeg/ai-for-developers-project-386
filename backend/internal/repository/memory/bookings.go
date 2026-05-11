package memory

import (
	"sort"
	"sync"
	"time"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
)

// BookingRepo is the in-memory implementation of repository.BookingRepo.
//
// The single sync.RWMutex protects the items slice. CreateWithOverlapCheck
// runs the overlap test AND the insert under one write lock, so under N
// concurrent identical submissions exactly one succeeds and the rest get
// domain.ErrConflictSlot (spec §4.5).
type BookingRepo struct {
	mu    sync.RWMutex
	items []domain.Booking
}

func NewBookingRepo() *BookingRepo {
	return &BookingRepo{items: make([]domain.Booking, 0)}
}

func (r *BookingRepo) ListAll() []domain.Booking {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]domain.Booking, len(r.items))
	copy(out, r.items)
	return out
}

func (r *BookingRepo) ListUpcoming(now time.Time) []domain.Booking {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]domain.Booking, 0, len(r.items))
	for _, b := range r.items {
		if b.Interval().End.After(now) {
			out = append(out, b)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].StartTime.Before(out[j].StartTime)
	})
	return out
}

func (r *BookingRepo) GetByID(id string) (domain.Booking, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, b := range r.items {
		if b.ID == id {
			return b, nil
		}
	}
	return domain.Booking{}, domain.ErrNotFound
}

func (r *BookingRepo) DeleteByID(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i, b := range r.items {
		if b.ID == id {
			r.items = append(r.items[:i], r.items[i+1:]...)
			return nil
		}
	}
	return domain.ErrNotFound
}

// CreateWithOverlapCheck inserts b iff no existing booking's interval
// overlaps b.Interval(). The check and the insert happen under the same
// write lock — concurrent identical submissions cannot both succeed.
func (r *BookingRepo) CreateWithOverlapCheck(b domain.Booking) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	candidate := b.Interval()
	for _, existing := range r.items {
		if domain.Overlaps(candidate, existing.Interval()) {
			return domain.ErrConflictSlot
		}
	}
	r.items = append(r.items, b)
	return nil
}
