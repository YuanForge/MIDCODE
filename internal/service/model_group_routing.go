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
	GroupID   int64
	Priority  int
	BindingID int64
	Channel   model.Channel
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
	bindings, err := LoadAPIKeyModelGroupBindings(ctx, apiKeyID)
	if err != nil {
		return nil, err
	}
	if len(bindings) == 0 {
		return nil, ErrAPIKeyModelGroupsNotConfigured
	}
	routes := make([]ModelGroupRoute, 0, len(bindings))
	for _, binding := range bindings {
		var groupModel model.ModelGroupModel
		found, err := db.Engine.Where("group_id = ? AND routing_model = ?", binding.GroupID, routingModel).Get(&groupModel)
		if err != nil {
			return nil, err
		}
		if !found {
			continue
		}
		channel, err := GetChannel(ctx, groupModel.ChannelID)
		if err != nil {
			continue
		}
		if protocol != "" && effectiveChannelProtocol(channel) != protocol {
			continue
		}
		routes = append(routes, ModelGroupRoute{GroupID: binding.GroupID, Priority: binding.Priority, BindingID: binding.ID, Channel: *channel})
	}
	routes = orderModelGroupRoutes(routes, excludedIDs)
	if len(routes) == 0 {
		return nil, fmt.Errorf("no model %q is available in API key groups", routingModel)
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
	bindings, err := LoadAPIKeyModelGroupBindings(ctx, apiKeyID)
	if err != nil {
		return false, err
	}
	for _, binding := range bindings {
		var groupModel model.ModelGroupModel
		found, err := db.Engine.Where("group_id = ? AND routing_model = ? AND channel_id = ?", binding.GroupID, strings.TrimSpace(routingModel), channelID).Get(&groupModel)
		if err != nil {
			return false, err
		}
		if found {
			return true, nil
		}
	}
	return false, nil
}

func effectiveChannelProtocol(channel *model.Channel) string {
	if channel == nil || strings.TrimSpace(channel.Protocol) == "" {
		return "openai"
	}
	return strings.ToLower(strings.TrimSpace(channel.Protocol))
}
