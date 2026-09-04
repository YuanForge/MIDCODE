package service

import (
	"errors"
	"testing"

	"fanapi/internal/model"
)

func TestVIPGroupDeleteRequiresExplicitUserCleanup(t *testing.T) {
	err := validateVIPGroupDelete(3, false)
	var referenced *VIPGroupUsersReferencedError
	if !errors.As(err, &referenced) {
		t.Fatalf("expected referenced-user error, got %v", err)
	}
	if !errors.Is(err, ErrVIPGroupReferenced) {
		t.Fatalf("expected referenced-user sentinel, got %v", err)
	}
	if referenced.UserCount != 3 {
		t.Fatalf("user count = %d, want 3", referenced.UserCount)
	}
	if err := validateVIPGroupDelete(3, true); err != nil {
		t.Fatalf("explicit cleanup should allow deletion: %v", err)
	}
	if err := validateVIPGroupDelete(0, false); err != nil {
		t.Fatalf("unused group should allow deletion: %v", err)
	}
}

func TestVIPGroupDeleteResetUserAssignment(t *testing.T) {
	reset := deletedVIPGroupUserUpdate()
	if reset.Group != "" || reset.VIPRechargeBase != 0 {
		t.Fatalf("reset user update = %+v, want empty group and zero baseline", reset)
	}
}

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
