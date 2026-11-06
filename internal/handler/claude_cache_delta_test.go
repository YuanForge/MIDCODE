package handler

import "testing"

func TestClaudeFinalCacheUsage(t *testing.T) {
	for _, tc := range []struct {
		name, delta        string
		input, write, read int64
	}{
		{"final upstream totals", `{"input_tokens":2389,"cache_creation_input_tokens":1075,"cache_read_input_tokens":9344,"output_tokens":18}`, 2389, 1075, 9344},
		{"absent fields preserved", `{"output_tokens":18}`, 5947, 123, 456},
		{"explicit zero", `{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":18}`, 0, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			u := &usageState{protocol: protocolClaude}
			u.processLine("event: message_start")
			u.processLine(`data: {"message":{"usage":{"input_tokens":5947,"cache_creation_input_tokens":123,"cache_read_input_tokens":456}}}`)
			u.processLine("event: message_delta")
			u.processLine(`data: {"usage":` + tc.delta + `}`)
			if u.promptTokens != tc.input || u.cacheCreationTokens != tc.write || u.cacheReadTokens != tc.read {
				t.Fatalf("incorrect final totals: %+v", u)
			}
			got := u.normalized(nil)
			if got["prompt_tokens"] != tc.input || got["completion_tokens"] != int64(18) {
				t.Fatalf("incorrect normalized usage: %v", got)
			}
			if tc.read > 0 && got["cache_read_tokens"] != tc.read {
				t.Fatalf("lost cache usage: %v", got)
			}
		})
	}
}
