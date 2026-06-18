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

func TestIsConsumptionTx(t *testing.T) {
	for _, txType := range []string{"charge", "hold", "settle"} {
		if !isConsumptionTx(txType) {
			t.Fatalf("%s should be a consumption transaction", txType)
		}
	}
	if isConsumptionTx("refund") {
		t.Fatal("refund should not be a consumption transaction")
	}
}
