package handler

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const llmStreamCompletedKey = "llm_stream_completed"

// Only a complete, valid SSE message_stop frame ends a native Claude stream.
// A stop_reason/usage update alone is not a completed response.
type claudeCompletionFrame struct {
	event   string
	data    strings.Builder
	invalid bool
}

func (f *claudeCompletionFrame) accept(line string) bool {
	if line == "" {
		var payload struct {
			Type string `json:"type"`
		}
		done := !f.invalid && (f.event == "" || f.event == "message_stop") && json.Unmarshal([]byte(f.data.String()), &payload) == nil && payload.Type == "message_stop"
		*f = claudeCompletionFrame{}
		return done
	}
	if strings.HasPrefix(line, "event:") {
		f.event = strings.TrimPrefix(strings.TrimPrefix(line, "event:"), " ")
	}
	if strings.HasPrefix(line, "data:") && !f.invalid {
		data := strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " ")
		if f.data.Len()+len(data) > 64*1024 {
			f.invalid = true
			f.data.Reset()
		} else {
			f.data.WriteString(data)
			f.data.WriteByte('\n')
		}
	}
	return false
}

func streamNativeClaude(c *gin.Context, scanner *bufio.Scanner, usage *usageState) (error, bool) {
	var frame claudeCompletionFrame
	var streamErr error
	completed := false
	disconnected := c.Stream(func(w io.Writer) bool {
		if !scanner.Scan() {
			streamErr = scanner.Err()
			return false
		}
		line := scanner.Text()
		usage.processLine(line)
		if _, err := fmt.Fprintln(w, line); err != nil {
			streamErr = errors.Join(context.Canceled, err)
			return false
		}
		completed = frame.accept(line)
		if completed {
			// Gin's Flush discards network errors. Unwrap it so a failed final
			// flush never counts as successful delivery.
			var target http.ResponseWriter = c.Writer
			if unwrapper, ok := target.(interface{ Unwrap() http.ResponseWriter }); ok {
				target = unwrapper.Unwrap()
			}
			if err := http.NewResponseController(target).Flush(); err != nil {
				completed = false
				streamErr = errors.Join(context.Canceled, err)
				return false
			}
		}
		// Gin flushes the completed frame before returning. Do not wait for
		// upstream TCP EOF: SDKs may close immediately after message_stop.
		return !completed
	})
	if disconnected && !completed {
		streamErr = context.Canceled
	}
	return streamErr, completed
}
