package memory_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/repository/memory"
)

func TestEventTypeRepo_CreateAndUniqueSlug(t *testing.T) {
	t.Parallel()
	r := memory.NewEventTypeRepo()
	first, err := r.Create(domain.EventType{Slug: "intro", Name: "Intro", Description: "d", DurationMinutes: 30, Active: true, CreatedAt: time.Now()})
	require.NoError(t, err)
	assert.NotEmpty(t, first.ID)

	_, err = r.Create(domain.EventType{Slug: "intro", Name: "Other", Description: "d", DurationMinutes: 30, Active: true, CreatedAt: time.Now()})
	assert.ErrorIs(t, err, domain.ErrConflictSlug)
}

func TestEventTypeRepo_UpdateBySlug_SlugRename(t *testing.T) {
	t.Parallel()
	r := memory.NewEventTypeRepo()
	_, err := r.Create(domain.EventType{Slug: "a", Name: "A", Description: "d", DurationMinutes: 30, Active: true, CreatedAt: time.Now()})
	require.NoError(t, err)
	_, err = r.Create(domain.EventType{Slug: "b", Name: "B", Description: "d", DurationMinutes: 30, Active: true, CreatedAt: time.Now().Add(time.Second)})
	require.NoError(t, err)

	// Renaming a -> b should fail.
	_, err = r.UpdateBySlug("a", func(et *domain.EventType) { et.Slug = "b" })
	assert.ErrorIs(t, err, domain.ErrConflictSlug)

	// Renaming a -> c should succeed.
	out, err := r.UpdateBySlug("a", func(et *domain.EventType) { et.Slug = "c" })
	require.NoError(t, err)
	assert.Equal(t, "c", out.Slug)
}

func TestEventTypeRepo_ListActive(t *testing.T) {
	t.Parallel()
	r := memory.NewEventTypeRepo()
	now := time.Now()
	_, _ = r.Create(domain.EventType{Slug: "active", Name: "A", Description: "d", DurationMinutes: 30, Active: true, CreatedAt: now})
	_, _ = r.Create(domain.EventType{Slug: "inactive", Name: "I", Description: "d", DurationMinutes: 30, Active: false, CreatedAt: now.Add(time.Second)})

	all := r.List()
	assert.Len(t, all, 2)
	active := r.ListActive()
	require.Len(t, active, 1)
	assert.Equal(t, "active", active[0].Slug)
}

func TestEventTypeRepo_GetActiveBySlug_HidesInactive(t *testing.T) {
	t.Parallel()
	r := memory.NewEventTypeRepo()
	_, _ = r.Create(domain.EventType{Slug: "hidden", Name: "H", Description: "d", DurationMinutes: 30, Active: false, CreatedAt: time.Now()})
	_, err := r.GetActiveBySlug("hidden")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}
