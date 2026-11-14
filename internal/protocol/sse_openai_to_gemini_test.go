package protocol

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestOpenAIToGeminiStreaming(t *testing.T) {
	c := NewSSEConverter(ProtocolOpenAI, ProtocolGemini)
	lines := []string{
		`data: {"model":"gemini-3.8-flash","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}`,
		`data: {"choices":[{"index":0,"delta":{},"finish_reason":"length"}]}`,
		`data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20,"completion_tokens_details":{"reasoning_tokens":3}}}`,
		`data: [DONE]`,
	}
	var events []map[string]interface{}
	for _, line := range lines {
		for _, out := range c.Convert(line) {
			if out == "" {
				continue
			}
			if strings.Contains(out, "choices") || strings.Contains(out, "[DONE]") {
				t.Fatal(out)
			}
			var v map[string]interface{}
			if err := json.Unmarshal([]byte(strings.TrimPrefix(out, "data: ")), &v); err != nil {
				t.Fatal(err)
			}
			events = append(events, v)
		}
	}
	if len(events) != 3 {
		t.Fatalf("events %v", events)
	}
	cand := events[0]["candidates"].([]interface{})[0].(map[string]interface{})
	content := cand["content"].(map[string]interface{})
	if content["role"] != "model" || content["parts"].([]interface{})[0].(map[string]interface{})["text"] != "你好" {
		t.Fatal(content)
	}
	if events[1]["candidates"].([]interface{})[0].(map[string]interface{})["finishReason"] != "MAX_TOKENS" {
		t.Fatal(events[1])
	}
	if events[2]["usageMetadata"].(map[string]interface{})["candidatesTokenCount"] != float64(5) {
		t.Fatal(events[2])
	}
	if len(c.Flush()) != 0 {
		t.Fatal("must not synthesize OpenAI terminator")
	}
}

func TestGeminiStreamToolsAndRouting(t *testing.T) {
	for _, source := range []string{ProtocolOpenAI, ProtocolClaude, ProtocolResponses} {
		if NewSSEConverter(source, ProtocolGemini) == nil {
			t.Fatal(source)
		}
	}
	if NewSSEConverter(ProtocolGemini, ProtocolGemini) != nil {
		t.Fatal("native passthrough changed")
	}
	c := NewSSEConverter(ProtocolOpenAI, ProtocolGemini)
	c.Convert(`data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"name":"weather","arguments":"{\"city\":"}}]}}]}`)
	c.Convert(`data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"Paris\"}"}}]}}]}`)
	out := strings.Join(c.Convert(`data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}`), "\n")
	if !strings.Contains(out, `"functionCall":{"args":{"city":"Paris"},"name":"weather"}`) {
		t.Fatal(out)
	}
}
