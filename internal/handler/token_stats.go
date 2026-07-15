package handler

import (
	"fmt"
	"strings"
	"time"
)

type tokenUsageTotals struct {
	NonCachedInput int64 `json:"non_cached_input_tokens"`
	CacheRead      int64 `json:"cache_read_tokens"`
	CacheCreation  int64 `json:"cache_creation_tokens"`
	Output         int64 `json:"output_tokens"`
	Total          int64 `json:"total_tokens"`
}

func normalizeTokenUsage(protocol string, prompt, output, cacheRead, cacheCreation int64) tokenUsageTotals {
	nonCached := prompt
	if strings.ToLower(strings.TrimSpace(protocol)) != "claude" {
		nonCached -= cacheRead
		if nonCached < 0 {
			nonCached = 0
		}
	}

	return tokenUsageTotals{
		NonCachedInput: nonCached,
		CacheRead:      cacheRead,
		CacheCreation:  cacheCreation,
		Output:         output,
		Total:          nonCached + cacheRead + cacheCreation + output,
	}
}

func parseTokenStatsRange(startValue, endValue string, now time.Time) (time.Time, time.Time, error) {
	defaultStart, defaultEnd := shanghaiDayRange(now)
	start, end := defaultStart, defaultEnd

	var err error
	if strings.TrimSpace(startValue) != "" {
		start, err = parseTokenStatsTime(startValue)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("invalid start_at: %w", err)
		}
	}
	if strings.TrimSpace(endValue) != "" {
		end, err = parseTokenStatsTime(endValue)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("invalid end_at: %w", err)
		}
	}
	if !end.After(start) {
		return time.Time{}, time.Time{}, fmt.Errorf("end_at must be after start_at")
	}
	return start, end, nil
}

func parseTokenStatsTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed, nil
	}

	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.FixedZone("CST", 8*60*60)
	}
	for _, layout := range []string{
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
		"2006-01-02",
	} {
		if parsed, parseErr := time.ParseInLocation(layout, value, loc); parseErr == nil {
			return parsed, nil
		}
	}
	return time.Time{}, fmt.Errorf("unsupported time format")
}
