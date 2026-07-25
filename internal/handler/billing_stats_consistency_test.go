package handler

import (
	"os"
	"strings"
	"testing"
)

func TestLLMAbortRefundKeepsAPIKeyID(t *testing.T) {
	billingSource, err := os.ReadFile("llm_billing.go")
	if err != nil {
		t.Fatal(err)
	}
	llmSource, err := os.ReadFile("llm.go")
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(string(billingSource), "func llmRefundAndAbort(c *gin.Context, corrID string, userID, apiKeyIDVal, credits") {
		t.Fatal("llmRefundAndAbort must receive the API key ID")
	}
	if !strings.Contains(string(billingSource), "recordLLMRefundTxDetached(c, userID, 0, apiKeyIDVal, poolKeyIDVal") {
		t.Fatal("aborted LLM refunds must retain the API key ID")
	}
	if strings.Contains(string(llmSource), "llmRefundAndAbort(c, corrID, userID, totalHold") {
		t.Fatal("all llmRefundAndAbort callers must pass the API key ID")
	}
}

func TestUserSpendStatsUseSharedConsumptionTypes(t *testing.T) {
	apiKeySource, err := os.ReadFile("auth_api_key.go")
	if err != nil {
		t.Fatal(err)
	}
	statsSource, err := os.ReadFile("auth_stats.go")
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(string(statsSource), `const consumptionTransactionTypes = "'charge','hold','settle','consume'"`) {
		t.Fatal("consumption transaction types must be defined once for user statistics")
	}
	if !strings.Contains(string(apiKeySource), "type IN (`+consumptionTransactionTypes+`)") {
		t.Fatal("API key spend statistics must use the shared consumption transaction types")
	}
	if !strings.Contains(string(apiKeySource), "WITH corr_keys AS") ||
		!strings.Contains(string(apiKeySource), "WHEN bt.type = 'refund' THEN COALESCE(ck.api_key_id, 0)") {
		t.Fatal("legacy refunds without an API key must be attributed by correlation ID")
	}
	if strings.Count(string(statsSource), "type IN (`+consumptionTransactionTypes+`)") != 3 {
		t.Fatal("dashboard total, today, and trend statistics must use the shared consumption transaction types")
	}
}
