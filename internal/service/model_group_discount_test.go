package service

import "testing"

func TestParseUSDCNYExchangeRate(t *testing.T) {
	got, err := ParseUSDCNYExchangeRate("7.20")
	if err != nil {
		t.Fatalf("ParseUSDCNYExchangeRate returned error: %v", err)
	}
	if got != 7.2 {
		t.Fatalf("ParseUSDCNYExchangeRate = %v, want 7.2", got)
	}
	trimmed, err := ParseUSDCNYExchangeRate(" 7.20 ")
	if err != nil {
		t.Fatalf("ParseUSDCNYExchangeRate with surrounding whitespace returned error: %v", err)
	}
	if trimmed != 7.2 {
		t.Fatalf("ParseUSDCNYExchangeRate with surrounding whitespace = %v, want 7.2", trimmed)
	}

	for _, value := range []string{"0", "-1", "NaN", "Inf", "", " ", "not-a-number"} {
		if _, err := ParseUSDCNYExchangeRate(value); err == nil {
			t.Errorf("ParseUSDCNYExchangeRate(%q) returned nil error", value)
		}
	}
}

func TestUSDCNYExchangeRateOrDefault(t *testing.T) {
	if got := USDCNYExchangeRateOrDefault("bad"); got != 7.2 {
		t.Fatalf("USDCNYExchangeRateOrDefault = %v, want 7.2", got)
	}
}
