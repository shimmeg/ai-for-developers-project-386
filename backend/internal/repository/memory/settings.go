package memory

import (
	"sync"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
)

// SettingsRepo is the in-memory implementation of repository.SettingsRepo.
// The OwnerSettings document is a singleton seeded with sensible defaults
// on construction; Update replaces it atomically under a write lock.
type SettingsRepo struct {
	mu       sync.RWMutex
	settings domain.OwnerSettings
}

func NewSettingsRepo(initial domain.OwnerSettings) *SettingsRepo {
	return &SettingsRepo{settings: initial}
}

func (r *SettingsRepo) Get() domain.OwnerSettings {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.settings
}

func (r *SettingsRepo) Update(next domain.OwnerSettings) domain.OwnerSettings {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.settings = next
	return r.settings
}
