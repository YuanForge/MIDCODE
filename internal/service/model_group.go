package service

import (
	"fmt"
	"strings"

	"fanapi/internal/model"
)

func normalizeModelGroupPriorities(bindings []model.APIKeyModelGroup) ([]model.APIKeyModelGroup, error) {
	seen := make(map[int64]struct{}, len(bindings))
	normalized := make([]model.APIKeyModelGroup, len(bindings))
	for i, binding := range bindings {
		if binding.GroupID <= 0 {
			return nil, fmt.Errorf("model group id must be positive")
		}
		if _, exists := seen[binding.GroupID]; exists {
			return nil, fmt.Errorf("duplicate model group: %d", binding.GroupID)
		}
		seen[binding.GroupID] = struct{}{}
		binding.Priority = i + 1
		normalized[i] = binding
	}
	return normalized, nil
}

func validateModelGroupModel(channel model.Channel, routingModel string) error {
	want := strings.TrimSpace(routingModel)
	if want == "" {
		return fmt.Errorf("routing model is required")
	}
	if got := ChannelRoutingKey(channel); got != want {
		return fmt.Errorf("routing model %q does not match channel model %q", want, got)
	}
	return nil
}
