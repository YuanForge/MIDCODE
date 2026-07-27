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

func TestValidateModelGroupInput(t *testing.T) {
	if err := validateModelGroupInput(&model.ModelGroup{Code: " ", Name: "x", ModelProviderID: 1}); err == nil {
		t.Fatal("expected blank code to be rejected")
	}
	if err := validateModelGroupInput(&model.ModelGroup{Code: "cheap", Name: " ", ModelProviderID: 1}); err == nil {
		t.Fatal("expected blank name to be rejected")
	}
	if err := validateModelGroupInput(&model.ModelGroup{Code: "cheap", Name: "Low price"}); err == nil {
		t.Fatal("expected missing model provider id to be rejected")
	}
	if err := validateModelGroupInput(&model.ModelGroup{Code: "cheap", Name: "Low price", ModelProviderID: 1}); err != nil {
		t.Fatalf("expected valid group input, got %v", err)
	}
}

func TestValidateModelGroupChannelProvider(t *testing.T) {
	group := model.ModelGroup{Code: "gpt", Name: "GPT", ModelProviderID: 10}
	if err := validateModelGroupChannelProvider(group, model.Channel{Model: "gpt-4.1", ModelProviderID: 10}); err != nil {
		t.Fatalf("expected matching provider, got %v", err)
	}
	if err := validateModelGroupChannelProvider(group, model.Channel{Model: "claude-sonnet-4", ModelProviderID: 20}); err == nil {
		t.Fatal("expected mismatched provider to fail")
	}
	if err := validateModelGroupChannelProvider(group, model.Channel{Model: "custom-model"}); err == nil {
		t.Fatal("expected an unknown channel provider to fail")
	}
}

func TestValidateRoutingModelProvider(t *testing.T) {
	if err := validateRoutingModelProvider("gpt-4.1", 10, 10); err != nil {
		t.Fatalf("same provider must be accepted: %v", err)
	}
	if err := validateRoutingModelProvider("shared-model", 20, 10); err == nil {
		t.Fatal("expected a cross-provider routing model to be rejected")
	}
}

func TestValidateModelGroupProviderChange(t *testing.T) {
	channels := []model.Channel{
		{Model: "gpt-4.1", ModelProviderID: 10},
		{Model: "gpt-5", ModelProviderID: 10},
	}
	if err := validateModelGroupProviderChange(10, channels); err != nil {
		t.Fatalf("matching channels must be accepted: %v", err)
	}
	if err := validateModelGroupProviderChange(20, channels); err == nil {
		t.Fatal("expected provider change with conflicting channels to fail")
	}
}

func TestProviderSelectionAllowed(t *testing.T) {
	active := model.ModelProvider{ID: 10, IsActive: true}
	inactive := model.ModelProvider{ID: 20, IsActive: false}
	if err := providerSelectionAllowed(0, active); err != nil {
		t.Fatalf("new active provider must be accepted: %v", err)
	}
	if err := providerSelectionAllowed(20, inactive); err != nil {
		t.Fatalf("unchanged inactive provider must be accepted: %v", err)
	}
	if err := providerSelectionAllowed(0, inactive); err == nil {
		t.Fatal("new inactive provider must be rejected")
	}
	if err := providerSelectionAllowed(10, inactive); err == nil {
		t.Fatal("switching to an inactive provider must be rejected")
	}
}

func TestValidateAPIKeyGroupSelectionRequiresAtLeastOneGroup(t *testing.T) {
	if err := validateAPIKeyGroupSelection(nil); err == nil {
		t.Fatal("expected an API key to require at least one model group")
	}
	if err := validateAPIKeyGroupSelection([]int64{1, 2}); err != nil {
		t.Fatalf("expected group selection to be accepted, got %v", err)
	}
}
