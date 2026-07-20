package handler

import (
	billingcalc "fanapi/internal/billing"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"
	"fmt"
	"github.com/gin-gonic/gin"
	"net/http"
	"strings"
)

// ListModels 获取可用渠道列表
// @Summary      获取渠道列表并查询价格
// @Description  登录用户可看到其分组专属价（group_price）；请将 routing_model 填入请求的 model 字段进行加载均衡路由。
// @Tags         用户
// @Produce      json
// @Security     ApiKeyAuth
// @Success      200  {object}  object{channels=[]object}
// @Router       /user/channels [get]
func (h *AuthHandler) ListModels(c *gin.Context) {
	type vipPriceInfo struct {
		Code         string `json:"code"`
		Name         string `json:"name"`
		PriceDisplay string `json:"price_display"`
	}
	type groupPriceInfo struct {
		GroupID      int64          `json:"group_id"`
		GroupCode    string         `json:"group_code"`
		GroupName    string         `json:"group_name"`
		PriceDisplay string         `json:"price_display"`
		VIPPrices    []vipPriceInfo `json:"vip_prices"`
	}
	type channelInfo struct {
		ID            int64            `json:"id"`
		Name          string           `json:"name"`
		RoutingModel  string           `json:"routing_model"`
		ModelProvider string           `json:"model_provider"`
		Type          string           `json:"type"`
		Protocol      string           `json:"protocol"`
		BillingType   string           `json:"billing_type"`
		PriceDisplay  string           `json:"price_display"`
		GroupPrices   []groupPriceInfo `json:"group_prices"`
		IconURL       string           `json:"icon_url"`
		Description   string           `json:"description"`
	}

	grouped, groupedErr := listGroupedModelChannels()
	if groupedErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": groupedErr.Error()})
		return
	}
	vipGroups, vipErr := service.ListVIPGroups(c.Request.Context(), false)
	if vipErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": vipErr.Error()})
		return
	}
	allowedGroups := map[int64]struct{}(nil)
	if apiKeyID := c.GetInt64("api_key_id"); apiKeyID > 0 {
		bindings, err := service.LoadAPIKeyModelGroupBindings(c.Request.Context(), apiKeyID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		allowedGroups = make(map[int64]struct{}, len(bindings))
		for _, binding := range bindings {
			allowedGroups[binding.GroupID] = struct{}{}
		}
	}
	byModel := make(map[string]*channelInfo)
	modelOrder := make([]string, 0)
	for _, item := range grouped {
		if allowedGroups != nil {
			if _, ok := allowedGroups[item.Group.ID]; !ok {
				continue
			}
		}
		modelName := strings.TrimSpace(item.RoutingModel)
		if modelName == "" {
			continue
		}
		ch := item.Channel
		basePrice := buildPriceDisplay(ch.BillingType, ch.BillingConfig)
		vipPrices := make([]vipPriceInfo, 0, len(vipGroups))
		for _, vip := range vipGroups {
			cfg := model.JSON(billingcalc.EffectivePricingConfig(map[string]interface{}(ch.BillingConfig), vip.Code))
			vipPrices = append(vipPrices, vipPriceInfo{Code: vip.Code, Name: vip.Name, PriceDisplay: buildPriceDisplay(ch.BillingType, cfg)})
		}
		itemInfo := byModel[modelName]
		if itemInfo == nil {
			itemInfo = &channelInfo{ID: ch.ID, Name: modelName, RoutingModel: modelName, ModelProvider: service.EffectiveModelProvider(ch), Type: ch.Type, Protocol: ch.Protocol, BillingType: ch.BillingType, PriceDisplay: basePrice, IconURL: ch.IconURL, Description: ch.Description}
			byModel[modelName] = itemInfo
			modelOrder = append(modelOrder, modelName)
		}
		itemInfo.GroupPrices = append(itemInfo.GroupPrices, groupPriceInfo{GroupID: item.Group.ID, GroupCode: item.Group.Code, GroupName: item.Group.Name, PriceDisplay: basePrice, VIPPrices: vipPrices})
	}
	result := make([]channelInfo, 0, len(modelOrder))
	for _, modelName := range modelOrder {
		result = append(result, *byModel[modelName])
	}
	c.JSON(http.StatusOK, gin.H{"channels": result})
}

