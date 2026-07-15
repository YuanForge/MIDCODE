package handler

import (
	"fanapi/internal/db"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const userTokenStatsQuery = `
SELECT
	ll.model AS model,
	SUM(CASE
		WHEN LOWER(COALESCE(c.protocol, 'openai')) = 'claude'
			THEN COALESCE((ll.usage->>'prompt_tokens')::bigint, 0)
		ELSE GREATEST(
			COALESCE((ll.usage->>'prompt_tokens')::bigint, 0) -
			COALESCE((ll.usage->>'cache_read_tokens')::bigint, 0),
			0
		)
	END) AS non_cached_input_tokens,
	SUM(COALESCE((ll.usage->>'cache_read_tokens')::bigint, 0)) AS cache_read_tokens,
	SUM(COALESCE((ll.usage->>'cache_creation_tokens')::bigint, 0)) AS cache_creation_tokens,
	SUM(COALESCE((ll.usage->>'completion_tokens')::bigint, 0)) AS output_tokens,
	SUM(
		CASE
			WHEN LOWER(COALESCE(c.protocol, 'openai')) = 'claude'
				THEN COALESCE((ll.usage->>'prompt_tokens')::bigint, 0)
			ELSE GREATEST(
				COALESCE((ll.usage->>'prompt_tokens')::bigint, 0) -
				COALESCE((ll.usage->>'cache_read_tokens')::bigint, 0),
				0
			)
		END +
		COALESCE((ll.usage->>'cache_read_tokens')::bigint, 0) +
		COALESCE((ll.usage->>'cache_creation_tokens')::bigint, 0) +
		COALESCE((ll.usage->>'completion_tokens')::bigint, 0)
	) AS total_tokens
FROM llm_logs ll
JOIN channels c ON c.id = ll.channel_id
WHERE ll.user_id = ?
	AND ll.status = 'ok'
	AND ll.created_at >= ?
	AND ll.created_at < ?
	AND (? = '' OR ll.model ILIKE ?)
GROUP BY ll.model
ORDER BY total_tokens DESC
LIMIT ? OFFSET ?`

const userTokenStatsCountQuery = `
SELECT COUNT(DISTINCT ll.model) AS total
FROM llm_logs ll
JOIN channels c ON c.id = ll.channel_id
WHERE ll.user_id = ?
	AND ll.status = 'ok'
	AND ll.created_at >= ?
	AND ll.created_at < ?
	AND (? = '' OR ll.model ILIKE ?)`

type tokenUsageTotals struct {
	NonCachedInput int64 `json:"non_cached_input_tokens"`
	CacheRead      int64 `json:"cache_read_tokens"`
	CacheCreation  int64 `json:"cache_creation_tokens"`
	Output         int64 `json:"output_tokens"`
	Total          int64 `json:"total_tokens"`
}

type userTokenStatsRow struct {
	Model          string `xorm:"'model'" json:"model"`
	NonCachedInput int64  `xorm:"'non_cached_input_tokens'" json:"non_cached_input_tokens"`
	CacheRead      int64  `xorm:"'cache_read_tokens'" json:"cache_read_tokens"`
	CacheCreation  int64  `xorm:"'cache_creation_tokens'" json:"cache_creation_tokens"`
	Output         int64  `xorm:"'output_tokens'" json:"output_tokens"`
	Total          int64  `xorm:"'total_tokens'" json:"total_tokens"`
}

// GetUserTokenStats returns exact per-model Token usage for the authenticated user.
func GetUserTokenStats(c *gin.Context) {
	start, end, err := parseTokenStatsRange(c.Query("start_at"), c.Query("end_at"), time.Now())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	page := positiveInt(c.Query("page"), 1)
	pageSize := positiveInt(c.Query("page_size"), 20)
	if pageSize > 100 {
		pageSize = 100
	}
	modelFilter := strings.TrimSpace(c.Query("model"))
	modelPattern := "%" + modelFilter + "%"
	userID := c.MustGet("user_id").(int64)

	var count struct {
		Total int64 `xorm:"'total'"`
	}
	if _, err = db.Engine.SQL(
		userTokenStatsCountQuery,
		userID, start, end, modelFilter, modelPattern,
	).Get(&count); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query Token statistics"})
		return
	}

	items := make([]userTokenStatsRow, 0)
	if err = db.Engine.SQL(
		userTokenStatsQuery,
		userID, start, end, modelFilter, modelPattern, pageSize, (page-1)*pageSize,
	).Find(&items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query Token statistics"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":     items,
		"page":      page,
		"page_size": pageSize,
		"total":     count.Total,
		"start_at":  start.Format(time.RFC3339),
		"end_at":    end.Format(time.RFC3339),
	})
}

func positiveInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
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
