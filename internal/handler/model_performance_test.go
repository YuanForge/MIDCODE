package handler

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"testing"
	"time"
)

func TestPerformanceIgnoresLifecycleAndHandlesProtocols(t *testing.T) {
	for _, line := range []string{": heartbeat", `data: {"choices":[{"delta":{"role":"assistant"}}]}`, `data: {"type":"response.created"}`, `data: {"usage":{"completion_tokens":9}}`, `data: [DONE]`} {
		if performanceOutputLine(line) {
			t.Fatalf("metadata counted: %s", line)
		}
	}
	for _, line := range []string{`data: {"choices":[{"delta":{"content":"Hi"}}]}`, `data: {"type":"response.output_text.delta","delta":"Hi"}`, `data: {"type":"content_block_delta","delta":{"thinking":"Hi"}}`, `data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}`, `data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{"}}]}}]}`} {
		if !performanceOutputLine(line) {
			t.Fatalf("output missed: %s", line)
		}
	}
}
func TestPerformanceChunkingTimingAndUnchangedResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Header("Content-Type", "text/event-stream")
	start := time.Now().Add(-time.Second)
	c.Set("model_performance_start", start)
	w := installModelPerformance(c)
	a := "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}"
	w.WriteString(a[:20])
	if !w.first.IsZero() {
		t.Fatal("partial event counted")
	}
	w.WriteString(a[20:] + "\n\n")
	if w.first.IsZero() {
		t.Fatal("missing first output")
	}
	if rec.Body.String() != a+"\n\n" {
		t.Fatal("changed stream")
	}
	usage := map[string]interface{}{"completion_tokens": int64(101)}
	w.addUsage(usage, w.first.Add(2*time.Second))
	if usage["performance_tps"] != float64(50) {
		t.Fatalf("TPS=%v", usage)
	}
	estimated := map[string]interface{}{"completion_tokens": int64(101), "estimated": true}
	w.addUsage(estimated, w.first.Add(time.Second))
	if _, ok := estimated["performance_tps"]; ok {
		t.Fatal("estimated usage included")
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
