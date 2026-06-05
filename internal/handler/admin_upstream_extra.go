package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	upstreamTypeOpenAI  = "openai"
	upstreamTypeNewAPI  = "newapi"
	upstreamTypeSub2API = "sub2api"
)

type upstreamPlatformPayload struct {
	Name           string `json:"name"`
	PlatformType   string `json:"platform_type"`
	BaseURL        string `json:"base_url"`
	APIKey         string `json:"api_key"`
	SystemToken    string `json:"system_token"`
	UpstreamUserID string `json:"upstream_user_id"`
	UpstreamGroup  string `json:"upstream_group"`
	Note           string `json:"note"`
	IsActive       *bool  `json:"is_active"`
}

type upstreamPlatformDTO struct {
	ID              int64      `json:"id"`
	Name            string     `json:"name"`
	PlatformType    string     `json:"platform_type"`
	BaseURL         string     `json:"base_url"`
	UpstreamUserID  string     `json:"upstream_user_id"`
	UpstreamGroup   string     `json:"upstream_group"`
	Balance         int64      `json:"balance"`
	BalanceAmount   float64    `json:"balance_amount"`
	BalanceCurrency string     `json:"balance_currency"`
	BalanceSyncedAt *time.Time `json:"balance_synced_at"`
	IsActive        bool       `json:"is_active"`
	Note            string     `json:"note"`
	HasAPIKey       bool       `json:"has_api_key"`
	HasSystemToken  bool       `json:"has_system_token"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type upstreamPricingModel struct {
	ModelName        string   `json:"model_name"`
	VendorID         int64    `json:"vendor_id"`
	QuotaType        int      `json:"quota_type"`
	ModelRatio       float64  `json:"model_ratio"`
	CompletionRatio  float64  `json:"completion_ratio"`
	ModelPrice       float64  `json:"model_price"`
	CacheRatio       float64  `json:"cache_ratio"`
	CreateCacheRatio float64  `json:"create_cache_ratio"`
	EnableGroups     []string `json:"enable_groups"`
	EndpointTypes    []string `json:"supported_endpoint_types"`
}

type upstreamPricingResponse struct {
	Success     bool                   `json:"success"`
	GroupRatio  map[string]float64     `json:"group_ratio"`
	UsableGroup map[string]string      `json:"usable_group"`
	AutoGroups  []string               `json:"auto_groups"`
	Data        []upstreamPricingModel `json:"data"`
}

type upstreamModelInfo struct {
	ID            string                 `json:"id"`
	BillingType   string                 `json:"billing_type,omitempty"`
	Protocol      string                 `json:"protocol,omitempty"`
	BillingConfig model.JSON             `json:"billing_config,omitempty"`
	Raw           map[string]interface{} `json:"raw,omitempty"`
}

type upstreamChannelBindingCandidate struct {
	ChannelID          int64    `json:"channel_id"`
	Name               string   `json:"name"`
	Model              string   `json:"model"`
	DisplayName        string   `json:"display_name"`
	BaseURL            string   `json:"base_url"`
	Protocol           string   `json:"protocol"`
	IsActive           bool     `json:"is_active"`
	ExistingPlatformID int64    `json:"existing_platform_id"`
	MatchReasons       []string `json:"match_reasons"`
	PriceAvailable     bool     `json:"price_available"`
	PriceWillUpdate    bool     `json:"price_will_update"`
}

type upstreamBalanceInfo struct {
	Amount      float64                `json:"amount"`
	Currency    string                 `json:"currency"`
	Credits     int64                  `json:"credits"`
	UsedAmount  float64                `json:"used_amount,omitempty"`
	Group       string                 `json:"group,omitempty"`
	Raw         map[string]interface{} `json:"raw,omitempty"`
	Description string                 `json:"description,omitempty"`
}

type sub2APIGroup struct {
	ID                   int64   `json:"id"`
	Name                 string  `json:"name"`
	Platform             string  `json:"platform"`
	RateMultiplier       float64 `json:"rate_multiplier"`
	ClaudeCodeOnly       bool    `json:"claude_code_only"`
	AllowImageGeneration bool    `json:"allow_image_generation"`
	Status               string  `json:"status"`
}

func upstreamPlatformToDTO(p model.UpstreamPlatform) upstreamPlatformDTO {
	typ := p.PlatformType
	if typ == "" {
		typ = upstreamTypeOpenAI
	}
	currency := p.BalanceCurrency
	if currency == "" {
		currency = "CNY"
	}
	return upstreamPlatformDTO{
		ID:              p.ID,
		Name:            p.Name,
		PlatformType:    typ,
		BaseURL:         p.BaseURL,
		UpstreamUserID:  p.UpstreamUserID,
		UpstreamGroup:   p.UpstreamGroup,
		Balance:         p.Balance,
		BalanceAmount:   p.BalanceAmount,
		BalanceCurrency: currency,
		BalanceSyncedAt: p.BalanceSyncedAt,
		IsActive:        p.IsActive,
		Note:            p.Note,
		HasAPIKey:       p.APIKeyEnc != "",
		HasSystemToken:  p.SystemTokenEnc != "",
		CreatedAt:       p.CreatedAt,
		UpdatedAt:       p.UpdatedAt,
	}
}

// GET /admin/upstream-platforms
func ListUpstreamPlatforms(c *gin.Context) {
	var items []model.UpstreamPlatform
	if err := db.Engine.OrderBy("created_at DESC").Find(&items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]upstreamPlatformDTO, 0, len(items))
	for _, item := range items {
		out = append(out, upstreamPlatformToDTO(item))
	}
	c.JSON(http.StatusOK, gin.H{"platforms": out})
}

// POST /admin/upstream-platforms
func CreateUpstreamPlatform(c *gin.Context) {
	var req upstreamPlatformPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	p, err := upstreamPlatformFromPayload(req, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if _, err := db.Engine.Insert(p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, upstreamPlatformToDTO(*p))
}

// PUT /admin/upstream-platforms/:id
func UpdateUpstreamPlatform(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var existing model.UpstreamPlatform
	if found, err := db.Engine.ID(id).Get(&existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	} else if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "平台不存在"})
		return
	}

	var req upstreamPlatformPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	patch, err := upstreamPlatformFromPayload(req, &existing)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	patch.ID = id
	if _, err := db.Engine.ID(id).Cols(
		"name", "platform_type", "base_url", "api_key_enc", "system_token_enc",
		"upstream_user_id", "upstream_group", "is_active", "note",
	).Update(patch); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DELETE /admin/upstream-platforms/:id
func DeleteUpstreamPlatform(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	if _, err := db.Engine.Delete(&model.UpstreamPlatform{ID: id}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /admin/upstream-platforms/:id/models
func GetUpstreamModels(c *gin.Context) {
	p, ok := loadUpstreamPlatform(c)
	if !ok {
		return
	}
	infos, err := fetchUpstreamModelInfos(p)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	models := make([]string, 0, len(infos))
	for _, info := range infos {
		models = append(models, info.ID)
	}
	c.JSON(http.StatusOK, gin.H{"models": models, "items": infos})
}

// POST /admin/upstream-platforms/:id/sync-balance
func SyncUpstreamPlatformBalance(c *gin.Context) {
	p, ok := loadUpstreamPlatform(c)
	if !ok {
		return
	}
	balance, err := fetchUpstreamBalance(p)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	now := time.Now()
	patch := &model.UpstreamPlatform{
		Balance:         balance.Credits,
		BalanceAmount:   balance.Amount,
		BalanceCurrency: balance.Currency,
		BalanceSyncedAt: &now,
	}
	cols := []string{"balance", "balance_amount", "balance_currency", "balance_synced_at"}
	if balance.Group != "" && p.UpstreamGroup == "" {
		patch.UpstreamGroup = balance.Group
		cols = append(cols, "upstream_group")
	}
	if _, err := db.Engine.ID(p.ID).Cols(cols...).Update(patch); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	p.Balance = balance.Credits
	p.BalanceAmount = balance.Amount
	p.BalanceCurrency = balance.Currency
	p.BalanceSyncedAt = &now
	if p.UpstreamGroup == "" {
		p.UpstreamGroup = balance.Group
	}
	c.JSON(http.StatusOK, gin.H{
		"platform":    upstreamPlatformToDTO(p),
		"balance":     balance.Amount,
		"currency":    balance.Currency,
		"used_amount": balance.UsedAmount,
		"raw":         balance.Raw,
	})
}

// POST /admin/upstream-platforms/:id/api-keys
func CreateUpstreamAPIKey(c *gin.Context) {
	p, ok := loadUpstreamPlatform(c)
	if !ok {
		return
	}
	var req struct {
		Name              string `json:"name"`
		Group             string `json:"group"`
		RemainQuota       int64  `json:"remain_quota"`
		UnlimitedQuota    bool   `json:"unlimited_quota"`
		ExpiredTime       int64  `json:"expired_time"`
		ModelLimits       string `json:"model_limits"`
		ModelLimitsEnable bool   `json:"model_limits_enabled"`
		SaveToPlatform    bool   `json:"save_to_platform"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" {
		req.Name = fmt.Sprintf("fanapi-%d", time.Now().Unix())
	}
	if req.ExpiredTime == 0 {
		req.ExpiredTime = -1
	}
	if isNewAPI(p.PlatformType) && req.RemainQuota == 0 && !req.UnlimitedQuota {
		req.RemainQuota = -1
		req.UnlimitedQuota = true
	}
	if req.Group == "" {
		req.Group = p.UpstreamGroup
	}

	apiKey, savedGroup, err := createUpstreamAPIToken(p, req.Name, req.Group, req.RemainQuota, req.UnlimitedQuota, req.ExpiredTime, req.ModelLimitsEnable, req.ModelLimits)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if req.SaveToPlatform {
		patch := &model.UpstreamPlatform{APIKeyEnc: apiKey}
		cols := []string{"api_key_enc"}
		if savedGroup != "" {
			patch.UpstreamGroup = savedGroup
			cols = append(cols, "upstream_group")
		} else if req.Group != "" {
			patch.UpstreamGroup = req.Group
			cols = append(cols, "upstream_group")
		}
		if _, err := db.Engine.ID(p.ID).Cols(cols...).Update(patch); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusCreated, gin.H{"api_key": apiKey, "saved": req.SaveToPlatform})
}

