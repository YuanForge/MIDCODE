package service

import (
	"testing"

	"fanapi/internal/model"
)

func TestOrderModelGroupRoutesSkipsExcludedChannels(t *testing.T) {
	routes := []ModelGroupRoute{
		{GroupID: 20, Priority: 2, Channel: model.Channel{ID: 200}},
		{GroupID: 10, Priority: 1, Channel: model.Channel{ID: 100}},
		{GroupID: 30, Priority: 3, Channel: model.Channel{ID: 300}},
	}

	ordered := orderModelGroupRoutes(routes, []int64{100})
	if len(ordered) != 2 || ordered[0].GroupID != 20 || ordered[1].GroupID != 30 {
		t.Fatalf("unexpected ordered routes: %+v", ordered)
	}
}

func TestOrderModelGroupRoutesKeepsPriorityOrder(t *testing.T) {
	routes := []ModelGroupRoute{
		{GroupID: 20, Priority: 2, Channel: model.Channel{ID: 200}},
		{GroupID: 10, Priority: 1, Channel: model.Channel{ID: 100}},
	}

	ordered := orderModelGroupRoutes(routes, nil)
	if len(ordered) != 2 || ordered[0].GroupID != 10 || ordered[1].GroupID != 20 {
		t.Fatalf("expected priority order, got %+v", ordered)
	}
}

func TestBuildModelGroupRoutesKeepsProviderOrderAndExclusions(t *testing.T) {
	rows := []modelGroupRouteRow{
		{RouteGroupID: 20, RoutePriority: 2, RouteBindingID: 2, ModelProvider: "OpenAI", Channel: model.Channel{ID: 200}},
		{RouteGroupID: 10, RoutePriority: 1, RouteBindingID: 1, ModelProvider: "OpenAI", Channel: model.Channel{ID: 100}},
	}

	got := buildModelGroupRoutes(rows, []int64{100})
	if len(got) != 1 || got[0].GroupID != 20 || got[0].ModelProvider != "OpenAI" {
		t.Fatalf("unexpected routes: %+v", got)
	}
}

func TestValidateModelGroupRouteProvidersRejectsMixedProviders(t *testing.T) {
	routes := []ModelGroupRoute{
		{GroupID: 10, ModelProvider: "OpenAI"},
		{GroupID: 20, ModelProvider: "Anthropic"},
	}
	if err := validateModelGroupRouteProviders("shared-model", routes); err == nil {
		t.Fatal("expected mixed providers to be rejected")
	}
	if err := validateModelGroupRouteProviders("gpt-4.1", routes[:1]); err != nil {
		t.Fatalf("single provider must be accepted: %v", err)
	}
}
