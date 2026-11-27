package handler

import (
	"testing"
	"time"
)

func TestBufferedPerformance(t *testing.T) {
	start := time.Now()
	p := requestPerformance{started: start, first: start.Add(9 * time.Second)}
	usage := map[string]interface{}{"completion_tokens": 100}
	p.addUsage(usage, start.Add(10*time.Second))
	if usage["performance_tps"] != float64(10) || usage["performance_ttft_ms"] != float64(9000) || usage["performance_duration_ms"] != int64(10000) {
		t.Fatal(usage)
	}
}
func TestPerformanceAggregationExcludesFailuresAndMissingData(t *testing.T) {
	a, b, x, y := 1000.0, 3000.0, 20.0, 40.0
	logs := []modelAvailabilityLog{{Model: "gpt", Status: "ok", TTFTMS: &a, TPS: &x}, {Model: "gpt", Status: "ok", TTFTMS: &b, TPS: &y}, {Model: "gpt", Status: "error", TTFTMS: &a, TPS: &x}, {Model: "gpt", Status: "ok"}}
	got := aggregateModelAvailability(logs, map[string]struct{}{"gpt": {}})["gpt"]
	if got.TTFTSamples != 2 || got.TPSSamples != 2 || *got.TTFTMS != 2000 || *got.TPS != 30 {
		t.Fatalf("bad metrics: %+v", got)
	}
	empty := aggregateModelAvailability([]modelAvailabilityLog{{Model: "gpt", Status: "ok"}}, map[string]struct{}{"gpt": {}})["gpt"]
	if empty.TTFTMS != nil || empty.TPS != nil {
		t.Fatal("missing samples must be null")
	}
}
