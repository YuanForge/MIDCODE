package handler

import "time"

// requestPerformance measures each request, including one turn of a reused websocket.
type requestPerformance struct {
	started, first time.Time
}

func (p *requestPerformance) observe() {
	if p.first.IsZero() {
		p.first = time.Now()
	}
}

func (p *requestPerformance) addUsage(usage map[string]interface{}, end time.Time) {
	if usage == nil || !end.After(p.started) {
		return
	}
	elapsed := end.Sub(p.started)
	usage["performance_duration_ms"] = elapsed.Milliseconds()
	if !p.first.IsZero() {
		usage["performance_ttft_ms"] = float64(p.first.Sub(p.started)) / float64(time.Millisecond)
	}
	if estimated, _ := usage["estimated"].(bool); estimated {
		return
	}
	// End-to-end throughput also covers buffered and non-streaming responses.
	if tokens, ok := numberToFloat64(usage["completion_tokens"]); ok && tokens > 0 {
		usage["performance_tps"] = tokens / elapsed.Seconds()
	}
}
