package handler

import (
	"testing"
	"time"
)

func TestAggregateModelAvailabilityExcludesPendingAndKeepsRecent60(t *testing.T) {
	base := time.Date(2026, 7, 22, 10, 0, 0, 0, time.UTC)
	logs := make([]modelAvailabilityLog, 0, 63)
	for i := 0; i < 61; i++ {
		logs = append(logs, modelAvailabilityLog{
			Model:     "gpt",
			Status:    "ok",
			CreatedAt: base.Add(time.Duration(i) * time.Minute),
			UpdatedAt: base.Add(time.Duration(i)*time.Minute + 2*time.Second),
		})
	}
	logs = append(logs,
		modelAvailabilityLog{Model: "gpt", Status: "error", CreatedAt: base.Add(61 * time.Minute), UpdatedAt: base.Add(61*time.Minute + 4*time.Second)},
		modelAvailabilityLog{Model: "gpt", Status: "pending", CreatedAt: base.Add(62 * time.Minute), UpdatedAt: base.Add(62 * time.Minute)},
	)

	got := aggregateModelAvailability(logs, map[string]struct{}{"gpt": {}})
	item := got["gpt"]
	if item.Total != 62 || item.Success != 61 {
		t.Fatalf("counts = %d/%d, want 62/61", item.Total, item.Success)
	}
	if item.P50LatencyMS != 2000 {
		t.Fatalf("p50 latency = %v, want 2000", item.P50LatencyMS)
	}
	if len(item.Recent) != 60 || item.Recent[0].CreatedAt != base.Add(2*time.Minute) || item.Recent[59].CreatedAt != base.Add(61*time.Minute) {
		t.Fatalf("recent window = %d, %v..%v", len(item.Recent), item.Recent[0].CreatedAt, item.Recent[59].CreatedAt)
	}
}

func TestAggregateModelAvailabilityDoesNotExposeUnknownModels(t *testing.T) {
	got := aggregateModelAvailability([]modelAvailabilityLog{{Model: "hidden", Status: "ok"}}, map[string]struct{}{"visible": {}})
	if len(got) != 0 {
		t.Fatalf("unknown models leaked: %#v", got)
	}
}