// POST /admin/channels/batch-from-upstream
func BatchCreateChannelsFromUpstream(c *gin.Context) {
	var req struct {
		PlatformID int64    `json:"platform_id"`
		Models     []string `json:"models"`
		Markup     float64  `json:"markup"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.PlatformID == 0 || len(req.Models) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "platform_id 和 models 为必填"})
		return
	}
	var p model.UpstreamPlatform
	if found, err := db.Engine.ID(req.PlatformID).Get(&p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	} else if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "平台不存在"})
		return
	}
	if strings.TrimSpace(p.APIKeyEnc) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "平台未配置调用 API Key，请先填写 sk- Key 或使用“生成调用 Key”"})
		return
	}
	if req.Markup <= 0 {
		req.Markup = 1
	}

	result, err := syncChannelsFromUpstream(c.Request.Context(), p, req.Models, req.Markup, false)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, result)
}

// POST /admin/upstream-platforms/:id/sync-channels
func SyncUpstreamPlatformChannels(c *gin.Context) {
	p, ok := loadUpstreamPlatform(c)
	if !ok {
		return
	}
	if strings.TrimSpace(p.APIKeyEnc) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "平台未配置调用 API Key"})
		return
	}
	var req struct {
		Models []string `json:"models"`
		Markup float64  `json:"markup"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Markup <= 0 {
		req.Markup = 1
	}
	result, err := syncChannelsFromUpstream(c.Request.Context(), p, req.Models, req.Markup, true)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// GET /admin/upstream-platforms/:id/channel-bindings/preview
func PreviewUpstreamPlatformChannelBindings(c *gin.Context) {
	p, ok := loadUpstreamPlatform(c)
	if !ok {
		return
	}
	markup, _ := strconv.ParseFloat(c.DefaultQuery("markup", "1"), 64)
	if markup <= 0 {
		markup = 1
	}
	candidates, err := previewUpstreamChannelBindings(p, markup)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	bindable := 0
	priceAvailable := 0
	for _, item := range candidates {
		if item.ExistingPlatformID != p.ID {
			bindable++
		}
		if item.PriceAvailable {
			priceAvailable++
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"candidates":        candidates,
		"total":             len(candidates),
		"bindable":          bindable,
		"price_available":   priceAvailable,
		"price_unavailable": len(candidates) - priceAvailable,
	})
}

// POST /admin/upstream-platforms/:id/bind-channels
func BindUpstreamPlatformChannels(c *gin.Context) {
	p, ok := loadUpstreamPlatform(c)
	if !ok {
		return
	}
	var req struct {
		ChannelIDs  []int64 `json:"channel_ids"`
		Markup      float64 `json:"markup"`
		UpdatePrice *bool   `json:"update_price"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.ChannelIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未选择渠道"})
		return
	}
	if req.Markup <= 0 {
		req.Markup = 1
	}
	updatePrice := true
	if req.UpdatePrice != nil {
		updatePrice = *req.UpdatePrice
	}
	result, err := bindExistingChannelsToUpstream(c.Request.Context(), p, req.ChannelIDs, req.Markup, updatePrice)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func upstreamPlatformFromPayload(req upstreamPlatformPayload, existing *model.UpstreamPlatform) (*model.UpstreamPlatform, error) {
	name := strings.TrimSpace(req.Name)
	baseURL := normalizeBaseURL(req.BaseURL)
	platformType := normalizeUpstreamType(req.PlatformType)
	if existing != nil {
		if name == "" {
			name = existing.Name
		}
		if baseURL == "" {
			baseURL = existing.BaseURL
		}
		if req.PlatformType == "" {
			platformType = normalizeUpstreamType(existing.PlatformType)
		}
	}
	if name == "" {
		return nil, errors.New("名称为必填")
	}
	if baseURL == "" {
		return nil, errors.New("API Base URL 为必填")
	}
	p := &model.UpstreamPlatform{
		Name:            name,
		PlatformType:    platformType,
		BaseURL:         baseURL,
		UpstreamUserID:  strings.TrimSpace(req.UpstreamUserID),
		UpstreamGroup:   strings.TrimSpace(req.UpstreamGroup),
		BalanceCurrency: "CNY",
		Note:            strings.TrimSpace(req.Note),
		IsActive:        true,
	}
	if existing != nil {
		p.APIKeyEnc = existing.APIKeyEnc
		p.SystemTokenEnc = existing.SystemTokenEnc
		p.Balance = existing.Balance
		p.BalanceAmount = existing.BalanceAmount
		p.BalanceCurrency = existing.BalanceCurrency
		p.BalanceSyncedAt = existing.BalanceSyncedAt
		p.IsActive = existing.IsActive
		if req.UpstreamUserID == "" {
			p.UpstreamUserID = existing.UpstreamUserID
		}
		if req.UpstreamGroup == "" {
			p.UpstreamGroup = existing.UpstreamGroup
		}
	}
	if req.IsActive != nil {
		p.IsActive = *req.IsActive
	}
	if strings.TrimSpace(req.APIKey) != "" {
		p.APIKeyEnc = strings.TrimSpace(req.APIKey)
	}
	if strings.TrimSpace(req.SystemToken) != "" {
		p.SystemTokenEnc = strings.TrimSpace(req.SystemToken)
	}
	return p, nil
}

func loadUpstreamPlatform(c *gin.Context) (model.UpstreamPlatform, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return model.UpstreamPlatform{}, false
	}
	var p model.UpstreamPlatform
	if found, err := db.Engine.ID(id).Get(&p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return model.UpstreamPlatform{}, false
	} else if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "平台不存在"})
		return model.UpstreamPlatform{}, false
	}
	return p, true
}

func fetchUpstreamModelInfos(p model.UpstreamPlatform) ([]upstreamModelInfo, error) {
	switch normalizeUpstreamType(p.PlatformType) {
	case upstreamTypeNewAPI:
		pricing, err := fetchNewAPIPricing(p.BaseURL)
		if err == nil && len(pricing.Data) > 0 {
			return modelInfosFromNewAPIPricing(p, pricing), nil
		}
		if strings.TrimSpace(p.APIKeyEnc) == "" {
			return nil, err
		}
		return fetchOpenAICompatibleModels(p)
	case upstreamTypeSub2API:
		return fetchSub2APIModels(p)
	default:
		return fetchOpenAICompatibleModels(p)
	}
}

func fetchOpenAICompatibleModels(p model.UpstreamPlatform) ([]upstreamModelInfo, error) {
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(p.BaseURL, "/")+"/v1/models", nil)
	if err != nil {
		return nil, err
	}
	if p.APIKeyEnc != "" {
		req.Header.Set("Authorization", "Bearer "+p.APIKeyEnc)
	}
	resp, err := httpClient15.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求上游失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("上游响应 %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析上游响应失败: %w", err)
	}
	infos := make([]upstreamModelInfo, 0, len(result.Data))
	for _, m := range result.Data {
		if m.ID != "" {
			infos = append(infos, upstreamModelInfo{ID: m.ID, BillingType: "token", Protocol: "openai"})
		}
	}
	return infos, nil
}

func fetchSub2APIModels(p model.UpstreamPlatform) ([]upstreamModelInfo, error) {
	if strings.TrimSpace(p.APIKeyEnc) == "" {
		return nil, errors.New("平台未配置调用 API Key")
	}
	infos, err := fetchOpenAICompatibleModels(p)
	if err != nil {
		return nil, err
	}
	groupProtocol := ""
	if strings.TrimSpace(p.SystemTokenEnc) != "" && strings.TrimSpace(p.UpstreamGroup) != "" {
		if groups, groupErr := fetchSub2APIGroups(p); groupErr == nil {
			if group, ok := findSub2APIGroup(groups, p.UpstreamGroup); ok {
				groupProtocol = protocolFromSub2APIPlatform(group.Platform)
			}
		}
	}
	for i := range infos {
		proto := inferProtocolFromModelName(infos[i].ID)
		if proto == "" {
			proto = groupProtocol
		}
		if proto == "" {
			proto = "openai"
		}
		infos[i].Protocol = proto
		infos[i].BillingConfig = nil
		infos[i].Raw = map[string]interface{}{
			"source":            "sub2api_models",
			"price_unavailable": true,
		}
	}
	sort.Slice(infos, func(i, j int) bool { return infos[i].ID < infos[j].ID })
	return infos, nil
}

func modelInfosFromNewAPIPricing(p model.UpstreamPlatform, pricing upstreamPricingResponse) []upstreamModelInfo {
	group := p.UpstreamGroup
	if group == "" {
		group = firstPricingGroup(pricing.GroupRatio)
	}
	seen := map[string]bool{}
	infos := make([]upstreamModelInfo, 0, len(pricing.Data))
	for _, item := range pricing.Data {
		if item.ModelName == "" || seen[item.ModelName] {
			continue
		}
		if group != "" && len(item.EnableGroups) > 0 && !containsString(item.EnableGroups, group) {
			continue
		}
		seen[item.ModelName] = true
		info := upstreamModelInfo{
			ID:            item.ModelName,
			BillingType:   "token",
			Protocol:      inferProtocolFromPricing(item),
			BillingConfig: buildNewAPIBillingConfig(item, pricing.GroupRatio[group], 1),
		}
		if item.QuotaType == 1 {
			info.BillingType = "count"
		}
		infos = append(infos, info)
	}
	sort.Slice(infos, func(i, j int) bool { return infos[i].ID < infos[j].ID })
	return infos
}

func fetchNewAPIPricing(baseURL string) (upstreamPricingResponse, error) {
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(baseURL, "/")+"/api/pricing", nil)
	if err != nil {
		return upstreamPricingResponse{}, err
	}
	resp, err := httpClient15.Do(req)
	if err != nil {
		return upstreamPricingResponse{}, fmt.Errorf("请求 /api/pricing 失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return upstreamPricingResponse{}, fmt.Errorf("/api/pricing 响应 %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var pricing upstreamPricingResponse
	if err := json.NewDecoder(resp.Body).Decode(&pricing); err != nil {
		return upstreamPricingResponse{}, fmt.Errorf("解析 /api/pricing 失败: %w", err)
	}
	if !pricing.Success && len(pricing.Data) == 0 {
		return upstreamPricingResponse{}, errors.New("/api/pricing 未返回可用模型")
	}
	return pricing, nil
}

func fetchNewAPIUserQuota(p model.UpstreamPlatform) (quota float64, usedQuota float64, group string, err error) {
	if p.SystemTokenEnc == "" {
		return 0, 0, "", errors.New("平台未配置系统访问令牌")
	}
	if p.UpstreamUserID == "" {
		return 0, 0, "", errors.New("平台未配置 New-Api-User 用户 ID")
	}
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(p.BaseURL, "/")+"/api/user/self", nil)
	if err != nil {
		return 0, 0, "", err
	}
	applyNewAPIAdminHeaders(req, p)
	resp, err := httpClient15.Do(req)
	if err != nil {
		return 0, 0, "", fmt.Errorf("请求上游额度失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return 0, 0, "", fmt.Errorf("上游额度接口响应 %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var result struct {
		Success bool `json:"success"`
		Data    struct {
			Quota     interface{} `json:"quota"`
			UsedQuota interface{} `json:"used_quota"`
			Group     string      `json:"group"`
		} `json:"data"`
		Message string `json:"message"`
		Error   string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, 0, "", fmt.Errorf("解析上游额度失败: %w", err)
	}
	if !result.Success && result.Message != "" {
		return 0, 0, "", errors.New(result.Message)
	}
	quota = toFloat64(result.Data.Quota)
	usedQuota = toFloat64(result.Data.UsedQuota)
	return quota, usedQuota, result.Data.Group, nil
}

func fetchUpstreamBalance(p model.UpstreamPlatform) (upstreamBalanceInfo, error) {
	switch normalizeUpstreamType(p.PlatformType) {
	case upstreamTypeNewAPI:
		quota, usedQuota, group, err := fetchNewAPIUserQuota(p)
		if err != nil {
			return upstreamBalanceInfo{}, err
		}
		amount := quota / 500000
		return upstreamBalanceInfo{
			Amount:     amount,
			Currency:   "USD",
			Credits:    amountToCredits(amount, "USD"),
			UsedAmount: usedQuota / 500000,
			Group:      group,
			Raw: map[string]interface{}{
				"quota":      quota,
				"used_quota": usedQuota,
			},
		}, nil
	case upstreamTypeSub2API:
		return fetchSub2APIUsageBalance(p)
	default:
		return upstreamBalanceInfo{}, errors.New("当前平台类型没有标准余额接口，请选择 New API 或 Sub2API")
	}
}

func fetchSub2APIUsageBalance(p model.UpstreamPlatform) (upstreamBalanceInfo, error) {
	if strings.TrimSpace(p.APIKeyEnc) == "" {
		return upstreamBalanceInfo{}, errors.New("平台未配置调用 API Key")
	}
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(p.BaseURL, "/")+"/v1/usage", nil)
	if err != nil {
		return upstreamBalanceInfo{}, err
	}
	req.Header.Set("Authorization", "Bearer "+p.APIKeyEnc)
	resp, err := httpClient15.Do(req)
	if err != nil {
		return upstreamBalanceInfo{}, fmt.Errorf("请求 Sub2API 余额失败: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return upstreamBalanceInfo{}, fmt.Errorf("Sub2API 余额接口响应 %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(respBody, &raw); err != nil {
		return upstreamBalanceInfo{}, fmt.Errorf("解析 Sub2API 余额失败: %w", err)
	}
	currency, _ := raw["unit"].(string)
	if currency == "" {
		currency = "USD"
	}
	amount := toFloat64(raw["balance"])
	if remaining, ok := raw["remaining"]; ok {
		amount = toFloat64(remaining)
	}
	usedAmount := 0.0
	if usage, ok := raw["usage"].(map[string]interface{}); ok {
		if total, ok := usage["total"].(map[string]interface{}); ok {
			usedAmount = toFloat64(total["cost"])
			if usedAmount == 0 {
				usedAmount = toFloat64(total["actual_cost"])
			}
		}
	}
	return upstreamBalanceInfo{
		Amount:     amount,
		Currency:   strings.ToUpper(currency),
		Credits:    amountToCredits(amount, currency),
		UsedAmount: usedAmount,
		Raw:        raw,
	}, nil
}

func createNewAPIToken(p model.UpstreamPlatform, name, group string, remainQuota int64, unlimited bool, expiredTime int64, modelLimitsEnabled bool, modelLimits string) (string, error) {
	if p.SystemTokenEnc == "" {
		return "", errors.New("平台未配置系统访问令牌")
	}
	if p.UpstreamUserID == "" {
		return "", errors.New("平台未配置 New-Api-User 用户 ID")
	}
	body := map[string]interface{}{
		"name":                 name,
		"remain_quota":         remainQuota,
		"unlimited_quota":      unlimited,
		"expired_time":         expiredTime,
		"model_limits_enabled": modelLimitsEnabled,
		"model_limits":         modelLimits,
		"group":                group,
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(p.BaseURL, "/")+"/api/token", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	applyNewAPIAdminHeaders(req, p)
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient15.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求上游创建 Key 失败: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("上游创建 Key 响应 %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	var result struct {
		Success bool        `json:"success"`
		Data    interface{} `json:"data"`
		Message string      `json:"message"`
		Error   string      `json:"error"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("解析上游创建 Key 响应失败: %w", err)
	}
	if !result.Success {
		msg := result.Message
		if msg == "" {
			msg = result.Error
		}
		if msg == "" {
			msg = "上游创建 Key 失败"
		}
		return "", errors.New(msg)
	}
	if key, ok := result.Data.(string); ok && key != "" {
		return key, nil
	}
	if m, ok := result.Data.(map[string]interface{}); ok {
		for _, field := range []string{"key", "token", "value"} {
			if key, _ := m[field].(string); key != "" {
				return key, nil
			}
		}
	}
	return "", errors.New("上游未返回 API Key")
}

func createUpstreamAPIToken(p model.UpstreamPlatform, name, group string, remainQuota int64, unlimited bool, expiredTime int64, modelLimitsEnabled bool, modelLimits string) (apiKey string, savedGroup string, err error) {
	switch normalizeUpstreamType(p.PlatformType) {
	case upstreamTypeNewAPI:
		key, err := createNewAPIToken(p, name, group, remainQuota, unlimited, expiredTime, modelLimitsEnabled, modelLimits)
		return key, group, err
	case upstreamTypeSub2API:
		return createSub2APIKey(p, name, group, remainQuota, unlimited, expiredTime)
	default:
		return "", "", errors.New("当前平台类型不支持创建上游 API Key")
	}
}

func createSub2APIKey(p model.UpstreamPlatform, name, group string, quota int64, unlimited bool, expiredTime int64) (string, string, error) {
	if strings.TrimSpace(p.SystemTokenEnc) == "" {
		return "", "", errors.New("平台未配置 Sub2API 控制台 JWT")
	}
	groupID, groupName, err := resolveSub2APIGroupID(p, group)
	if err != nil {
		return "", "", err
	}
	if unlimited || quota < 0 {
		quota = 0
	}
	var expiresAt interface{}
	if expiredTime > 0 {
		expiresAt = time.Unix(expiredTime, 0).Format(time.RFC3339)
	}
	body := map[string]interface{}{
		"name":          name,
		"group_id":      groupID,
		"quota":         quota,
		"expires_at":    expiresAt,
		"rate_limit_5h": 0,
		"rate_limit_1d": 0,
		"rate_limit_7d": 0,
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(p.BaseURL, "/")+"/api/v1/keys", bytes.NewReader(raw))
	if err != nil {
		return "", "", err
	}
	applySub2APIAdminHeaders(req, p)
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient15.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("请求 Sub2API 创建 Key 失败: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("Sub2API 创建 Key 响应 %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	var result struct {
		Code    int                    `json:"code"`
		Message string                 `json:"message"`
		Data    map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", "", fmt.Errorf("解析 Sub2API 创建 Key 响应失败: %w", err)
	}
	if result.Code != 0 {
		if result.Message == "" {
			result.Message = "Sub2API 创建 Key 失败"
		}
		return "", "", errors.New(result.Message)
	}
	for _, field := range []string{"key", "token", "api_key", "value"} {
		if key, _ := result.Data[field].(string); key != "" {
			return key, groupName, nil
		}
	}
	return "", "", errors.New("Sub2API 未返回 API Key")
}

func applyNewAPIAdminHeaders(req *http.Request, p model.UpstreamPlatform) {
	req.Header.Set("Authorization", "Bearer "+p.SystemTokenEnc)
	req.Header.Set("New-Api-User", p.UpstreamUserID)
}

func applySub2APIAdminHeaders(req *http.Request, p model.UpstreamPlatform) {
	req.Header.Set("Authorization", "Bearer "+p.SystemTokenEnc)
}

func fetchSub2APIGroups(p model.UpstreamPlatform) ([]sub2APIGroup, error) {
	if strings.TrimSpace(p.SystemTokenEnc) == "" {
		return nil, errors.New("平台未配置 Sub2API 控制台 JWT")
	}
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(p.BaseURL, "/")+"/api/v1/groups/available", nil)
	if err != nil {
		return nil, err
	}
	applySub2APIAdminHeaders(req, p)
	resp, err := httpClient15.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 Sub2API 分组失败: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Sub2API 分组接口响应 %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	var result struct {
		Code    int             `json:"code"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("解析 Sub2API 分组失败: %w", err)
	}
	if result.Code != 0 {
		if result.Message == "" {
			result.Message = "Sub2API 分组接口返回失败"
		}
		return nil, errors.New(result.Message)
	}
	var groups []sub2APIGroup
	if err := json.Unmarshal(result.Data, &groups); err == nil {
		return groups, nil
	}
	var wrapped struct {
		Items []sub2APIGroup `json:"items"`
	}
	if err := json.Unmarshal(result.Data, &wrapped); err != nil {
		return nil, fmt.Errorf("解析 Sub2API 分组 data 失败: %w", err)
	}
	return wrapped.Items, nil
}

func resolveSub2APIGroupID(p model.UpstreamPlatform, raw string) (int64, string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, "", errors.New("Sub2API 创建 Key 需要填写分组 ID 或分组名")
	}
	if id, err := strconv.ParseInt(raw, 10, 64); err == nil && id > 0 {
		return id, raw, nil
	}
	groups, err := fetchSub2APIGroups(p)
	if err != nil {
		return 0, "", err
	}
	group, ok := findSub2APIGroup(groups, raw)
	if !ok {
		return 0, "", fmt.Errorf("未找到 Sub2API 分组: %s", raw)
	}
	return group.ID, group.Name, nil
}

func findSub2APIGroup(groups []sub2APIGroup, raw string) (sub2APIGroup, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return sub2APIGroup{}, false
	}
	if id, err := strconv.ParseInt(raw, 10, 64); err == nil {
		for _, group := range groups {
			if group.ID == id {
				return group, true
			}
		}
	}
	for _, group := range groups {
		if strings.EqualFold(strings.TrimSpace(group.Name), raw) {
			return group, true
		}
	}
	return sub2APIGroup{}, false
}

func buildNewAPIBillingConfig(item upstreamPricingModel, groupRatio float64, markup float64) model.JSON {
	if groupRatio <= 0 {
		groupRatio = 1
	}
	if markup <= 0 {
		markup = 1
	}
	cfg := model.JSON{
		"source":              "newapi_pricing",
		"input_from_response": true,
	}
	if item.QuotaType == 1 {
		cost := dollarsToCredits(item.ModelPrice * groupRatio)
		cfg["cost_per_call"] = cost
		cfg["price_per_call"] = int64(math.Ceil(float64(cost) * markup))
		return cfg
	}
	inputCost := dollarsToCredits(item.ModelRatio * groupRatio * 2)
	outputCost := dollarsToCredits(item.ModelRatio * item.CompletionRatio * groupRatio * 2)
	cacheReadCost := dollarsToCredits(item.ModelRatio * item.CacheRatio * groupRatio * 2)
	cacheCreateCost := dollarsToCredits(item.ModelRatio * item.CreateCacheRatio * groupRatio * 2)
	cfg["input_cost_per_1m_tokens"] = inputCost
	cfg["output_cost_per_1m_tokens"] = outputCost
	cfg["cache_read_cost_per_1m_tokens"] = cacheReadCost
	cfg["cache_creation_cost_per_1m_tokens"] = cacheCreateCost
	cfg["input_price_per_1m_tokens"] = int64(math.Ceil(float64(inputCost) * markup))
	cfg["output_price_per_1m_tokens"] = int64(math.Ceil(float64(outputCost) * markup))
	cfg["cache_read_price_per_1m_tokens"] = int64(math.Ceil(float64(cacheReadCost) * markup))
	cfg["cache_creation_price_per_1m_tokens"] = int64(math.Ceil(float64(cacheCreateCost) * markup))
	return cfg
}

func applyUpstreamMarkup(cfg model.JSON, markup float64) model.JSON {
	if markup <= 0 || markup == 1 {
		out := model.JSON{}
		for k, v := range cfg {
			out[k] = v
		}
		return out
	}
	out := model.JSON{}
	for k, v := range cfg {
		out[k] = v
	}
	for costKey, priceKey := range map[string]string{
		"input_cost_per_1m_tokens":          "input_price_per_1m_tokens",
		"output_cost_per_1m_tokens":         "output_price_per_1m_tokens",
		"cache_read_cost_per_1m_tokens":     "cache_read_price_per_1m_tokens",
		"cache_creation_cost_per_1m_tokens": "cache_creation_price_per_1m_tokens",
		"cost_per_call":                     "price_per_call",
	} {
		if cost := toFloat64(out[costKey]); cost > 0 {
			out[priceKey] = int64(math.Ceil(cost * markup))
		}
	}
	out["price_markup"] = markup
	return out
}

func syncChannelsFromUpstream(ctx context.Context, p model.UpstreamPlatform, requestedModels []string, markup float64, upsert bool) (gin.H, error) {
	infos, err := fetchUpstreamModelInfos(p)
	if err != nil {
		return nil, err
	}
	infoByModel := make(map[string]upstreamModelInfo, len(infos))
	for _, info := range infos {
		if info.ID != "" {
			infoByModel[info.ID] = info
		}
	}

	modelNames := normalizeRequestedModels(requestedModels, infos)
	if len(modelNames) == 0 {
		return nil, errors.New("未选择可同步模型")
	}

	created := 0
	updated := 0
	skipped := 0
	priceSynced := 0
	priceUnavailable := 0
	for _, modelName := range modelNames {
		info, ok := infoByModel[modelName]
		if !ok {
			info = upstreamModelInfo{
				ID:          modelName,
				BillingType: "token",
				Protocol:    inferProtocolFromModelName(modelName),
			}
		}
		ch := buildUpstreamChannel(p, info, markup)
		existing, found, err := findExistingUpstreamChannel(p.ID, ch.Name, modelName)
		if err != nil {
			return nil, err
		}
		if found {
			if !upsert {
				skipped++
				continue
			}
			priceOK, priceMissing := applyUpstreamChannelUpdate(&existing, ch, info)
			if err := service.UpdateChannel(ctx, &existing); err != nil {
				return nil, err
			}
			updated++
			if priceOK {
				priceSynced++
			}
			if priceMissing {
				priceUnavailable++
			}
			continue
		}
		if err := service.CreateChannel(ctx, &ch); err != nil {
			skipped++
			continue
		}
		created++
		if info.BillingConfig != nil {
			priceSynced++
		} else {
			priceUnavailable++
		}
	}

	return gin.H{
		"created":           created,
		"updated":           updated,
		"skipped":           skipped,
		"price_synced":      priceSynced,
		"price_unavailable": priceUnavailable,
	}, nil
}

func previewUpstreamChannelBindings(p model.UpstreamPlatform, markup float64) ([]upstreamChannelBindingCandidate, error) {
	infos, err := fetchUpstreamModelInfos(p)
	if err != nil {
		return nil, err
	}
	infoByModel := buildUpstreamInfoLookup(infos)

	var channels []model.Channel
	if err := db.Engine.OrderBy("id ASC").Find(&channels); err != nil {
		return nil, err
	}

	candidates := make([]upstreamChannelBindingCandidate, 0)
	for _, ch := range channels {
		modelName := strings.TrimSpace(ch.Model)
		if modelName == "" {
			continue
		}
		info, ok := lookupUpstreamInfo(infoByModel, modelName)
		if !ok {
			continue
		}
		if !channelMatchesUpstreamBase(ch.BaseURL, p.BaseURL) {
			continue
		}
		existingPlatformID := jsonInt64(ch.BillingConfig["upstream_platform_id"])
		priceAvailable := info.BillingConfig != nil
		candidates = append(candidates, upstreamChannelBindingCandidate{
			ChannelID:          ch.ID,
			Name:               ch.Name,
			Model:              ch.Model,
			DisplayName:        ch.DisplayName,
			BaseURL:            ch.BaseURL,
			Protocol:           ch.Protocol,
			IsActive:           ch.IsActive,
			ExistingPlatformID: existingPlatformID,
			MatchReasons:       []string{"model", "base_url"},
			PriceAvailable:     priceAvailable,
			PriceWillUpdate:    priceAvailable && markup > 0,
		})
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		leftBound := candidates[i].ExistingPlatformID == p.ID
		rightBound := candidates[j].ExistingPlatformID == p.ID
		if leftBound != rightBound {
			return !leftBound
		}
		if candidates[i].Model != candidates[j].Model {
			return candidates[i].Model < candidates[j].Model
		}
		return candidates[i].ChannelID < candidates[j].ChannelID
	})
	return candidates, nil
}

func bindExistingChannelsToUpstream(ctx context.Context, p model.UpstreamPlatform, channelIDs []int64, markup float64, updatePrice bool) (gin.H, error) {
	infos, err := fetchUpstreamModelInfos(p)
	if err != nil {
		return nil, err
	}
	infoByModel := buildUpstreamInfoLookup(infos)
	idSet := make(map[int64]bool, len(channelIDs))
	for _, id := range channelIDs {
		if id > 0 {
			idSet[id] = true
		}
	}
	if len(idSet) == 0 {
		return nil, errors.New("未选择渠道")
	}

	var channels []model.Channel
	if err := db.Engine.In("id", channelIDs).Find(&channels); err != nil {
		return nil, err
	}

	bound := 0
	skipped := 0
	priceSynced := 0
	priceUnavailable := 0
	for _, ch := range channels {
		if !idSet[ch.ID] {
			continue
		}
		modelName := strings.TrimSpace(ch.Model)
		info, ok := lookupUpstreamInfo(infoByModel, modelName)
		if !ok || !channelMatchesUpstreamBase(ch.BaseURL, p.BaseURL) {
			skipped++
			continue
		}
		priceOK, priceMissing := applyUpstreamBindingUpdate(&ch, p, info, markup, updatePrice)
		if err := service.UpdateChannel(ctx, &ch); err != nil {
			return nil, err
		}
		bound++
		if priceOK {
			priceSynced++
		}
		if priceMissing {
			priceUnavailable++
		}
	}
	if missing := len(idSet) - len(channels); missing > 0 {
		skipped += missing
	}

	return gin.H{
		"bound":             bound,
		"updated":           bound,
		"skipped":           skipped,
		"price_synced":      priceSynced,
		"price_unavailable": priceUnavailable,
	}, nil
}

func applyUpstreamBindingUpdate(ch *model.Channel, p model.UpstreamPlatform, info upstreamModelInfo, markup float64, updatePrice bool) (priceSynced bool, priceUnavailable bool) {
	if ch.BillingConfig == nil {
		ch.BillingConfig = model.JSON{}
	}
	cfg := cloneJSON(ch.BillingConfig)
	modelName := strings.TrimSpace(ch.Model)
	if modelName == "" {
		modelName = strings.TrimSpace(info.ID)
	}

	if updatePrice && info.BillingConfig != nil {
		priceCfg := applyUpstreamMarkup(info.BillingConfig, markup)
		for key, value := range priceCfg {
			cfg[key] = value
		}
		if info.BillingType != "" {
			ch.BillingType = info.BillingType
		}
		priceSynced = true
	} else if info.BillingConfig == nil {
		cfg["source"] = normalizeUpstreamType(p.PlatformType) + "_models"
		cfg["price_unavailable"] = true
		priceUnavailable = true
	}
	addUpstreamBillingMeta(cfg, p, modelName)
	if info.BillingConfig == nil {
		cfg["price_unavailable"] = true
	}
	ch.BillingConfig = cfg
	return priceSynced, priceUnavailable
}

func buildUpstreamInfoLookup(infos []upstreamModelInfo) map[string]upstreamModelInfo {
	out := make(map[string]upstreamModelInfo, len(infos)*2)
	for _, info := range infos {
		modelName := strings.TrimSpace(info.ID)
		if modelName == "" {
			continue
		}
		out[modelName] = info
		out[strings.ToLower(modelName)] = info
	}
	return out
}

func lookupUpstreamInfo(infoByModel map[string]upstreamModelInfo, modelName string) (upstreamModelInfo, bool) {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return upstreamModelInfo{}, false
	}
	if info, ok := infoByModel[modelName]; ok {
		return info, true
	}
	info, ok := infoByModel[strings.ToLower(modelName)]
	return info, ok
}

func normalizeRequestedModels(requested []string, infos []upstreamModelInfo) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(requested)+len(infos))
	add := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" || seen[name] {
			return
		}
		seen[name] = true
		out = append(out, name)
	}
	if len(requested) > 0 {
		for _, name := range requested {
			add(name)
		}
		return out
	}
	for _, info := range infos {
		add(info.ID)
	}
	return out
}

func buildUpstreamChannel(p model.UpstreamPlatform, info upstreamModelInfo, markup float64) model.Channel {
	modelName := strings.TrimSpace(info.ID)
	proto := info.Protocol
	if proto == "" {
		proto = inferProtocolFromModelName(modelName)
	}
	if proto == "" {
		proto = "openai"
	}
	billingType := info.BillingType
	if billingType == "" {
		billingType = "token"
	}
	billingConfig := model.JSON{
		"input_from_response": true,
		"price_markup":        markup,
	}
	if info.BillingConfig != nil {
		billingConfig = applyUpstreamMarkup(info.BillingConfig, markup)
	} else {
		billingConfig["source"] = normalizeUpstreamType(p.PlatformType) + "_models"
		billingConfig["price_unavailable"] = true
	}
	addUpstreamBillingMeta(billingConfig, p, modelName)

	return model.Channel{
		Name:          p.Name + " - " + modelName,
		Model:         modelName,
		DisplayName:   modelName,
		Type:          "llm",
		BaseURL:       buildUpstreamEndpoint(p.BaseURL, proto),
		Method:        "POST",
		Headers:       model.JSON{"Authorization": "Bearer " + p.APIKeyEnc, "Content-Type": "application/json"},
		TimeoutMs:     60000,
		BillingType:   billingType,
		BillingConfig: billingConfig,
		Protocol:      proto,
		AuthType:      "bearer",
		IsActive:      info.BillingConfig != nil,
		Weight:        1,
		ModelProvider: inferProviderFromModel(modelName),
		Description:   fmt.Sprintf("Imported from %s", p.Name),
	}
}

func applyUpstreamChannelUpdate(existing *model.Channel, next model.Channel, info upstreamModelInfo) (priceSynced bool, priceUnavailable bool) {
	existing.Model = next.Model
	if existing.DisplayName == "" {
		existing.DisplayName = next.DisplayName
	}
	existing.Type = next.Type
	existing.BaseURL = next.BaseURL
	existing.Method = next.Method
	existing.Headers = next.Headers
	existing.TimeoutMs = next.TimeoutMs
	existing.Protocol = next.Protocol
	existing.AuthType = next.AuthType
	if existing.ModelProvider == "" {
		existing.ModelProvider = next.ModelProvider
	}
	if existing.Description == "" || strings.HasPrefix(existing.Description, "Imported from ") {
		existing.Description = next.Description
	}
	if info.BillingConfig != nil {
		existing.BillingType = next.BillingType
		existing.BillingConfig = next.BillingConfig
		return true, false
	}
	if existing.BillingConfig == nil {
		existing.BillingConfig = model.JSON{}
	}
	for _, key := range []string{
		"source", "price_markup", "price_unavailable", "upstream_platform_id",
		"upstream_platform_name", "upstream_platform_type", "upstream_base_url", "upstream_model",
	} {
		if value, ok := next.BillingConfig[key]; ok {
			existing.BillingConfig[key] = value
		}
	}
	return false, true
}

func findExistingUpstreamChannel(platformID int64, defaultName, modelName string) (model.Channel, bool, error) {
	var channels []model.Channel
	if err := db.Engine.Where("model = ? OR name = ?", modelName, defaultName).Find(&channels); err != nil {
		return model.Channel{}, false, err
	}
	for _, ch := range channels {
		if jsonInt64(ch.BillingConfig["upstream_platform_id"]) == platformID {
			return ch, true, nil
		}
	}
	for _, ch := range channels {
		if ch.Name == defaultName {
			return ch, true, nil
		}
	}
	return model.Channel{}, false, nil
}

func addUpstreamBillingMeta(cfg model.JSON, p model.UpstreamPlatform, modelName string) {
	cfg["upstream_platform_id"] = p.ID
	cfg["upstream_platform_name"] = p.Name
	cfg["upstream_platform_type"] = normalizeUpstreamType(p.PlatformType)
	cfg["upstream_base_url"] = p.BaseURL
	cfg["upstream_model"] = modelName
	if _, ok := cfg["price_unavailable"]; !ok {
		cfg["price_unavailable"] = false
	}
}

func buildUpstreamEndpoint(baseURL, proto string) string {
	baseURL = strings.TrimRight(baseURL, "/")
	switch proto {
	case "claude":
		return baseURL + "/v1/messages"
	case "gemini":
		return baseURL + "/v1beta/models/{model}:{stream_action}"
	case "responses":
		return baseURL + "/v1/responses"
	default:
		return baseURL + "/v1/chat/completions"
	}
}

func dollarsToCredits(usd float64) int64 {
	if usd <= 0 {
		return 0
	}
	return int64(math.Ceil(usd * creditsPerCNY))
}

func amountToCredits(amount float64, currency string) int64 {
	if amount <= 0 {
		return 0
	}
	// This project has no exchange-rate setting yet. Keep upstream USD/CNY
	// balances in the existing credits unit using the same numeric amount.
	return int64(math.Round(amount * creditsPerCNY))
}

func inferProtocolFromPricing(item upstreamPricingModel) string {
	for _, typ := range item.EndpointTypes {
		switch strings.ToLower(typ) {
		case "anthropic", "claude":
			return "claude"
		case "gemini":
			return "gemini"
		case "openai":
			return "openai"
		}
	}
	if strings.Contains(strings.ToLower(item.ModelName), "claude") {
		return "claude"
	}
	return "openai"
}

func inferProtocolFromModelName(modelName string) string {
	lower := strings.ToLower(modelName)
	switch {
	case strings.Contains(lower, "claude"):
		return "claude"
	case strings.Contains(lower, "gemini"):
		return "gemini"
	default:
		return "openai"
	}
}

func protocolFromSub2APIPlatform(platform string) string {
	switch strings.ToLower(strings.TrimSpace(platform)) {
	case "anthropic", "claude":
		return "claude"
	case "gemini", "google", "vertex":
		return "gemini"
	default:
		return "openai"
	}
}

func inferProviderFromModel(modelName string) string {
	lower := strings.ToLower(modelName)
	switch {
	case strings.Contains(lower, "claude"):
		return "Anthropic"
	case strings.Contains(lower, "gemini"):
		return "Google"
	case strings.Contains(lower, "gpt") || strings.Contains(lower, "codex"):
		return "OpenAI"
	default:
		return ""
	}
}

func normalizeBaseURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err == nil && u.Scheme != "" && u.Host != "" {
		u.Path = strings.TrimRight(u.Path, "/")
		u.RawQuery = ""
		u.Fragment = ""
		return strings.TrimRight(u.String(), "/")
	}
	return strings.TrimRight(raw, "/")
}

func channelMatchesUpstreamBase(channelBaseURL, upstreamBaseURL string) bool {
	chURL, chOK := parseMatchURL(channelBaseURL)
	upURL, upOK := parseMatchURL(upstreamBaseURL)
	if chOK && upOK {
		if !strings.EqualFold(chURL.Host, upURL.Host) {
			return false
		}
		upPath := strings.TrimRight(upURL.Path, "/")
		chPath := strings.TrimRight(chURL.Path, "/")
		if upPath == "" {
			return true
		}
		return chPath == upPath || strings.HasPrefix(chPath, upPath+"/")
	}
	chBase := strings.ToLower(strings.TrimRight(normalizeBaseURL(channelBaseURL), "/"))
	upBase := strings.ToLower(strings.TrimRight(normalizeBaseURL(upstreamBaseURL), "/"))
	return upBase != "" && (chBase == upBase || strings.HasPrefix(chBase, upBase+"/"))
}

func parseMatchURL(raw string) (*url.URL, bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil, false
	}
	u.RawQuery = ""
	u.Fragment = ""
	return u, true
}

func normalizeUpstreamType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case upstreamTypeNewAPI, "zzshu", "oneapi", "new-api":
		return upstreamTypeNewAPI
	case upstreamTypeSub2API, "sub2", "modelboxs", "sub2-api":
		return upstreamTypeSub2API
	default:
		return upstreamTypeOpenAI
	}
}

func isNewAPI(raw string) bool {
	return normalizeUpstreamType(raw) == upstreamTypeNewAPI
}

func firstPricingGroup(groupRatio map[string]float64) string {
	if len(groupRatio) == 0 {
		return ""
	}
	keys := make([]string, 0, len(groupRatio))
	for k := range groupRatio {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys[0]
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func jsonInt64(v interface{}) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case int32:
		return int64(n)
	case float64:
		return int64(n)
	case float32:
		return int64(n)
	case json.Number:
		i, _ := n.Int64()
		return i
	case string:
		i, _ := strconv.ParseInt(n, 10, 64)
		return i
	default:
		return 0
	}
}

func toFloat64(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(n, 64)
		return f
	default:
		return 0
	}
}

var httpClient15 = &http.Client{Timeout: 15 * time.Second}
