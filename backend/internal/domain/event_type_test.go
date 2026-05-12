package domain_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
)

func TestValidateSlug(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in      string
		wantErr bool
	}{
		{"intro-call", false},
		{"a", false},
		{"a-b-c", false},
		{"abc123", false},
		{"", true},
		{"-leading", true},
		{"trailing-", true},
		{"UPPER", true},
		{"two--hyphens", true},
		{"with space", true},
		{"a/b", true},
	}
	for _, tc := range cases {
		err := domain.ValidateSlug(tc.in)
		if tc.wantErr {
			assert.Error(t, err, "slug %q should be invalid", tc.in)
		} else {
			assert.NoError(t, err, "slug %q should be valid", tc.in)
		}
	}
}

func TestValidateEventTypeFields(t *testing.T) {
	t.Parallel()
	t.Run("valid", func(t *testing.T) {
		assert.NoError(t, domain.ValidateEventTypeFields("intro", "Intro", "desc", 30))
	})
	t.Run("empty name", func(t *testing.T) {
		assert.Error(t, domain.ValidateEventTypeFields("intro", "", "desc", 30))
	})
	t.Run("empty description", func(t *testing.T) {
		assert.Error(t, domain.ValidateEventTypeFields("intro", "Intro", "", 30))
	})
	t.Run("zero duration", func(t *testing.T) {
		assert.Error(t, domain.ValidateEventTypeFields("intro", "Intro", "desc", 0))
	})
	t.Run("negative duration", func(t *testing.T) {
		assert.Error(t, domain.ValidateEventTypeFields("intro", "Intro", "desc", -1))
	})
}
