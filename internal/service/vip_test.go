package service

import (
	"testing"

	"fanapi/internal/model"
)

func TestSelectVIPUpgradeUsesHighestEligibleActiveGroup(t *testing.T) {
	groups := []model.VIPGroup{
		{Code: "vip3000", RechargeThreshold: 3000_000_000, IsActive: true},
		{Code: "vip1000", RechargeThreshold: 1000_000_000, IsActive: true},
		{Code: "vip500", RechargeThreshold: 500_000_000, IsActive: true},
		{Code: "vip100", RechargeThreshold: 100_000_000, IsActive: true},
		{Code: "vip50", RechargeThreshold: 50_000_000, IsActive: true},
	}

	group, changed := selectVIPUpgrade("", 100_000_000, groups)
	if group != "vip100" || !changed {
		t.Fatalf("selectVIPUpgrade = (%q, %v), want (vip100, true)", group, changed)
	}
}

func TestSelectVIPUpgradeDoesNotDowngradeAutomatically(t *testing.T) {
	groups := []model.VIPGroup{
		{Code: "vip3000", RechargeThreshold: 3000_000_000, IsActive: true},
		{Code: "vip1000", RechargeThreshold: 1000_000_000, IsActive: true},
		{Code: "vip500", RechargeThreshold: 500_000_000, IsActive: true},
		{Code: "vip100", RechargeThreshold: 100_000_000, IsActive: true},
		{Code: "vip50", RechargeThreshold: 50_000_000, IsActive: true},
	}

	group, changed := selectVIPUpgrade("vip3000", 100_000_000, groups)
	if group != "vip3000" || changed {
		t.Fatalf("selectVIPUpgrade = (%q, %v), want (vip3000, false)", group, changed)
	}
}

func TestRechargeAfterBaselineRestartsUpgradeAccumulation(t *testing.T) {
	if got := rechargeAfterBaseline(3_100_000_000, 3_000_000_000); got != 100_000_000 {
		t.Fatalf("rechargeAfterBaseline = %d, want %d", got, int64(100_000_000))
	}
	if got := rechargeAfterBaseline(100_000_000, 300_000_000); got != 0 {
		t.Fatalf("rechargeAfterBaseline below baseline = %d, want 0", got)
	}
}

func TestSelectVIPUpgradeAfterManualDowngradeUsesRechargeAfterBaseline(t *testing.T) {
	groups := []model.VIPGroup{
		{Code: "vip3000", RechargeThreshold: 3000_000_000, IsActive: true},
		{Code: "vip1000", RechargeThreshold: 1000_000_000, IsActive: true},
		{Code: "vip500", RechargeThreshold: 500_000_000, IsActive: true},
		{Code: "vip100", RechargeThreshold: 100_000_000, IsActive: true},
		{Code: "vip50", RechargeThreshold: 50_000_000, IsActive: true},
	}

	group, changed := selectVIPUpgrade("vip50", rechargeAfterBaseline(1_100_000_000, 1_000_000_000), groups)
	if group != "vip100" || !changed {
		t.Fatalf("selectVIPUpgrade after baseline = (%q, %v), want (vip100, true)", group, changed)
	}
}
