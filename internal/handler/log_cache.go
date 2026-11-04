package handler

import (
	"fanapi/internal/model"
	"math"
	"strings"
)

// Match the input partitions used by userTokenStatsQuery, not an average of requests.
func logCacheHitPercent(usage model.JSON, channel model.Channel) *float64 {
	if channel.ID == 0 || usage == nil {
		return nil
	}
	values := make([]float64, 3)
	for i, key := range []string{"prompt_tokens", "cache_read_tokens", "cache_creation_tokens"} {
		if raw, exists := usage[key]; exists {
			v, ok := numberToFloat64(raw)
			if !ok || math.IsNaN(v) || math.IsInf(v, 0) || v < 0 {
				return nil
			}
			values[i] = v
		}
	}
	prompt, read, write := values[0], values[1], values[2]
	if strings.ToLower(channel.Protocol) != "claude" {
		prompt = math.Max(prompt-read, 0)
	}
	total := prompt + read + write
	if total <= 0 || math.IsInf(total, 0) {
		return nil
	}
	percent := read / total * 100
	return &percent
}
