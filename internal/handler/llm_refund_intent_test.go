package handler

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestLLMRefundPlanPreservesOwedAmountWithoutRedis(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("model_credit_general_charged", int64(18198))
	c.Set("model_credit_charged", int64(200))
	credits, model := llmRefundCredits(c, 247, 16354)
	if credits != 16354 || model != 0 {
		t.Fatalf("owed refund changed: credits=%d model=%d", credits, model)
	}
	if c.GetInt64("model_credit_general_charged") != 18198 {
		t.Fatal("planning consumed allocation before durable intent")
	}
	credits, model = llmRefundCredits(c, 247, 18298)
	if credits != 18298 || model != 100 {
		t.Fatalf("mixed allocation: credits=%d model=%d", credits, model)
	}
}
