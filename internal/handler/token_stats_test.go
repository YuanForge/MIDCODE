package handler

import (
	"testing"
	"time"
)

func TestNormalizeTokenUsage(t *testing.T) {
	tests := []struct {
		name, protocol                 string
		prompt, output, read, creation int64
		want                           tokenUsageTotals
	}{
		{
			name: "openai cache is included in prompt", protocol: "openai",
			prompt: 100, output: 20, read: 40,
			want: tokenUsageTotals{NonCachedInput: 60, CacheRead: 40, Output: 20, Total: 120},
		},
		{
			name: "responses cache is included in prompt", protocol: "responses",
			prompt: 100, output: 20, read: 40,
			want: tokenUsageTotals{NonCachedInput: 60, CacheRead: 40, Output: 20, Total: 120},
		},
		{
			name: "gemini cache is included in prompt", protocol: "gemini",
			prompt: 100, output: 20, read: 40,
			want: tokenUsageTotals{NonCachedInput: 60, CacheRead: 40, Output: 20, Total: 120},
		},
		{
			name: "claude cache is separate", protocol: "claude",
			prompt: 60, output: 20, read: 40, creation: 10,
			want: tokenUsageTotals{NonCachedInput: 60, CacheRead: 40, CacheCreation: 10, Output: 20, Total: 130},
		},
		{
			name: "included cache cannot make input negative", protocol: "openai",
			prompt: 10, output: 2, read: 20,
			want: tokenUsageTotals{CacheRead: 20, Output: 2, Total: 22},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeTokenUsage(tt.protocol, tt.prompt, tt.output, tt.read, tt.creation)
			if got != tt.want {
				t.Fatalf("got %+v want %+v", got, tt.want)
			}
		})
	}
}

func TestParseTokenStatsRangeDefaultsToShanghaiDay(t *testing.T) {
	now := time.Date(2026, 7, 15, 18, 30, 0, 0, time.UTC)
	start, end, err := parseTokenStatsRange("", "", now)
	if err != nil {
		t.Fatal(err)
	}

	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatal(err)
	}
	wantStart := time.Date(2026, 7, 16, 0, 0, 0, 0, loc)
	if !start.Equal(wantStart) || !end.Equal(wantStart.AddDate(0, 0, 1)) {
		t.Fatalf("got %s..%s want %s..%s", start, end, wantStart, wantStart.AddDate(0, 0, 1))
	}
}

func TestParseTokenStatsRangeRejectsInvalidRanges(t *testing.T) {
	now := time.Date(2026, 7, 15, 12, 0, 0, 0, time.UTC)
	for _, tt := range []struct {
		name, start, end string
	}{
		{name: "invalid start", start: "not-a-date", end: "2026-07-16T00:00"},
		{name: "end equals start", start: "2026-07-16T00:00", end: "2026-07-16T00:00"},
		{name: "end before start", start: "2026-07-17T00:00", end: "2026-07-16T00:00"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if _, _, err := parseTokenStatsRange(tt.start, tt.end, now); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}
