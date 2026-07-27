package service

import (
	"os"
	"strings"
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

func sourceFunction(t *testing.T, path, start, end string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	source := string(data)
	from := strings.Index(source, start)
	if from < 0 {
		t.Fatalf("missing function %s", start)
	}
	to := strings.Index(source[from+len(start):], end)
	if to < 0 {
		t.Fatalf("missing function boundary %s", end)
	}
	return source[from : from+len(start)+to]
}

func requireActiveProviderJoin(t *testing.T, source string) {
	t.Helper()
	if !strings.Contains(source, `Join("INNER", "model_providers`) || !strings.Contains(source, "mp.is_active = true") {
		t.Fatal("runtime query must join and require an active model provider")
	}
}

func TestModelGroupRouteQueryRequiresActiveProvider(t *testing.T) {
	source := sourceFunction(t, "model_group_routing.go", "func SelectModelGroupRoutes", "func SelectHealthyModelGroupRoutes")
	requireActiveProviderJoin(t, source)
}

func TestExplicitChannelRequiresActiveProvider(t *testing.T) {
	source := sourceFunction(t, "model_group_routing.go", "func IsChannelAuthorizedForAPIKey", "func effectiveChannelProtocol")
	requireActiveProviderJoin(t, source)
}

func TestLegacyChannelQueriesRequireActiveProvider(t *testing.T) {
	getByID := sourceFunction(t, "channel.go", "func GetChannel(", "func InvalidateChannelCache")
	getByName := sourceFunction(t, "channel.go", "func GetChannelByName", "func PatchChannelActive")
	listByModel := sourceFunction(t, "channel.go", "func listChannelsByModel", "func filterChannelsByProtocol")
	for name, source := range map[string]string{"id": getByID, "name": getByName, "model": listByModel} {
		t.Run(name, func(t *testing.T) {
			requireActiveProviderJoin(t, source)
			if strings.Contains(source, "cache.Client.Get") && !strings.Contains(source, "activeModelProvider") {
				t.Fatal("cached channel results must re-check active provider state")
			}
		})
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
		{RouteGroupID: 20, RoutePriority: 2, RouteBindingID: 2, ModelProviderID: 10, Channel: model.Channel{ID: 200}},
		{RouteGroupID: 10, RoutePriority: 1, RouteBindingID: 1, ModelProviderID: 10, Channel: model.Channel{ID: 100}},
	}

	got := buildModelGroupRoutes(rows, []int64{100})
	if len(got) != 1 || got[0].GroupID != 20 || got[0].ModelProviderID != 10 {
		t.Fatalf("unexpected routes: %+v", got)
	}
}

func TestValidateModelGroupRouteProvidersRejectsMixedProviders(t *testing.T) {
	routes := []ModelGroupRoute{
		{GroupID: 10, ModelProviderID: 10},
		{GroupID: 20, ModelProviderID: 20},
	}
	if err := validateModelGroupRouteProviders("shared-model", routes); err == nil {
		t.Fatal("expected mixed providers to be rejected")
	}
	if err := validateModelGroupRouteProviders("gpt-4.1", routes[:1]); err != nil {
		t.Fatalf("single provider must be accepted: %v", err)
	}
}
