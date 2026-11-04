package handler

import (
	"bytes"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"strings"
	"time"
)

// Observe the client-facing stream without changing bytes, flushes or billing.
// Heartbeats, role-only deltas and lifecycle events are not first output tokens.
type modelPerformanceWriter struct {
	gin.ResponseWriter
	started, first time.Time
	pending        []byte
	oversized      bool
}

func (w *modelPerformanceWriter) Write(p []byte) (int, error) {
	n, err := w.ResponseWriter.Write(p)
	if n > 0 && w.first.IsZero() && strings.Contains(w.Header().Get("Content-Type"), "text/event-stream") {
		w.observe(p[:n], time.Now())
	}
	return n, err
}
func (w *modelPerformanceWriter) WriteString(s string) (int, error) { return w.Write([]byte(s)) }
func (w *modelPerformanceWriter) observe(p []byte, now time.Time) {
	for len(p) > 0 && w.first.IsZero() {
		i := bytes.IndexByte(p, '\n')
		part := p
		if i >= 0 {
			part = p[:i]
		}
		if len(w.pending)+len(part) > 1024*1024 {
			w.oversized = true
			w.pending = nil
		}
		if !w.oversized {
			w.pending = append(w.pending, part...)
		}
		if i < 0 {
			return
		}
		if !w.oversized && performanceOutputLine(string(w.pending)) {
			w.first = now
		}
		w.pending = nil
		w.oversized = false
		p = p[i+1:]
	}
}
func performanceOutputLine(line string) bool {
	if !strings.HasPrefix(line, "data:") {
		return false
	}
	var m map[string]interface{}
	if json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "data:"))), &m) != nil {
		return false
	}
	text := func(v interface{}) bool { s, _ := v.(string); return s != "" }
	kind, _ := m["type"].(string)
	if (kind == "response.output_text.delta" || kind == "response.reasoning_summary_text.delta" || kind == "response.reasoning_text.delta" || kind == "response.function_call_arguments.delta") && text(m["delta"]) {
		return true
	}
	if kind == "content_block_delta" {
		d, _ := m["delta"].(map[string]interface{})
		return text(d["text"]) || text(d["thinking"]) || text(d["partial_json"])
	}
	choices, _ := m["choices"].([]interface{})
	for _, v := range choices {
		c, _ := v.(map[string]interface{})
		d, _ := c["delta"].(map[string]interface{})
		if text(d["content"]) || text(d["reasoning_content"]) {
			return true
		}
		calls, _ := d["tool_calls"].([]interface{})
		for _, v := range calls {
			call, _ := v.(map[string]interface{})
			f, _ := call["function"].(map[string]interface{})
			if text(f["arguments"]) {
				return true
			}
		}
	}
	candidates, _ := m["candidates"].([]interface{})
	for _, v := range candidates {
		c, _ := v.(map[string]interface{})
		content, _ := c["content"].(map[string]interface{})
		parts, _ := content["parts"].([]interface{})
		for _, v := range parts {
			p, _ := v.(map[string]interface{})
			if text(p["text"]) {
				return true
			}
		}
	}
	return false
}
func installModelPerformance(c *gin.Context) *modelPerformanceWriter {
	start := time.Now()
	if value, ok := c.Get("model_performance_start"); ok {
		if t, ok := value.(time.Time); ok {
			start = t
		}
	}
	w := &modelPerformanceWriter{ResponseWriter: c.Writer, started: start}
	c.Writer = w
	return w
}
func (w *modelPerformanceWriter) addUsage(usage map[string]interface{}, end time.Time) {
	if usage == nil || w.first.IsZero() {
		return
	}
	ttft := w.first.Sub(w.started).Seconds() * 1000
	if ttft < 0 {
		return
	}
	usage["performance_ttft_ms"] = ttft
	if estimated, _ := usage["estimated"].(bool); estimated {
		return
	}
	duration := end.Sub(w.first).Seconds()
	if duration <= 0 {
		return
	}
	var tokens float64
	switch n := usage["completion_tokens"].(type) {
	case int64:
		tokens = float64(n)
	case int:
		tokens = float64(n)
	case float64:
		tokens = n
	}
	// Exclude the first token from the post-first-token interval.
	if tokens > 1 {
		usage["performance_tps"] = (tokens - 1) / duration
	}
}
