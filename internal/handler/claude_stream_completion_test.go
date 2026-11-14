package handler

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
)

type completionWriter struct {
	*httptest.ResponseRecorder
	gone               chan bool
	cancel             context.CancelFunc
	writeErr, flushErr error
}

func (w *completionWriter) CloseNotify() <-chan bool { return w.gone }
func (w *completionWriter) Write(p []byte) (int, error) {
	if w.writeErr != nil {
		return 0, w.writeErr
	}
	return w.ResponseRecorder.Write(p)
}
func (w *completionWriter) FlushError() error {
	if w.cancel != nil {
		w.cancel()
		close(w.gone)
		w.cancel = nil
	}
	return w.flushErr
}

type noEOFReader struct{}

func (noEOFReader) Read([]byte) (int, error) {
	return 0, errors.New("unexpected read after terminal frame")
}

func TestNativeClaudeCompletedBeforeDisconnect(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w := &completionWriter{ResponseRecorder: httptest.NewRecorder(), gone: make(chan bool), cancel: cancel}
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/v1/messages", nil).WithContext(ctx)
	body := "event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":3}}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
	u := &usageState{protocol: protocolClaude}
	err, done := streamNativeClaude(c, bufio.NewScanner(io.MultiReader(strings.NewReader(body), noEOFReader{})), u)
	if err != nil || !done || ctx.Err() == nil || w.Body.String() != body || u.completTokens != 3 {
		t.Fatalf("err=%v done=%v canceled=%v usage=%d", err, done, ctx.Err(), u.completTokens)
	}
	c.Set(llmStreamCompletedKey, done)
	old := llmLogWriteCh
	llmLogWriteCh = make(chan llmLogOp, 4)
	t.Cleanup(func() { llmLogWriteCh = old })
	// Non-token zero-hold isolates the cancellation gate from DB/pricing.
	llmSettle(c, &model.Channel{BillingType: "count"}, nil, nil, 0, 3, 219, 0, 0, "complete", "", err)
	if op := <-llmLogWriteCh; op.record.Status != "ok" {
		t.Fatalf("completed response refunded: %+v", op.record)
	}
}

func TestNativeClaudeIncompleteAndDeliveryFailure(t *testing.T) {
	for _, tc := range []struct {
		name, body         string
		writeErr, flushErr error
		cancelBefore       bool
	}{
		{name: "usage-only", body: "event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":3}}\n\n"},
		{name: "missing-delimiter", body: "event: message_stop\ndata: {\"type\":\"message_stop\"}\n"},
		{name: "malformed", body: "event: message_stop\ndata: broken\n\n"},
		{name: "event-only", body: "event: message_stop\n\n"},
		{name: "write-failure", body: "data: {\"type\":\"message_stop\"}\n\n", writeErr: io.ErrClosedPipe},
		{name: "flush-failure", body: "data: {\"type\":\"message_stop\"}\n\n", flushErr: io.ErrClosedPipe},
		{name: "canceled-before-terminal", body: "data: {\"type\":\"message_stop\"}\n\n", cancelBefore: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := &completionWriter{ResponseRecorder: httptest.NewRecorder(), gone: make(chan bool), writeErr: tc.writeErr, flushErr: tc.flushErr}
			if tc.cancelBefore {
				close(w.gone)
			}
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("POST", "/v1/messages", nil)
			err, done := streamNativeClaude(c, bufio.NewScanner(strings.NewReader(tc.body)), &usageState{protocol: protocolClaude})
			if done {
				t.Fatal("incomplete/failed response marked completed")
			}
			if (tc.cancelBefore || tc.writeErr != nil || tc.flushErr != nil) && !errors.Is(err, context.Canceled) {
				t.Fatalf("delivery failure must refund: %v", err)
			}
		})
	}
}

func TestClaudeCompletionFrames(t *testing.T) {
	for _, body := range []string{"data:{\"type\":\"message_stop\"}\n\n", "event:message_stop\ndata: {\n data:ignored\ndata: \"type\":\"message_stop\"}\n\n"} {
		var frame claudeCompletionFrame
		done := false
		s := bufio.NewScanner(strings.NewReader(body))
		for s.Scan() {
			done = frame.accept(s.Text()) || done
		}
		if !done {
			t.Fatalf("valid frame not recognized: %q", body)
		}
	}
}
