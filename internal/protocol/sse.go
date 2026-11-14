package protocol

// SSEConverter converts SSE lines from one protocol format to another.
// Convert is called for each line read from the upstream response body.
// Flush is called once after the scanner reaches EOF to emit any trailing lines.
// Both methods return zero or more output lines; each will be written followed by "\n".
type SSEConverter interface {
	Convert(line string) []string
	Flush() []string
}

type chainedSSEConverter struct {
	first  SSEConverter
	second SSEConverter
}

func (c *chainedSSEConverter) Convert(line string) []string {
	var out []string
	for _, mid := range c.first.Convert(line) {
		out = append(out, c.second.Convert(mid)...)
	}
	return out
}

func (c *chainedSSEConverter) Flush() []string {
	var out []string
	for _, mid := range c.first.Flush() {
		out = append(out, c.second.Convert(mid)...)
	}
	out = append(out, c.second.Flush()...)
	return out
}

// NewSSEConverter returns an SSEConverter for the given (sourceProto -> clientProto) pair.
// Returns nil when no conversion is needed (same format, or unsupported pair).
func NewSSEConverter(sourceProto, clientProto string) SSEConverter {
	if sourceProto == clientProto {
		return nil
	}
	switch {
	case sourceProto == ProtocolOpenAI && clientProto == ProtocolGemini:
		return &openAIToGeminiSSE{}
	case sourceProto == ProtocolClaude && clientProto == ProtocolGemini:
		return &chainedSSEConverter{first: &claudeToOpenAISSE{}, second: &openAIToGeminiSSE{}}
	case sourceProto == ProtocolResponses && clientProto == ProtocolGemini:
		return &chainedSSEConverter{first: &responsesToOpenAISSE{}, second: &openAIToGeminiSSE{}}
	case sourceProto == ProtocolClaude && clientProto == ProtocolOpenAI:
		return &claudeToOpenAISSE{}
	case sourceProto == ProtocolGemini && clientProto == ProtocolOpenAI:
		return &geminiToOpenAISSE{}
	case sourceProto == ProtocolResponses && clientProto == ProtocolOpenAI:
		return &responsesToOpenAISSE{}
	case sourceProto == ProtocolOpenAI && clientProto == ProtocolClaude:
		return &openAIToClaudeSSE{}
	case sourceProto == ProtocolOpenAI && clientProto == ProtocolResponses:
		return &openAIToResponsesSSE{}
	case sourceProto == ProtocolResponses && clientProto == ProtocolClaude:
		return &chainedSSEConverter{
			first:  &responsesToOpenAISSE{},
			second: &openAIToClaudeSSE{},
		}
	default:
		// Unsupported pair: pass lines through unchanged so the client at least gets something.
		return nil
	}
}
