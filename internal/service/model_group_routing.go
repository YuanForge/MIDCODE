package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"fanapi/internal/db"
	"fanapi/internal/model"
)

var ErrAPIKeyModelGroupsNotConfigured = errors.New("api key has no model groups configured")

type ModelGroupRoute struct {
	GroupID         int64
	Priority        int
	BindingID       int64
	ModelProviderID int64
	Channel         model.Channel
}

type modelGroupRouteRow struct {
	RouteGroupID    int64 `xorm:"route_group_id"`
	RoutePriority   int   `xorm:"route_priority"`
	RouteBindingID  int64 `xorm:"route_binding_id"`
	ModelProviderID int64 `xorm:"route_model_provider_id"`
	model.Channel   `xorm:"extends"`
}

func buildModelGroupRoutes(rows []modelGroupRouteRow, excludedIDs []int64) []ModelGroupRoute {
	routes := make([]ModelGroupRoute, 0, len(rows))
	for _, row := range rows {
		routes = append(routes, ModelGroupRoute{
			GroupID:         row.RouteGroupID,
			Priority:        row.RoutePriority,
			BindingID:       row.RouteBindingID,
			ModelProviderID: row.ModelProviderID,
			Channel:         row.Channel,
		})
	}
	return orderModelGroupRoutes(routes, excludedIDs)
}

func validateModelGroupRouteProviders(routingModel string, routes []ModelGroupRoute) error {
	if len(routes) == 0 {
		return nil
	}
	providerID := routes[0].ModelProviderID
	if providerID <= 0 {
		return fmt.Errorf("model %q has no model provider", routingModel)
	}
	for _, route := range routes[1:] {
		if providerID != route.ModelProviderID {
			return fmt.Errorf("model %q is configured across multiple model providers", routingModel)
		}
	}
	return nil
}

func orderModelGroupRoutes(routes []ModelGroupRoute, excludedIDs []int64) []ModelGroupRoute {
	excluded := make(map[int64]struct{}, len(excludedIDs))
	for _, id := range excludedIDs {
		excluded[id] = struct{}{}
	}
	ordered := make([]ModelGroupRoute, 0, len(routes))
	for _, route := range routes {
		if _, exists := excluded[route.Channel.ID]; exists {
			continue
		}
		ordered = append(ordered, route)
	}
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].Priority != ordered[j].Priority {
			return ordered[i].Priority < ordered[j].Priority
		}
		return ordered[i].BindingID < ordered[j].BindingID
	})
	return ordered
}

func SelectModelGroupRoutes(ctx context.Context, apiKeyID int64, routingModel, protocol string, excludedIDs ...int64) ([]ModelGroupRoute, error) {
	if apiKeyID <= 0 {
		return nil, ErrAPIKeyModelGroupsNotConfigured
	}
	routingModel = strings.TrimSpace(routingModel)
	if routingModel == "" {
		return nil, fmt.Errorf("routing model is required")
	}
	query := db.Engine.Context(ctx).Table("api_key_model_groups").Alias("akmg").
		Select(`akmg.group_id AS route_group_id,
			akmg.priority AS route_priority,
			akmg.id AS route_binding_id,
			mg.model_provider_id AS route_model_provider_id,
			c.*`).
		Join("INNER", "model_groups mg", "mg.id = akmg.group_id").
		Join("INNER", "model_providers mp", "mp.id = mg.model_provider_id").
		Join("INNER", "model_group_models mgm", "mgm.group_id = mg.id").
		Join("INNER", "channels c", "c.id = mgm.channel_id").
		Join("INNER", "model_providers cp", "cp.id = c.model_provider_id").
		Where("akmg.api_key_id = ?", apiKeyID).
		And("mgm.routing_model = ?", routingModel).
		And("mg.is_active = true").
		And("c.is_active = true").
		And("mp.is_active = true").
		And("cp.is_active = true").
		And("c.model_provider_id = mg.model_provider_id")
	if protocol = strings.ToLower(strings.TrimSpace(protocol)); protocol != "" {
		query = query.And("LOWER(COALESCE(NULLIF(BTRIM(c.protocol), ''), 'openai')) = ?", protocol)
	}
	if len(excludedIDs) > 0 {
		query = query.NotIn("c.id", excludedIDs)
	}
	var rows []modelGroupRouteRow
	if err := query.OrderBy("akmg.priority ASC, akmg.id ASC").Find(&rows); err != nil {
		return nil, err
	}
	routes := buildModelGroupRoutes(rows, nil)
	if len(routes) == 0 {
		configured, err := db.Engine.Context(ctx).Where("api_key_id = ?", apiKeyID).Exist(new(model.APIKeyModelGroup))
		if err != nil {
			return nil, err
		}
		if !configured {
			return nil, ErrAPIKeyModelGroupsNotConfigured
		}
		return nil, fmt.Errorf("no model %q is available in API key groups", routingModel)
	}
	if err := validateModelGroupRouteProviders(routingModel, routes); err != nil {
		return nil, err
	}
	return routes, nil
}

func SelectHealthyModelGroupRoutes(ctx context.Context, apiKeyID int64, routingModel, protocol string, excludedIDs ...int64) ([]ModelGroupRoute, error) {
	routes, err := SelectModelGroupRoutes(ctx, apiKeyID, routingModel, protocol, excludedIDs...)
	if err != nil {
		return nil, err
	}
	healthy := make([]ModelGroupRoute, 0, len(routes))
	for _, route := range routes {
		if !isChannelUnhealthy(ctx, route.Channel.ID) {
			healthy = append(healthy, route)
		}
	}
	if len(healthy) > 0 {
		return healthy, nil
	}
	return routes, nil
}

func IsChannelAuthorizedForAPIKey(ctx context.Context, apiKeyID, channelID int64, routingModel string) (bool, error) {
	if apiKeyID <= 0 || channelID <= 0 {
		return false, nil
	}
	return db.Engine.Context(ctx).Table("api_key_model_groups").Alias("akmg").
		Join("INNER", "model_groups mg", "mg.id = akmg.group_id").
		Join("INNER", "model_providers mp", "mp.id = mg.model_provider_id").
		Join("INNER", "model_group_models mgm", "mgm.group_id = mg.id").
		Join("INNER", "channels c", "c.id = mgm.channel_id").
		Join("INNER", "model_providers cp", "cp.id = c.model_provider_id").
		Where("akmg.api_key_id = ?", apiKeyID).
		And("mgm.routing_model = ?", strings.TrimSpace(routingModel)).
		And("mgm.channel_id = ?", channelID).
		And("mg.is_active = true").
		And("c.is_active = true").
		And("mp.is_active = true").
		And("cp.is_active = true").
		And("c.model_provider_id = mg.model_provider_id").
		Exist(new(model.APIKeyModelGroup))
}

func effectiveChannelProtocol(channel *model.Channel) string {
	if channel == nil || strings.TrimSpace(channel.Protocol) == "" {
		return "openai"
	}
	return strings.ToLower(strings.TrimSpace(channel.Protocol))
}
