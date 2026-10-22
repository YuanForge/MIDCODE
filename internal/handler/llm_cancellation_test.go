package handler

import (
	"context"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"fanapi/internal/model"

	"github.com/gin-gonic/gin"
)

func TestCanceledLLMDoesNotSettleUsage(t *testing.T) {
	oldQueue := llmLogWriteCh
	t.Cleanup(func() { llmLogWriteCh = oldQueue })
	for _, source := range []string{"request", "stream"} {
		for _, kind := range []string{"token", "image"} {
			for _, estimated := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s/%s/estimated=%v", source, kind, estimated), func(t *testing.T) {
					llmLogWriteCh = make(chan llmLogOp, 4)
					c, _ := gin.CreateTestContext(httptest.NewRecorder())
					ctx, cancel := context.WithCancel(context.Background())
					defer cancel()
					c.Request = httptest.NewRequest("POST", "/v1/responses", nil).WithContext(ctx)
					var streamErr error
					if source == "request" {
						cancel()
					} else {
						streamErr = fmt.Errorf("read upstream: %w", context.Canceled)
					}
					usage := map[string]interface{}{"prompt_tokens": int64(1608419), "completion_tokens": int64(5), "estimated": estimated}
					ch := &model.Channel{BillingType: kind, BillingConfig: model.JSON{
						"input_from_response": true, "gpt_context_pricing": true,
						"input_price_per_1m_tokens": int64(340000), "output_price_per_1m_tokens": int64(1700000),
					}}
					// With no hold, any attempt to bill this usage would need the DB/Redis.
					// Cancellation must return before pricing/charging, including non-token paths.
					llmSettle(c, ch, nil, usage, 0, 81, 204, 0, 0, "canceled", "", streamErr)
					if len(llmLogWriteCh) != 1 {
						t.Fatalf("expected exactly one final log patch, got %d", len(llmLogWriteCh))
					}
					op := <-llmLogWriteCh
					if op.record.Status != "refunded" || op.record.ErrorMsg != "context canceled" {
						t.Fatalf("cancellation overwritten: %+v", op.record)
					}
					if _, priced := usage["context_tier"]; priced {
						t.Fatal("canceled request reached context-tier pricing")
					}
				})
			}
		}
	}
}

func TestCanceledLLMIncompleteRefundIsNotSuccessful(t *testing.T) {
	oldQueue := llmLogWriteCh
	t.Cleanup(func() { llmLogWriteCh = oldQueue })
	llmLogWriteCh = make(chan llmLogOp, 4)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	// Missing charged-credit allocations mean the hold cannot be refunded.
	llmSettle(c, &model.Channel{BillingType: "token"}, nil, nil, 787482, 81, 204, 0, 0, "partial", "", context.Canceled)
	op := <-llmLogWriteCh
	if op.record.Status != "error" || !strings.Contains(op.record.ErrorMsg, "refund incomplete") {
		t.Fatalf("incomplete refund reported as success: %+v", op.record)
	}
}
