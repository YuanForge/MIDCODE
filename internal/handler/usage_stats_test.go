package handler

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"testing"
	"time"
)

func TestUsageStatsFillGapsFilterAndPrevious(t *testing.T) {
	loc := time.FixedZone("CST", 8*3600)
	start := time.Date(2026, 11, 7, 0, 0, 0, 0, loc)
	end := start.Add(3 * 24 * time.Hour)
	records := []usageRecord{
		{Period: 0, At: start.Add(-time.Hour), Model: "gpt", usageMetrics: usageMetrics{Requests: 9, Credits: 90}},
		{Period: 1, At: start, Model: "gpt", usageMetrics: usageMetrics{Requests: 2, Success: 1, Failed: 1, Credits: 10, Total: 100}},
		{Period: 1, At: start.Add(48 * time.Hour), Model: "gpt", usageMetrics: usageMetrics{Requests: 3, Success: 3, Credits: 20, Total: 200}},
		{Period: 1, At: start, Model: "gpt-mini", usageMetrics: usageMetrics{Requests: 50, Credits: 500, Total: 5000}},
	}
	r := buildUsageResponse(records, start, end, "day", "gpt")
	if r.Summary.Requests != 5 || r.Summary.Credits != 30 || r.Summary.Total != 300 || r.Previous.Requests != 9 {
		t.Fatalf("incorrect filtered totals: %+v", r)
	}
	if len(r.Points) != 3 || r.Points[1].Requests != 0 || r.Points[2].Requests != 3 {
		t.Fatalf("missing zero-filled day: %+v", r.Points)
	}
	if len(r.Models) != 1 || len(r.AvailableModels) != 2 {
		t.Fatalf("exact filter/options: %+v", r)
	}
	all := buildUsageResponse(records, start, end, "day", "")
	if all.Summary.Requests != 55 || all.Models[0].Model != "gpt-mini" {
		t.Fatalf("all-model aggregate: %+v", all)
	}
}

func TestUsageStatsPartialHourAndEmpty(t *testing.T) {
	start, _ := time.Parse(time.RFC3339, "2026-11-06T16:35:00Z")
	r := buildUsageResponse(nil, start, start.Add(2*time.Hour), "hour", "")
	if len(r.Points) != 3 || r.Points[0].At.Hour() != 0 || r.Points[2].At.Hour() != 2 || r.Models == nil {
		t.Fatalf("Beijing hour alignment: %+v", r)
	}
}

func TestUsageStatsRejectUnboundedRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, query := range []string{
		"start_at=2026-01-01&end_at=2026-12-01", "start_at=broken", "start_at=2026-11-01&end_at=2026-11-10&bucket=hour", "bucket=minute",
	} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("GET", "/?"+query, nil)
		GetUserUsageStats(c)
		if w.Code != 400 {
			t.Fatalf("query %q returned %d", query, w.Code)
		}
	}
}
