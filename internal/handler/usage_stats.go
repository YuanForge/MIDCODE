package handler

import (
	"context"
	"database/sql"
	"fanapi/internal/db"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// Aggregate small time/model buckets, never payloads. Ledger amounts are net of
// refunds (including later refunds), attributed to the original request time.
// The same correlation ID's charge is counted once even if it has multiple logs.
const usageStatsQuery = `WITH scoped AS MATERIALIZED (
 SELECT ll.id, ll.model, ll.corr_id, ll.status, ll.created_at, ll.usage,
 COALESCE(c.protocol, 'openai') AS protocol,
 ROW_NUMBER() OVER (PARTITION BY NULLIF(ll.corr_id, '') ORDER BY ll.id DESC) AS corr_rank
 FROM llm_logs ll LEFT JOIN channels c ON c.id = ll.channel_id
 WHERE ll.user_id = $1 AND ll.created_at >= $2 AND ll.created_at < $3
), ledger AS (
 SELECT b.corr_id, SUM(CASE WHEN b.type IN ('hold','charge','settle','consume') THEN b.credits
 WHEN b.type = 'refund' THEN -b.credits ELSE 0 END) AS credits
 FROM billing_transactions b
 WHERE b.user_id = $1 AND b.corr_id <> ''
 AND b.corr_id IN (SELECT corr_id FROM scoped WHERE status IN ('ok','error'))
 GROUP BY b.corr_id
), normalized AS (
 SELECT s.*, CASE WHEN status = 'ok' THEN
 CASE WHEN LOWER(protocol) = 'claude' THEN COALESCE((usage->>'prompt_tokens')::bigint,0)
 ELSE GREATEST(COALESCE((usage->>'prompt_tokens')::bigint,0)-COALESCE((usage->>'cache_read_tokens')::bigint,0),0) END
 ELSE 0 END AS input,
 CASE WHEN status = 'ok' THEN COALESCE((usage->>'cache_read_tokens')::bigint,0) ELSE 0 END AS cache_read,
 CASE WHEN status = 'ok' THEN COALESCE((usage->>'cache_creation_tokens')::bigint,0) ELSE 0 END AS cache_write,
 CASE WHEN status = 'ok' THEN COALESCE((usage->>'completion_tokens')::bigint,0) ELSE 0 END AS output,
 CASE WHEN status IN ('ok','error') AND corr_rank = 1 THEN COALESCE(l.credits,0) ELSE 0 END AS credits
 FROM scoped s LEFT JOIN ledger l ON l.corr_id = s.corr_id
)
SELECT CASE WHEN created_at >= $4 THEN 1 ELSE 0 END AS period,
 DATE_TRUNC($5, created_at) AT TIME ZONE 'Asia/Shanghai' AS bucket,
 model, COUNT(*) AS requests,
 COUNT(*) FILTER (WHERE status = 'ok') AS success,
 COUNT(*) FILTER (WHERE status = 'error') AS failed,
 SUM(credits), SUM(input), SUM(cache_read), SUM(cache_write), SUM(output)
FROM normalized GROUP BY period, bucket, model ORDER BY bucket, model`

type usageMetrics struct {
	Requests       int64 `json:"requests"`
	Success        int64 `json:"success"`
	Failed         int64 `json:"failed"`
	Credits        int64 `json:"credits"`
	NonCachedInput int64 `json:"non_cached_input_tokens"`
	CacheRead      int64 `json:"cache_read_tokens"`
	CacheCreation  int64 `json:"cache_creation_tokens"`
	Output         int64 `json:"output_tokens"`
	Total          int64 `json:"total_tokens"`
}

func (m *usageMetrics) add(v usageMetrics) {
	m.Requests += v.Requests
	m.Success += v.Success
	m.Failed += v.Failed
	m.Credits += v.Credits
	m.NonCachedInput += v.NonCachedInput
	m.CacheRead += v.CacheRead
	m.CacheCreation += v.CacheCreation
	m.Output += v.Output
	m.Total += v.Total
}

type usageModel struct {
	Model string `json:"model"`
	usageMetrics
}
type usagePoint struct {
	At time.Time `json:"at"`
	usageMetrics
}
type usageRecord struct {
	Period int
	At     time.Time
	Model  string
	usageMetrics
}
type usageResponse struct {
	Start           time.Time    `json:"start_at"`
	End             time.Time    `json:"end_at"`
	Bucket          string       `json:"bucket"`
	Summary         usageMetrics `json:"summary"`
	Previous        usageMetrics `json:"previous"`
	Points          []usagePoint `json:"points"`
	Models          []usageModel `json:"models"`
	AvailableModels []string     `json:"available_models"`
}

func buildUsageResponse(records []usageRecord, start, end time.Time, bucket, filter string) usageResponse {
	loc := time.FixedZone("CST", 8*60*60)
	r := usageResponse{Start: start, End: end, Bucket: bucket, Points: []usagePoint{}, Models: []usageModel{}, AvailableModels: []string{}}
	step := time.Hour
	first := start.In(loc).Truncate(time.Hour)
	if bucket == "day" {
		step = 24 * time.Hour
		first = time.Date(first.Year(), first.Month(), first.Day(), 0, 0, 0, 0, loc)
	}
	indices := map[int64]int{}
	for at := first; at.Before(end); at = at.Add(step) {
		indices[at.Unix()] = len(r.Points)
		r.Points = append(r.Points, usagePoint{At: at})
	}
	models := map[string]*usageModel{}
	available := map[string]bool{}
	for _, row := range records {
		if row.Period == 1 {
			available[row.Model] = true
		}
		if filter != "" && row.Model != filter {
			continue
		}
		if row.Period == 0 {
			r.Previous.add(row.usageMetrics)
			continue
		}
		r.Summary.add(row.usageMetrics)
		if i, ok := indices[row.At.Unix()]; ok {
			r.Points[i].add(row.usageMetrics)
		}
		if models[row.Model] == nil {
			models[row.Model] = &usageModel{Model: row.Model}
		}
		models[row.Model].add(row.usageMetrics)
	}
	for _, m := range models {
		r.Models = append(r.Models, *m)
	}
	for m := range available {
		r.AvailableModels = append(r.AvailableModels, m)
	}
	sort.Strings(r.AvailableModels)
	sort.Slice(r.Models, func(i, j int) bool {
		if r.Models[i].Credits == r.Models[j].Credits {
			return r.Models[i].Model < r.Models[j].Model
		}
		return r.Models[i].Credits > r.Models[j].Credits
	})
	return r
}

// GetUserUsageStats serves the full selected range independently of table paging.
func GetUserUsageStats(c *gin.Context) {
	start, end, err := parseTokenStatsRange(c.Query("start_at"), c.Query("end_at"), time.Now())
	if err != nil || end.Sub(start) > 90*24*time.Hour {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择有效的时间范围，最长 90 天"})
		return
	}
	bucket := c.DefaultQuery("bucket", "day")
	if (bucket != "day" && bucket != "hour") || (bucket == "hour" && end.Sub(start) > 7*24*time.Hour) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "按小时统计最多支持 7 天，请改为按天"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	// Existing PostgreSQL timestamps store Beijing wall time without an offset.
	// Bind explicit wall-time strings so browser offsets/session TZ cannot shift them.
	wall := func(t time.Time) string {
		return t.In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05.999999")
	}
	rows, err := db.Engine.DB().QueryContext(ctx, usageStatsQuery, c.MustGet("user_id").(int64), wall(start.Add(-end.Sub(start))), wall(end), wall(start), bucket)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "统计暂时不可用，请稍后重试"})
		return
	}
	defer rows.Close()
	records := []usageRecord{}
	for rows.Next() {
		var row usageRecord
		var name sql.NullString
		if err = rows.Scan(&row.Period, &row.At, &name, &row.Requests, &row.Success, &row.Failed, &row.Credits, &row.NonCachedInput, &row.CacheRead, &row.CacheCreation, &row.Output); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "统计数据读取失败"})
			return
		}
		row.Model = name.String
		row.Total = row.NonCachedInput + row.CacheRead + row.CacheCreation + row.Output
		records = append(records, row)
	}
	if rows.Err() != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "统计数据读取失败"})
		return
	}
	c.JSON(http.StatusOK, buildUsageResponse(records, start, end, bucket, strings.TrimSpace(c.Query("model"))))
}
