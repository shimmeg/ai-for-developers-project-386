// Package service contains the application's business logic — validation,
// slot generation, snapshot construction, and orchestration of repository
// calls. Services depend on domain types and repository interfaces only;
// they never touch HTTP or the underlying storage engine directly.
package service

import (
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/repository"
)

// SettingsService exposes read and write operations on the singleton
// OwnerSettings document.
type SettingsService struct {
	repo repository.SettingsRepo
}

func NewSettingsService(repo repository.SettingsRepo) *SettingsService {
	return &SettingsService{repo: repo}
}

func (s *SettingsService) Get() domain.OwnerSettings {
	return s.repo.Get()
}

// Update validates the incoming document and replaces the singleton.
// Returns a domain.ValidationError on bad input.
func (s *SettingsService) Update(next domain.OwnerSettings) (domain.OwnerSettings, error) {
	if err := next.Validate(); err != nil {
		return domain.OwnerSettings{}, err
	}
	return s.repo.Update(next), nil
}
