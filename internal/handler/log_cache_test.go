package handler

import (
	"fanapi/internal/model"
	"math"
	"testing"
)

func TestLogCacheHitPercent(t *testing.T) {
	for _, tc := range []struct {
		name, protocol string
		usage          model.JSON
		want           float64
	}{
		{"inclusive input", "openai", model.JSON{"prompt_tokens": 1000, "cache_read_tokens": 800}, 80},
		{"exclusive input", "claude", model.JSON{"prompt_tokens": 100, "cache_read_tokens": 800, "cache_creation_tokens": 100}, 80},
		{"case insensitive", "CLAUDE", model.JSON{"prompt_tokens": 100, "cache_read_tokens": 900}, 90},
		{"no cache", "openai", model.JSON{"prompt_tokens": 100}, 0},
		{"all cache", "claude", model.JSON{"prompt_tokens": 0, "cache_read_tokens": 100}, 100},
		{"write not hit", "claude", model.JSON{"prompt_tokens": 0, "cache_creation_tokens": 100}, 0},
		{"empty", "openai", nil, -1},
		{"zero input", "openai", model.JSON{"prompt_tokens": 0}, -1},
		{"invalid", "openai", model.JSON{"prompt_tokens": math.NaN()}, -1},
		{"negative", "openai", model.JSON{"prompt_tokens": 100, "cache_read_tokens": -1}, -1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := logCacheHitPercent(tc.usage, model.Channel{ID: 1, Protocol: tc.protocol})
			if tc.want < 0 {
				if got != nil {
					t.Fatal("expected missing")
				}
				return
			}
			if got == nil || math.Abs(*got-tc.want) > 0.000001 {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
	if logCacheHitPercent(model.JSON{"prompt_tokens": 100}, model.Channel{}) != nil {
		t.Fatal("missing channel must not guess protocol")
	}
}
