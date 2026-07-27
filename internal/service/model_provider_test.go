package service

import (
	"strings"
	"testing"

	"fanapi/internal/model"
)

func TestNormalizeModelProviderCode(t *testing.T) {
	if got := normalizeModelProviderCode(" OpenAI_Enterprise "); got != "openai_enterprise" {
		t.Fatalf("normalize code = %q, want openai_enterprise", got)
	}
}

func TestNormalizeModelProviderName(t *testing.T) {
	if got := normalizeModelProviderName("  OpenAI   Enterprise  "); got != "OpenAI Enterprise" {
		t.Fatalf("normalize name = %q, want OpenAI Enterprise", got)
	}
}

func TestValidateModelProviderInput(t *testing.T) {
	tests := []struct {
		name     string
		provider model.ModelProvider
		wantErr  string
	}{
		{name: "valid", provider: model.ModelProvider{Code: "openai", Name: "OpenAI", SortOrder: 0}},
		{name: "blank code", provider: model.ModelProvider{Name: "OpenAI"}, wantErr: "code"},
		{name: "invalid code", provider: model.ModelProvider{Code: "Open AI", Name: "OpenAI"}, wantErr: "code"},
		{name: "blank name", provider: model.ModelProvider{Code: "openai", Name: "  "}, wantErr: "name"},
		{name: "negative sort", provider: model.ModelProvider{Code: "openai", Name: "OpenAI", SortOrder: -1}, wantErr: "sort"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateModelProviderInput(&tt.provider)
			if tt.wantErr == "" && err != nil {
				t.Fatalf("expected valid provider, got %v", err)
			}
			if tt.wantErr != "" && (err == nil || !strings.Contains(strings.ToLower(err.Error()), tt.wantErr)) {
				t.Fatalf("expected %q error, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestProviderCodeCanChange(t *testing.T) {
	if err := providerCodeCanChange("openai", "openai", 3, 2); err != nil {
		t.Fatalf("unchanged referenced code must be accepted: %v", err)
	}
	if err := providerCodeCanChange("openai", "openai-new", 0, 0); err != nil {
		t.Fatalf("unreferenced code must be changeable: %v", err)
	}
	if err := providerCodeCanChange("openai", "openai-new", 1, 0); err == nil {
		t.Fatal("referenced provider code change must be rejected")
	}
}