// applyGroupPricingMap 与 billing.applyGroupPricing 逻辑相同，此处避免包循环依赖而内联。
func applyGroupPricingMap(cfg map[string]interface{}, group string) model.JSON {
	if group == "" || cfg == nil {
		return model.JSON(cfg)
	}
	pgs, ok := cfg["pricing_groups"].(map[string]interface{})
	if !ok {
		return model.JSON(cfg)
	}
	overrides, ok := pgs[group].(map[string]interface{})
	if !ok {
		return model.JSON(cfg)
	}
	merged := make(map[string]interface{}, len(cfg))
	for k, v := range cfg {
		merged[k] = v
	}
	for k, v := range overrides {
		merged[k] = v
	}
	return model.JSON(merged)
}

type groupedModelChannel struct {
	Group        model.ModelGroup
	RoutingModel string
	Priority     int
	Channel      model.Channel
}

func listGroupedModelChannels() ([]groupedModelChannel, error) {
	var groups []model.ModelGroup
	if err := db.Engine.Where("is_active = true").OrderBy("id ASC").Find(&groups); err != nil {
		return nil, err
	}
	result := make([]groupedModelChannel, 0)
	for _, group := range groups {
		var bindings []model.ModelGroupModel
		if err := db.Engine.Where("group_id = ?", group.ID).OrderBy("routing_model ASC, id ASC").Find(&bindings); err != nil {
			return nil, err
		}
		for _, binding := range bindings {
			var channel model.Channel
			found, err := db.Engine.Where("id = ? AND is_active = true", binding.ChannelID).Get(&channel)
			if err != nil {
				return nil, err
			}
			if !found {
				continue
			}
			result = append(result, groupedModelChannel{Group: group, RoutingModel: binding.RoutingModel, Channel: channel})
		}
	}
	return result, nil
}

func preferDisplayChannel(candidate, current model.Channel, userGroup string) bool {
	candidatePrice, candidateComparable := channelDisplayPriceRank(candidate, userGroup)
	currentPrice, currentComparable := channelDisplayPriceRank(current, userGroup)
	if candidateComparable != currentComparable {
		return candidateComparable
	}
	if candidateComparable && currentComparable && candidatePrice != currentPrice {
		return candidatePrice < currentPrice
	}
	if candidate.Priority != current.Priority {
		return candidate.Priority > current.Priority
	}
	if current.ID == 0 {
		return candidate.ID != 0
	}
	return candidate.ID < current.ID
}

func channelDisplayPriceRank(ch model.Channel, userGroup string) (float64, bool) {
	cfg := ch.BillingConfig
	if userGroup != "" {
		cfg = model.JSON(billingcalc.EffectivePricingConfig(map[string]interface{}(ch.BillingConfig), userGroup))
	}
	return billingConfigPriceRank(ch.BillingType, cfg)
}

func billingConfigPriceRank(billingType string, cfg model.JSON) (float64, bool) {
	if cfg == nil {
		return 0, false
	}
	switch billingType {
	case "token":
		inputPrice := configNumber(cfg, "input_price_per_1m_tokens")
		outputPrice := configNumber(cfg, "output_price_per_1m_tokens")
		totalPrice := inputPrice + outputPrice
		return totalPrice, totalPrice > 0
	case "image":
		if minSizePrice, ok := minNumericMapValue(cfg["size_prices"]); ok && minSizePrice > 0 {
			return minSizePrice, true
		}
		if defaultSizePrice := configNumber(cfg, "default_size_price"); defaultSizePrice > 0 {
			return defaultSizePrice, true
		}
		basePrice := configNumber(cfg, "base_price")
		return basePrice, basePrice > 0
	case "video", "audio":
		pricePerSecond := configNumber(cfg, "price_per_second")
		return pricePerSecond, pricePerSecond > 0
	case "count":
		pricePerCall := configNumber(cfg, "price_per_call")
		if pricePerCall > 0 {
			return pricePerCall, true
		}
		pricePerCount := configNumber(cfg, "price_per_count")
		return pricePerCount, pricePerCount > 0
	}
	return 0, false
}

func configNumber(cfg model.JSON, key string) float64 {
	value, ok := cfg[key]
	if !ok {
		return 0
	}
	converted, _ := numberToFloat64(value)
	return converted
}

