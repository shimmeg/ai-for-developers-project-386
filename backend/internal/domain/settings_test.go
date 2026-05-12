package domain_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
)

func TestWorkingDay_Validate(t *testing.T) {
	t.Parallel()
	t.Run("closed is valid", func(t *testing.T) {
		assert.NoError(t, domain.WorkingDay{Status: domain.DayClosed}.Validate())
	})
	t.Run("open with end > start", func(t *testing.T) {
		assert.NoError(t, domain.WorkingDay{Status: domain.DayOpen, Start: "09:00", End: "18:00"}.Validate())
	})
	t.Run("open with end == start", func(t *testing.T) {
		assert.Error(t, domain.WorkingDay{Status: domain.DayOpen, Start: "09:00", End: "09:00"}.Validate())
	})
	t.Run("open with end < start", func(t *testing.T) {
		assert.Error(t, domain.WorkingDay{Status: domain.DayOpen, Start: "18:00", End: "09:00"}.Validate())
	})
	t.Run("open with malformed start", func(t *testing.T) {
		assert.Error(t, domain.WorkingDay{Status: domain.DayOpen, Start: "9:00", End: "18:00"}.Validate())
	})
}

func TestOwnerSettings_Validate(t *testing.T) {
	t.Parallel()
	good := domain.DefaultSettings("Europe/Moscow")
	require.NoError(t, good.Validate())

	t.Run("bad timezone", func(t *testing.T) {
		bad := good
		bad.Timezone = "Not/A_Real/Zone"
		assert.Error(t, bad.Validate())
	})

	t.Run("bad weekday entry", func(t *testing.T) {
		bad := good
		bad.WorkingHours.Monday = domain.WorkingDay{Status: domain.DayOpen, Start: "10:00", End: "10:00"}
		assert.Error(t, bad.Validate())
	})
}

func TestParseHHMM(t *testing.T) {
	t.Parallel()
	h, m := domain.ParseHHMM("09:30")
	assert.Equal(t, 9, h)
	assert.Equal(t, 30, m)
}
