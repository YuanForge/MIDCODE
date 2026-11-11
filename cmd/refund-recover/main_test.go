package main

import "testing"

func TestRecoveryPlanRejectsUnsafeOrDuplicateCredits(t *testing.T) {
	valid := recoveryEntry{UserID: 247, CorrID: "request", Credits: 16354, ExpectedNet: 18198, Evidence: "original refund timeout"}
	if err := validatePlan(recoveryPlan{Incident: "test", Entries: []recoveryEntry{valid}}); err != nil {
		t.Fatal(err)
	}
	cases := map[string]recoveryEntry{
		"over_refund":             {UserID: 247, CorrID: "request", Credits: 18199, ExpectedNet: 18198, Evidence: "evidence"},
		"model_cannot_be_general": {UserID: 247, CorrID: "request", Credits: 100, ExpectedNet: 100, ExpectedModelNet: 100, Evidence: "evidence"},
		"model_without_routing":   {UserID: 247, CorrID: "request", Credits: 100, ModelCredits: 100, ExpectedNet: 100, ExpectedModelNet: 100, Evidence: "evidence"},
		"no_evidence":             {UserID: 247, CorrID: "request", Credits: 1, ExpectedNet: 100},
	}
	for name, e := range cases {
		t.Run(name, func(t *testing.T) {
			if validatePlan(recoveryPlan{Incident: "test", Entries: []recoveryEntry{e}}) == nil {
				t.Fatal("unsafe plan accepted")
			}
		})
	}
	if validatePlan(recoveryPlan{Incident: "test", Entries: []recoveryEntry{valid, valid}}) == nil {
		t.Fatal("duplicate request accepted")
	}
}
