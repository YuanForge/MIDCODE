package handler

import (
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/service"
	"github.com/gin-gonic/gin"
)

type modelAvailabilityLog struct {
	Model     string
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
	TTFTMS    *float64
	TPS       *float64
}

type modelAvailabilityRecent struct {
	Status    string    `json:"status"`
	LatencyMS int64     `json:"latency_ms"`
	CreatedAt time.Time `json:"created_at"`
}

type modelAvailabilitySummary struct {
	RoutingModel string                    `json:"routing_model"`
	Total        int64                     `json:"total"`
	Success      int64                     `json:"success"`
	Availability float64                   `json:"availability_percent"`
	P50LatencyMS int64                     `json:"p50_latency_ms"`
	TTFTMS       *float64                  `json:"ttft_ms"`
	TPS          *float64                  `json:"tps"`
	TTFTSamples  int                       `json:"ttft_samples"`
	TPSSamples   int                       `json:"tps_samples"`
	Recent       []modelAvailabilityRecent `json:"recent"`
}

func aggregateModelAvailability(logs []modelAvailabilityLog, visible map[string]struct{}) map[string]modelAvailabilitySummary {
	type aggregate struct {
		item          modelAvailabilitySummary
		latencies     []int64
		ttfts, speeds []float64
		recentLogs    []modelAvailabilityRecent
	}
	values := make(map[string]*aggregate)
	for _, log := range logs {
		name := strings.TrimSpace(log.Model)
		if _, ok := visible[name]; !ok || log.Status == "pending" {
			continue
		}
		value := values[name]
		if value == nil {
			value = &aggregate{item: modelAvailabilitySummary{RoutingModel: name, Recent: make([]modelAvailabilityRecent, 0, 60)}}
			values[name] = value
		}
		value.item.Total++
		latency := log.UpdatedAt.Sub(log.CreatedAt).Milliseconds()
		if latency < 0 {
			latency = 0
		}
		recent := modelAvailabilityRecent{Status: log.Status, LatencyMS: latency, CreatedAt: log.CreatedAt}
		value.recentLogs = append(value.recentLogs, recent)
		if log.Status == "ok" {
			value.item.Success++
			if log.TTFTMS != nil && *log.TTFTMS >= 0 && !math.IsNaN(*log.TTFTMS) && !math.IsInf(*log.TTFTMS, 0) {
				value.ttfts = append(value.ttfts, *log.TTFTMS)
			}
			if log.TPS != nil && *log.TPS > 0 && !math.IsNaN(*log.TPS) && !math.IsInf(*log.TPS, 0) {
				value.speeds = append(value.speeds, *log.TPS)
			}
			value.latencies = append(value.latencies, latency)
		}
	}

	result := make(map[string]modelAvailabilitySummary, len(values))
	for name, value := range values {
		sort.Slice(value.recentLogs, func(i, j int) bool { return value.recentLogs[i].CreatedAt.Before(value.recentLogs[j].CreatedAt) })
		if len(value.recentLogs) > 60 {
			value.recentLogs = value.recentLogs[len(value.recentLogs)-60:]
		}
		value.item.Recent = value.recentLogs
		if value.item.Total > 0 {
			value.item.Availability = float64(value.item.Success) * 100 / float64(value.item.Total)
		}
		if len(value.latencies) > 0 {
			sort.Slice(value.latencies, func(i, j int) bool { return value.latencies[i] < value.latencies[j] })
			value.item.P50LatencyMS = value.latencies[(len(value.latencies)-1)/2]
		}
		value.item.TTFTMS = performanceMedian(value.ttfts)
		value.item.TPS = performanceMedian(value.speeds)
		value.item.TTFTSamples = len(value.ttfts)
		value.item.TPSSamples = len(value.speeds)
		result[name] = value.item
	}
	return result
}

func visibleModelNames(ctx *gin.Context) (map[string]struct{}, error) {
	var grouped []struct {
		GroupID      int64
		RoutingModel string
	}
	err := db.Engine.SQL(`SELECT gm.group_id, gm.routing_model FROM model_group_models gm
 JOIN model_groups g ON g.id=gm.group_id AND g.is_active=true
 JOIN channels c ON c.id=gm.channel_id AND c.is_active=true
 JOIN model_providers p ON p.id=c.model_provider_id AND p.is_active=true`).Find(&grouped)
	if err != nil {
		return nil, err
	}

	allowedGroups := map[int64]struct{}(nil)
	if apiKeyID := ctx.GetInt64("api_key_id"); apiKeyID > 0 {
		bindings, bindingErr := service.LoadAPIKeyModelGroupBindings(ctx.Request.Context(), apiKeyID)
		if bindingErr != nil {
			return nil, bindingErr
		}
		allowedGroups = make(map[int64]struct{}, len(bindings))
		for _, binding := range bindings {
			allowedGroups[binding.GroupID] = struct{}{}
		}
	}
	visible := make(map[string]struct{})
	for _, item := range grouped {
		if allowedGroups != nil {
			if _, ok := allowedGroups[item.GroupID]; !ok {
				continue
			}
		}
		if name := strings.TrimSpace(item.RoutingModel); name != "" {
			visible[name] = struct{}{}
		}
	}
	return visible, nil
}

