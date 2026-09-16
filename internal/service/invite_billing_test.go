package service

import (
	"fanapi/internal/model"
	"testing"
)

func TestInviteFundsConsumptionAndRefund(t *testing.T) {
	var row model.InviteRebate
	available := applyInviteFunds(&row, 500, "hold", 10000, 0)
	if available != 0 || row.EligibleCredits != 9500 || row.RewardCredits != 500 {
		t.Fatalf("hold: %+v available=%d", row, available)
	}
	available = applyInviteFunds(&row, available, "refund", 9500, 0)
	if available != 0 || row.EligibleCredits != 0 || row.RewardCredits != 500 {
		t.Fatalf("partial refund: %+v available=%d", row, available)
	}
	available = applyInviteFunds(&row, available, "refund", 500, 0)
	if available != 500 || row.EligibleCredits != 0 || row.RewardCredits != 0 || row.GeneralCredits != 0 {
		t.Fatalf("full refund: %+v available=%d", row, available)
	}
}

func TestInviteRewardCannotPropagate(t *testing.T) {
	var lower, upper model.InviteRebate
	_ = applyInviteFunds(&lower, 0, "charge", 10000, 0)
	reward := int64(float64(lower.EligibleCredits) * 0.05)
	available := applyInviteFunds(&upper, reward, "hold", reward, 0)
	if available != 0 || upper.EligibleCredits != 0 {
		t.Fatalf("reward consumption generated rebate base: %+v", upper)
	}
	_ = applyInviteFunds(&upper, available, "settle", 200, 0)
	if upper.EligibleCredits != 200 {
		t.Fatalf("only extra paid balance should qualify: %+v", upper)
	}
}

func TestInviteFundsModelCreditRefund(t *testing.T) {
	var row model.InviteRebate
	available := applyInviteFunds(&row, 500, "hold", 2000, 1000)
	if row.EligibleCredits != 1500 {
		t.Fatal(row)
	}
	available = applyInviteFunds(&row, available, "refund", 1200, 200)
	if available != 500 || row.RewardCredits != 0 || row.EligibleCredits != 800 {
		t.Fatalf("wrong refund source %+v available=%d", row, available)
	}
}
