package handler

import (
	"fanapi/internal/model"
	"fanapi/internal/service"
	"fmt"

	"context"
)

func selectAPIKeyModelChannels(ctx context.Context, apiKeyID int64, routingModel, protocol string) ([]model.Channel, error) {
	routes, err := service.SelectHealthyModelGroupRoutes(ctx, apiKeyID, routingModel, protocol)
	if err != nil {
		return nil, err
	}
	channels := make([]model.Channel, 0, len(routes))
	for _, route := range routes {
		channels = append(channels, route.Channel)
	}
	return channels, nil
}

func authorizeAPIKeyChannel(ctx context.Context, apiKeyID, channelID int64, routingModel string) error {
	if apiKeyID <= 0 {
		return nil
	}
	authorized, err := service.IsChannelAuthorizedForAPIKey(ctx, apiKeyID, channelID, routingModel)
	if err != nil {
		return err
	}
	if !authorized {
		return fmt.Errorf("channel is not authorized for this API key")
	}
	return nil
}

// selectNextChannel 为重试选择下一个渠道，排除已尝试过的渠道 ID。
// 稳定密钥使用价格升序候选列表；普通路由使用现有加权重试选择。
func selectNextChannel(ctx context.Context, routingModel string, excludeIDs []int64, stableChannels []model.Channel, requireResponses bool) *model.Channel {
	excluded := make(map[int64]bool, len(excludeIDs))
	for _, id := range excludeIDs {
		excluded[id] = true
	}

	if len(stableChannels) > 0 {
		for i := range stableChannels {
			if !excluded[stableChannels[i].ID] {
				ch := stableChannels[i]
				return &ch
			}
		}
		return nil
	}

	if routingModel == "" {
		return nil
	}

	var (
		ch  *model.Channel
		err error
	)
	if requireResponses {
		ch, err = service.SelectChannelByProtocol(ctx, routingModel, protocolResponses, excludeIDs...)
	} else {
		ch, err = service.SelectChannelByWeight(ctx, routingModel, excludeIDs...)
	}
	if err != nil {
		return nil
	}
	return ch
}