// GetModelAvailability returns recent real-request health for visible models.
func GetModelAvailability(c *gin.Context) {
	visible, err := visibleModelNames(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(visible) == 0 {
		c.JSON(http.StatusOK, gin.H{"models": []modelAvailabilitySummary{}})
		return
	}
	names := make([]string, 0, len(visible))
	for name := range visible {
		names = append(names, name)
	}
	sort.Strings(names)
	args := []interface{}{time.Now().Add(-7 * 24 * time.Hour)}
	placeholders := make([]string, 0, len(names))
	for i, name := range names {
		placeholders = append(placeholders, "$"+strconv.Itoa(i+2))
		args = append(args, name)
	}
	query := `WITH samples AS (
 SELECT model,status,GREATEST(TRUNC(EXTRACT(EPOCH FROM (updated_at-created_at))*1000),0)::bigint AS latency,
 CASE WHEN jsonb_typeof(usage->'performance_ttft_ms')='number' THEN (usage->>'performance_ttft_ms')::double precision END AS ttft,
 CASE WHEN jsonb_typeof(usage->'performance_tps')='number' THEN (usage->>'performance_tps')::double precision END AS tps
 FROM llm_logs WHERE created_at >= $1 AND model IN (` + strings.Join(placeholders, ",") + `) AND status <> 'pending'
 ), summary AS (
 SELECT model,COUNT(*) AS total,COUNT(*) FILTER(WHERE status='ok') AS success,
 COALESCE(percentile_disc(0.5) WITHIN GROUP(ORDER BY latency) FILTER(WHERE status='ok'),0) AS latency,
 percentile_cont(0.5) WITHIN GROUP(ORDER BY ttft) FILTER(WHERE status='ok' AND ttft>=0) AS ttft,
 percentile_cont(0.5) WITHIN GROUP(ORDER BY tps) FILTER(WHERE status='ok' AND tps>0) AS tps,
 COUNT(*) FILTER(WHERE status='ok' AND ttft>=0) AS ttft_samples,
 COUNT(*) FILTER(WHERE status='ok' AND tps>0) AS tps_samples
 FROM samples GROUP BY model
 ) SELECT s.model,s.total,s.success,s.latency,s.ttft,s.tps,s.ttft_samples,s.tps_samples,
 (SELECT jsonb_agg(jsonb_build_object('status',r.status,'latency_ms',r.latency,'created_at',r.created_at AT TIME ZONE 'UTC') ORDER BY r.created_at,r.id)
 FROM (SELECT id,status,created_at,GREATEST(TRUNC(EXTRACT(EPOCH FROM (updated_at-created_at))*1000),0)::bigint AS latency
 FROM llm_logs WHERE model=s.model AND created_at >= $1 AND status <> 'pending' ORDER BY created_at DESC,id DESC LIMIT 60) r)
 FROM summary s ORDER BY s.model`
	rows, err := db.Engine.DB().QueryContext(c.Request.Context(), query, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": "模型统计暂时不可用"})
		return
	}
	defer rows.Close()
	result := make([]modelAvailabilitySummary, 0)
	for rows.Next() {
		var item modelAvailabilitySummary
		var recent []byte
		if err := rows.Scan(&item.RoutingModel, &item.Total, &item.Success, &item.P50LatencyMS, &item.TTFTMS, &item.TPS, &item.TTFTSamples, &item.TPSSamples, &recent); err != nil {
			c.JSON(500, gin.H{"error": "模型统计读取失败"})
			return
		}
		if err := json.Unmarshal(recent, &item.Recent); err != nil {
			c.JSON(500, gin.H{"error": "模型统计读取失败"})
			return
		}
		item.Availability = float64(item.Success) * 100 / float64(item.Total)
		result = append(result, item)
	}
	if rows.Err() != nil {
		c.JSON(500, gin.H{"error": "模型统计读取失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"models": result})
}

func performanceMedian(values []float64) *float64 {
	if len(values) == 0 {
		return nil
	}
	sort.Float64s(values)
	m := values[len(values)/2]
	if len(values)%2 == 0 {
		m = (m + values[len(values)/2-1]) / 2
	}
	return &m
}
