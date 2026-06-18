package billing

import "testing"

func TestQuotaReserveNeededOnlyFillsActualGap(t *testing.T) {
	tests := []struct {
		name            string
		required        int64
		activeRemaining int64
		want            int64
	}{
		{name: "no active quota", required: 36_000, activeRemaining: 0, want: 36_000},
		{name: "partial active quota", required: 36_000, activeRemaining: 10_000, want: 26_000},
		{name: "active quota already enough", required: 36_000, activeRemaining: 36_000, want: 0},
		{name: "active quota above requirement", required: 36_000, activeRemaining: 90_000, want: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := quotaReserveNeeded(tt.required, tt.activeRemaining); got != tt.want {
				t.Fatalf("quotaReserveNeeded(%d, %d) = %d, want %d", tt.required, tt.activeRemaining, got, tt.want)
			}
		})
	}
}
