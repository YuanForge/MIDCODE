package handler

import "testing"

func TestPlanCreditsFromSettingMatchesBonus(t *testing.T) {
	raw := `[{"amount":10,"credits":100,"bonus":20}]`
	if got := planCreditsFromSetting(raw, 10); got != 120_000_000 {
		t.Fatalf("matched credits = %d, want 120000000", got)
	}
}

func TestPlanCreditsFromSettingUsesStandardRateForCustomAmount(t *testing.T) {
	raw := `[{"amount":10,"credits":100,"bonus":20}]`
	if got := planCreditsFromSetting(raw, 11); got != 11_000_000 {
		t.Fatalf("custom credits = %d, want 11000000", got)
	}
}
