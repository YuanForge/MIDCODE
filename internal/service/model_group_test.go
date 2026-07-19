package service

import (
	"testing"

	"fanapi/internal/model"
)

func TestNormalizeModelGroupPriorities(t *testing.T) {
	bindings := []model.APIKeyModelGroup{
		{GroupID: 30, Priority: 99},
		{GroupID: 10, Priority: 4},
	}

	normalized, err := normalizeModelGroupPriorities(bindings)
	if err != nil {
		t.Fatalf("normalize priorities: %v", err)
	}
	if normalized[0].GroupID != 30 || normalized[0].Priority != 1 {
		t.Fatalf("expected first binding to retain order and priority 1, got %+v", normalized[0])
	}
	if normalized[1].GroupID != 10 || normalized[1].Priority != 2 {
		t.Fatalf("expected second binding to retain order and priority 2, got %+v", normalized[1])
	}
}

func TestNormalizeModelGroupPrioritiesRejectsDuplicateGroups(t *testing.T) {
	_, err := normalizeModelGroupPriorities([]model.APIKeyModelGroup{
		{GroupID: 10},
		{GroupID: 10},
	})
	if err == nil {
		t.Fatal("expected duplicate group IDs to be rejected")
	}
}

func TestValidateModelGroupModelRequiresMatchingRoutingKey(t *testing.T) {
	channel := model.Channel{Model: "gpt-4o", DisplayName: "gpt-4o-cheap"}
	if err := validateModelGroupModel(channel, "gpt-4o"); err == nil {
		t.Fatal("expected mismatched routing model to be rejected")
	}
	if err := validateModelGroupModel(channel, "gpt-4o-cheap"); err != nil {
		t.Fatalf("expected matching routing model, got %v", err)
	}
}
