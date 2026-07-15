package handler

import (
	"fanapi/internal/db"
	"fanapi/internal/model"
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

const channelTokenStatsQuery = `
SELECT
	%s AS label,
	SUM(COALESCE((ll.usage->>'prompt_tokens')::bigint, 0)) AS prompt_tokens,
	SUM(COALESCE((ll.usage->>'completion_tokens')::bigint, 0)) AS output_tokens,
	SUM(COALESCE((ll.usage->>'cache_read_tokens')::bigint, 0)) AS cache_read_tokens,
	SUM(COALESCE((ll.usage->>'cache_creation_tokens')::bigint, 0)) AS cache_creation_tokens
FROM llm_logs ll
WHERE ll.channel_id = ?
	AND ll.status = 'ok'
	AND ll.created_at >= ?
	AND ll.created_at < ?
GROUP BY %s
ORDER BY %s`

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

type channelTokenStatsRow struct {
	Label         string `xorm:"'label'"`
	Prompt        int64  `xorm:"'prompt_tokens'"`
	Output        int64  `xorm:"'output_tokens'"`
	CacheRead     int64  `xorm:"'cache_read_tokens'"`
	CacheCreation int64  `xorm:"'cache_creation_tokens'"`
}

type channelTokenStatsPoint struct {
	Label          string `json:"label"`
	NonCachedInput int64  `json:"non_cached_input_tokens"`
	CacheRead      int64  `json:"cache_read_tokens"`
	CacheCreation  int64  `json:"cache_creation_tokens"`
	Output         int64  `json:"output_tokens"`
	Total          int64  `json:"total_tokens"`
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

// GetAdminChannelTokenStats returns usage for one exact channel without model grouping.
func GetAdminChannelTokenStats(c *gin.Context) {
	channelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || channelID < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel id"})
		return
	}

	var channel model.Channel
	found, err := db.Engine.ID(channelID).Get(&channel)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query channel"})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}

	start, end, err := parseTokenStatsRange(c.Query("start_at"), c.Query("end_at"), time.Now())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	bucket := strings.ToLower(strings.TrimSpace(c.DefaultQuery("bucket", "hour")))
	labelExpression := "TO_CHAR(DATE_TRUNC('hour', ll.created_at AT TIME ZONE 'Asia/Shanghai'), 'MM-DD HH24:00')"
	groupExpression := "DATE_TRUNC('hour', ll.created_at AT TIME ZONE 'Asia/Shanghai')"
	if bucket == "day" {
		labelExpression = "TO_CHAR(DATE_TRUNC('day', ll.created_at AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')"
		groupExpression = "DATE_TRUNC('day', ll.created_at AT TIME ZONE 'Asia/Shanghai')"
	} else if bucket != "hour" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bucket must be hour or day"})
		return
	}

	rawRows := make([]channelTokenStatsRow, 0)
	query := fmt.Sprintf(channelTokenStatsQuery, labelExpression, groupExpression, groupExpression)
	if err = db.Engine.SQL(query, channelID, start, end).Find(&rawRows); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query Token statistics"})
		return
	}

	points := make([]channelTokenStatsPoint, 0, len(rawRows))
	totals := tokenUsageTotals{}
	for _, row := range rawRows {
		usage := normalizeTokenUsage(channel.Protocol, row.Prompt, row.Output, row.CacheRead, row.CacheCreation)
		points = append(points, channelTokenStatsPoint{
			Label:          row.Label,
			NonCachedInput: usage.NonCachedInput,
			CacheRead:      usage.CacheRead,
			CacheCreation:  usage.CacheCreation,
			Output:         usage.Output,
			Total:          usage.Total,
		})
		totals.NonCachedInput += usage.NonCachedInput
		totals.CacheRead += usage.CacheRead
		totals.CacheCreation += usage.CacheCreation
		totals.Output += usage.Output
		totals.Total += usage.Total
	}

	c.JSON(http.StatusOK, gin.H{
		"channel": gin.H{
			"id":       channel.ID,
			"name":     channel.Name,
			"model":    channel.Model,
			"protocol": channel.Protocol,
		},
		"totals":   totals,
		"points":   points,
		"start_at": start.Format(time.RFC3339),
		"end_at":   end.Format(time.RFC3339),
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
