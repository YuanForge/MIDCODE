package handler

import (
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
	Recent       []modelAvailabilityRecent `json:"recent"`
}

func aggregateModelAvailability(logs []modelAvailabilityLog, visible map[string]struct{}) map[string]modelAvailabilitySummary {
	type aggregate struct {
		item       modelAvailabilitySummary
		latencies  []int64
		recentLogs []modelAvailabilityRecent
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
		result[name] = value.item
	}
	return result
}

func visibleModelNames(ctx *gin.Context) (map[string]struct{}, error) {
	grouped, err := listGroupedModelChannels()
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
			if _, ok := allowedGroups[item.Group.ID]; !ok {
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
	rows, err := db.Engine.DB().QueryContext(c.Request.Context(), `SELECT model,status,created_at,updated_at FROM llm_logs WHERE created_at >= $1 AND model IN (`+strings.Join(placeholders, ",")+`) AND status <> 'pending' ORDER BY created_at ASC`, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	logs := make([]modelAvailabilityLog, 0)
	for rows.Next() {
		var log modelAvailabilityLog
		if err := rows.Scan(&log.Model, &log.Status, &log.CreatedAt, &log.UpdatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		logs = append(logs, log)
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	aggregates := aggregateModelAvailability(logs, visible)
	result := make([]modelAvailabilitySummary, 0, len(aggregates))
	for _, name := range names {
		if item, ok := aggregates[name]; ok {
			result = append(result, item)
		}
	}
	c.JSON(http.StatusOK, gin.H{"models": result})
}
