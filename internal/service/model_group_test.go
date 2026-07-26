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
	if err := validateModelGroupInput(&model.ModelGroup{Code: " ", Name: "x"}); err == nil {
		t.Fatal("expected blank code to be rejected")
	}
	if err := validateModelGroupInput(&model.ModelGroup{Code: "cheap", Name: " "}); err == nil {
		t.Fatal("expected blank name to be rejected")
	}
	if err := validateModelGroupInput(&model.ModelGroup{Code: "cheap", Name: "Low price", ModelProvider: " "}); err == nil {
		t.Fatal("expected blank model provider to be rejected")
	}
	if err := validateModelGroupInput(&model.ModelGroup{Code: "cheap", Name: "Low price", ModelProvider: "OpenAI"}); err != nil {
		t.Fatalf("expected valid group input, got %v", err)
	}
}

func TestNormalizeModelProvider(t *testing.T) {
	cases := map[string]string{
		" openai ":      "OpenAI",
		"ANTHROPIC":     "Anthropic",
		"google":        "Google",
		"deepseek":      "DeepSeek",
		"ALIBABA":       "Alibaba",
		"Acme   Models": "Acme Models",
	}
	for input, want := range cases {
		if got := normalizeModelProvider(input); got != want {
			t.Fatalf("normalizeModelProvider(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestValidateModelGroupChannelProvider(t *testing.T) {
	group := model.ModelGroup{Code: "gpt", Name: "GPT", ModelProvider: "OpenAI"}
	if err := validateModelGroupChannelProvider(group, model.Channel{Model: "gpt-4.1", ModelProvider: "openai"}); err != nil {
		t.Fatalf("expected matching provider, got %v", err)
	}
	if err := validateModelGroupChannelProvider(group, model.Channel{Model: "claude-sonnet-4", ModelProvider: "Anthropic"}); err == nil {
		t.Fatal("expected mismatched provider to fail")
	}
	if err := validateModelGroupChannelProvider(group, model.Channel{Model: "custom-model"}); err == nil {
		t.Fatal("expected an unknown channel provider to fail")
	}
}

func TestCanonicalModelProviderReusesExistingCustomName(t *testing.T) {
	got := canonicalModelProvider("acme models", []string{"OpenAI", "Acme Models"})
	if got != "Acme Models" {
		t.Fatalf("canonical provider = %q, want %q", got, "Acme Models")
	}
}

func TestValidateRoutingModelProvider(t *testing.T) {
	if err := validateRoutingModelProvider("gpt-4.1", "OpenAI", "openai"); err != nil {
		t.Fatalf("same provider must be accepted: %v", err)
	}
	if err := validateRoutingModelProvider("shared-model", "Anthropic", "OpenAI"); err == nil {
		t.Fatal("expected a cross-provider routing model to be rejected")
	}
}

func TestValidateModelGroupProviderChange(t *testing.T) {
	channels := []model.Channel{
		{Model: "gpt-4.1", ModelProvider: "OpenAI"},
		{Model: "gpt-5", ModelProvider: "openai"},
	}
	if err := validateModelGroupProviderChange("OpenAI", channels); err != nil {
		t.Fatalf("matching channels must be accepted: %v", err)
	}
	if err := validateModelGroupProviderChange("Anthropic", channels); err == nil {
		t.Fatal("expected provider change with conflicting channels to fail")
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
