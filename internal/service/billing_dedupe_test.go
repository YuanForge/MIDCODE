package service

import (
	"testing"

	"fanapi/internal/model"
)

func TestEnsureBillingDedupeKeyUsesExplicitKey(t *testing.T) {
	metrics := model.JSON{"billing_dedupe_key": "fixed-key"}
	got := ensureBillingDedupeKey(1, "corr", "charge", 100, 10, 0, 2, 0, metrics)
	if got != "fixed-key" {
		t.Fatalf("got %q, want explicit key", got)
	}
}

func TestEnsureBillingDedupeKeyStableForSameBillingIdentity(t *testing.T) {
	metricsA := model.JSON{"task_id": int64(9), "volatile": "a"}
	metricsB := model.JSON{"task_id": int64(9), "volatile": "b"}

	keyA := ensureBillingDedupeKey(1, "corr-1", "charge", 100, 10, 0, 9, 0, metricsA)
	keyB := ensureBillingDedupeKey(1, "corr-1", "charge", 200, 20, 0, 9, 0, metricsB)

	if keyA == "" {
		t.Fatal("dedupe key is empty")
	}
	if keyA != keyB {
		t.Fatalf("same billing identity produced different keys: %q vs %q", keyA, keyB)
	}
	if metricsA["billing_dedupe_key"] != keyA {
		t.Fatalf("metrics was not backfilled with billing_dedupe_key")
	}
}

func TestIsDedupeProtectedTx(t *testing.T) {
	for _, txType := range []string{"charge", "hold", "settle"} {
		if !isDedupeProtectedTx(txType) {
			t.Fatalf("%s should be protected by automatic billing dedupe", txType)
		}
	}
	for _, txType := range []string{"refund", "recharge"} {
		if isDedupeProtectedTx(txType) {
			t.Fatalf("%s should not be protected by automatic billing dedupe", txType)
		}
	}
}

func TestHasExplicitRechargeDedupeKey(t *testing.T) {
	if !hasExplicitRechargeDedupeKey("recharge", model.JSON{"billing_dedupe_key": "card-1-2"}) {
		t.Fatal("recharge with explicit billing_dedupe_key should be dedupe protected")
	}
	if hasExplicitRechargeDedupeKey("recharge", model.JSON{}) {
		t.Fatal("recharge without explicit billing_dedupe_key should not be dedupe protected")
	}
	if hasExplicitRechargeDedupeKey("charge", model.JSON{"billing_dedupe_key": "manual"}) {
		t.Fatal("explicit recharge dedupe helper should only apply to recharge transactions")
	}
}
