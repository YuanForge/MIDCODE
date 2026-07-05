package billing

import (
	"errors"
	"testing"
	"time"
)

func TestRunBillingScriptReturnsNumber(t *testing.T) {
	got, err := RunBillingScript(`function calcCost(req) { return req.units * 3; }`, map[string]interface{}{"units": 7}, nil)
	if err != nil {
		t.Fatalf("RunBillingScript returned error: %v", err)
	}
	if got != 21 {
		t.Fatalf("got %d, want 21", got)
	}
}

func TestRunBillingScriptTimesOut(t *testing.T) {
	start := time.Now()
	_, err := RunBillingScript(`function calcCost(req) { while (true) {} }`, map[string]interface{}{}, nil)
	if !errors.Is(err, errBillingScriptTimeout) {
		t.Fatalf("got %v, want timeout", err)
	}
	if elapsed := time.Since(start); elapsed > billingScriptExecutionTimeout+time.Second {
		t.Fatalf("timeout took too long: %s", elapsed)
	}
}
