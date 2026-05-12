package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
)

func TestOverlaps_HalfOpenSemantics(t *testing.T) {
	t.Parallel()
	base := time.Date(2026, 5, 11, 9, 0, 0, 0, time.UTC)
	mk := func(startMin, durationMin int) domain.Interval {
		s := base.Add(time.Duration(startMin) * time.Minute)
		return domain.Interval{Start: s, End: s.Add(time.Duration(durationMin) * time.Minute)}
	}

	cases := []struct {
		name string
		a, b domain.Interval
		want bool
	}{
		{"identical", mk(0, 30), mk(0, 30), true},
		{"disjoint earlier", mk(0, 30), mk(60, 30), false},
		{"disjoint later", mk(60, 30), mk(0, 30), false},
		{"touching at boundary (a ends where b starts)", mk(0, 30), mk(30, 30), false},
		{"touching at boundary (b ends where a starts)", mk(30, 30), mk(0, 30), false},
		{"a inside b", mk(10, 5), mk(0, 30), true},
		{"b inside a", mk(0, 30), mk(10, 5), true},
		{"a starts inside b", mk(15, 30), mk(0, 30), true},
		{"a ends inside b", mk(-15, 30), mk(0, 30), true},
		{"60-min vs 30-min adjacent (no overlap)", mk(0, 60), mk(60, 30), false},
		{"60-min vs 30-min straddling (overlap)", mk(0, 60), mk(45, 30), true},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tc.want, domain.Overlaps(tc.a, tc.b))
		})
	}
}