func minNumericMapValue(value interface{}) (float64, bool) {
	var values map[string]interface{}
	switch typedValue := value.(type) {
	case map[string]interface{}:
		values = typedValue
	case model.JSON:
		values = map[string]interface{}(typedValue)
	default:
		return 0, false
	}
	var minValue float64
	found := false
	for _, item := range values {
		converted, ok := numberToFloat64(item)
		if !ok || converted <= 0 {
			continue
		}
		if !found || converted < minValue {
			minValue = converted
			found = true
		}
	}
	return minValue, found
}

func numberToFloat64(value interface{}) (float64, bool) {
	switch typedValue := value.(type) {
	case float64:
		return typedValue, true
	case float32:
		return float64(typedValue), true
	case int:
		return float64(typedValue), true
	case int64:
		return float64(typedValue), true
	case int32:
		return float64(typedValue), true
	case uint:
		return float64(typedValue), true
	case uint64:
		return float64(typedValue), true
	case uint32:
		return float64(typedValue), true
	}
	return 0, false
}

// buildPriceDisplay 根据计费类型和配置生成人类可读的价格描述字符串。
// credits 换算：1 CNY = 1,000,000 credits。
func buildPriceDisplay(billingType string, cfg model.JSON) string {
	if cfg == nil {
		return ""
	}
	toF := func(key string) float64 {
		value, ok := cfg[key]
		if !ok {
			return 0
		}
		converted, _ := numberToFloat64(value)
		return converted
	}
	switch billingType {
	case "token":
		in := toF("input_price_per_1m_tokens") / 1000000 // credits → ¥
		out := toF("output_price_per_1m_tokens") / 1000000
		if in > 0 && out > 0 {
			base := fmt.Sprintf("¥%.4f / 1M 输入 + ¥%.4f / 1M 输出", in, out)
			cacheCreate := toF("cache_creation_price_per_1m_tokens") / 1000000
			cacheRead := toF("cache_read_price_per_1m_tokens") / 1000000
			if cacheCreate > 0 || cacheRead > 0 {
				cacheStr := ""
				if cacheCreate > 0 && cacheRead > 0 {
					cacheStr = fmt.Sprintf("缓存写入 ¥%.4f + 缓存读取 ¥%.4f / 1M", cacheCreate, cacheRead)
				} else if cacheCreate > 0 {
					cacheStr = fmt.Sprintf("缓存写入 ¥%.4f / 1M", cacheCreate)
				} else {
					cacheStr = fmt.Sprintf("缓存读取 ¥%.4f / 1M", cacheRead)
				}
				return base + "\n" + cacheStr
			}
			return base
		}
	case "image":
		// 优先展示各档位价格（size_prices 有值时）
		if spRaw, ok := cfg["size_prices"]; ok {
			var spMap map[string]interface{}
			switch v := spRaw.(type) {
			case map[string]interface{}:
				spMap = v
			case model.JSON:
				spMap = map[string]interface{}(v)
			}
			parts := make([]string, 0, 4)
			for _, k := range []string{"1k", "2k", "3k", "4k"} {
				if raw, exists := spMap[k]; exists {
					if val, ok2 := numberToFloat64(raw); ok2 && val > 0 {
						parts = append(parts, fmt.Sprintf("%s ¥%.4f", k, val/1000000))
					}
				}
			}
			if len(parts) > 0 {
				return strings.Join(parts, " / ") + " / 张"
			}
		}
		if def := toF("default_size_price"); def > 0 {
			return fmt.Sprintf("¥%.4f / 张起", def/1000000)
		}
		base := toF("base_price") / 1000000
		if base > 0 {
			return fmt.Sprintf("¥%.4f / 张起", base)
		}
	case "video":
		perSec := toF("price_per_second") / 1000000
		if perSec > 0 {
			return fmt.Sprintf("¥%.4f / 秒", perSec)
		}
	case "audio":
		perSec := toF("price_per_second") / 1000000
		if perSec > 0 {
			return fmt.Sprintf("¥%.4f / 秒", perSec)
		}
	case "count":
		p := toF("price_per_call") / 1000000
		if p > 0 {
			return fmt.Sprintf("¥%.4f / 次", p)
		}
	}
	return ""
}
