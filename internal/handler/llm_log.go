package handler

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	billingcalc "fanapi/internal/billing"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"

	"github.com/gin-gonic/gin"
	"xorm.io/xorm"
)

type tokenPriceMeta struct {
	InputPricePer1MTokens  *int64 `json:"input_price_per_1m_tokens,omitempty"`
	OutputPricePer1MTokens *int64 `json:"output_price_per_1m_tokens,omitempty"`
}

func configInt64Ptr(cfg model.JSON, key string) *int64 {
	if cfg == nil {
		return nil
	}
	raw, ok := cfg[key]
	if !ok {
		return nil
	}
	value, ok := numberToFloat64(raw)
	if !ok || value < 0 {
		return nil
	}
	rounded := int64(math.Round(value))
	return &rounded
}

func resolveTokenPriceMeta(ch *model.Channel, userGroup string) tokenPriceMeta {
	if ch == nil || ch.BillingType != "token" || ch.BillingConfig == nil {
		return tokenPriceMeta{}
	}

	cfg := model.JSON(billingcalc.EffectivePricingConfig(map[string]interface{}(ch.BillingConfig), userGroup))

	return tokenPriceMeta{
		InputPricePer1MTokens:  configInt64Ptr(cfg, "input_price_per_1m_tokens"),
		OutputPricePer1MTokens: configInt64Ptr(cfg, "output_price_per_1m_tokens"),
	}
}

func resolveTokenPriceMetaValue(ch *model.Channel, userGroup string) (*int64, *int64) {
	meta := resolveTokenPriceMeta(ch, userGroup)
	return meta.InputPricePer1MTokens, meta.OutputPricePer1MTokens
}

func coalesceTokenPrice(stored *int64, fallback *int64) *int64 {
	if stored != nil {
		return stored
	}
	return fallback
}

func displayTokenPriceMeta(ch *model.Channel, stored tokenPriceMeta, historicalGroup string, fallbackGroup string) tokenPriceMeta {
	if strings.TrimSpace(historicalGroup) != "" {
		basePrice := resolveTokenPriceMeta(ch, "")
		legacyGroupPrice := resolveLegacyGroupTokenPriceMeta(ch, historicalGroup)
		groupPrice := resolveTokenPriceMeta(ch, historicalGroup)
		return tokenPriceMeta{
			InputPricePer1MTokens:  replaceStoredLegacyTokenPrice(stored.InputPricePer1MTokens, basePrice.InputPricePer1MTokens, legacyGroupPrice.InputPricePer1MTokens, groupPrice.InputPricePer1MTokens),
			OutputPricePer1MTokens: replaceStoredLegacyTokenPrice(stored.OutputPricePer1MTokens, basePrice.OutputPricePer1MTokens, legacyGroupPrice.OutputPricePer1MTokens, groupPrice.OutputPricePer1MTokens),
		}
	}

	fallbackPrice := resolveTokenPriceMeta(ch, fallbackGroup)
	return tokenPriceMeta{
		InputPricePer1MTokens:  coalesceTokenPrice(stored.InputPricePer1MTokens, fallbackPrice.InputPricePer1MTokens),
		OutputPricePer1MTokens: coalesceTokenPrice(stored.OutputPricePer1MTokens, fallbackPrice.OutputPricePer1MTokens),
	}
}

func resolveLegacyGroupTokenPriceMeta(ch *model.Channel, userGroup string) tokenPriceMeta {
	if ch == nil || ch.BillingType != "token" || ch.BillingConfig == nil {
		return tokenPriceMeta{}
	}
	cfg := model.JSON(applyGroupPricingMap(map[string]interface{}(ch.BillingConfig), userGroup))
	return tokenPriceMeta{
		InputPricePer1MTokens:  configInt64Ptr(cfg, "input_price_per_1m_tokens"),
		OutputPricePer1MTokens: configInt64Ptr(cfg, "output_price_per_1m_tokens"),
	}
}

func replaceStoredLegacyTokenPrice(stored *int64, base *int64, legacyGroup *int64, group *int64) *int64 {
	if stored == nil {
		return group
	}
	if (int64PtrEqual(stored, base) || int64PtrEqual(stored, legacyGroup)) && !int64PtrEqual(stored, group) {
		return group
	}
	return stored
}

func int64PtrEqual(left *int64, right *int64) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

func loadChannelPricingMap(channelIDs []int64) map[int64]model.Channel {
	if len(channelIDs) == 0 {
		return map[int64]model.Channel{}
	}

	var channels []model.Channel
	if err := db.Engine.In("id", channelIDs).
		Cols("id", "billing_type", "billing_config").
		Find(&channels); err != nil {
		return map[int64]model.Channel{}
	}

	channelMap := make(map[int64]model.Channel, len(channels))
	for _, ch := range channels {
		channelMap[ch.ID] = ch
	}
	return channelMap
}

func collectChannelIDs(logs []model.LLMLog) []int64 {
	channelIDs := make([]int64, 0, len(logs))
	seen := make(map[int64]bool, len(logs))
	for _, l := range logs {
		if l.ChannelID <= 0 || seen[l.ChannelID] {
			continue
		}
		seen[l.ChannelID] = true
		channelIDs = append(channelIDs, l.ChannelID)
	}
	return channelIDs
}

func loadLogUserGroupMap(logs []model.LLMLog) map[string]string {
	groupMap := map[string]string{}
	if len(logs) == 0 {
		return groupMap
	}
	corrIDFilter, args := billingCorrIDFilter(logs)
	if corrIDFilter == "" {
		return groupMap
	}

	type txGroupRow struct {
		CorrID    string `xorm:"corr_id"`
		UserGroup string `xorm:"user_group"`
	}
	var rows []txGroupRow
	sqlStr := `SELECT corr_id, COALESCE(MAX(metrics->>'user_group'), '') AS user_group
		FROM billing_transactions WHERE ` + corrIDFilter + ` GROUP BY corr_id`
	if err := db.Engine.SQL(sqlStr, args...).Find(&rows); err != nil {
		return groupMap
	}
	for _, row := range rows {
		if row.CorrID == "" || strings.TrimSpace(row.UserGroup) == "" {
			continue
		}
		groupMap[row.CorrID] = strings.TrimSpace(row.UserGroup)
	}
	return groupMap
}

// GET /admin/llm-logs
// Query params: user_id, channel_id, status, corr_id, model, start_at, end_at, page, page_size
func AdminListLLMLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	type filterSet struct {
		userID    string
		channelID string
		status    string
		corrID    string
		model     string
		startAt   string
		endAt     string
	}
	f := filterSet{
		userID:    c.Query("user_id"),
		channelID: c.Query("channel_id"),
		status:    c.Query("status"),
		corrID:    c.Query("corr_id"),
		model:     c.Query("model"),
		startAt:   c.Query("start_at"),
		endAt:     c.Query("end_at"),
	}

	applyFilters := func() *xorm.Session {
		s := db.Engine.NewSession()
		if f.userID != "" {
			s.And("user_id = ?", f.userID)
		}
		if f.channelID != "" {
			s.And("channel_id = ?", f.channelID)
		}
		if f.status != "" {
			s.And("status = ?", f.status)
		}
		if f.corrID != "" {
			s.And("corr_id = ?", f.corrID)
		}
		if f.model != "" {
			s.And("model = ?", f.model)
		}
		if f.startAt != "" {
			if t, err := parseDateTime(f.startAt, false); err == nil {
				s.And("created_at >= ?", t)
			}
		}
		if f.endAt != "" {
			if t, err := parseDateTime(f.endAt, true); err == nil {
				s.And("created_at <= ?", t)
			}
		}
		return s
	}

	countSess := applyFilters()
	defer countSess.Close()
	total, err := countSess.Count(new(model.LLMLog))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败，请稍后重试"})
		return
	}

	listSess := applyFilters()
	defer listSess.Close()
	var logs []model.LLMLog
	err = listSess.Cols("id", "user_id", "channel_id", "api_key_id", "corr_id",
		"model", "is_stream", "transport", "upstream_url", "upstream_method",
		"upstream_status", "usage", "status", "error_msg", "created_at").
		OrderBy("id DESC").Limit(pageSize, offset).Find(&logs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败，请稍后重试"})
		return
	}

	// 聚合每条日志对应的净扣费积分与上游成本
	creditsMap := map[string]int64{}
	costMap := map[string]int64{}
	poolKeyMap := map[string]int64{}
	if len(logs) > 0 {
		type txRow struct {
			CorrID  string `xorm:"corr_id"`
			Credits int64  `xorm:"credits"`
			Cost    int64  `xorm:"cost"`
			PoolKey int64  `xorm:"pool_key_id"`
		}
		corrIDFilter, args := billingCorrIDFilter(logs)
		if corrIDFilter != "" {
			sqlStr := `SELECT corr_id,
				COALESCE(SUM(CASE WHEN type IN ('hold','charge','settle') THEN credits WHEN type='refund' THEN -credits ELSE 0 END),0) AS credits,
				COALESCE(SUM(CASE WHEN type IN ('hold','charge','settle') THEN cost    WHEN type='refund' THEN -cost    ELSE 0 END),0) AS cost,
				COALESCE(MAX(pool_key_id), 0) AS pool_key_id
				FROM billing_transactions WHERE ` + corrIDFilter + ` GROUP BY corr_id`
			var rows []txRow
			_ = db.Engine.SQL(sqlStr, args...).Find(&rows)
			for _, r := range rows {
				creditsMap[r.CorrID] = r.Credits
				costMap[r.CorrID] = r.Cost
				poolKeyMap[r.CorrID] = r.PoolKey
			}
		}
	}

	usernameMap := map[int64]string{}
	userIDs := make([]int64, 0, len(logs))
	seenUserID := map[int64]bool{}
	for _, l := range logs {
		if !seenUserID[l.UserID] {
			seenUserID[l.UserID] = true
			userIDs = append(userIDs, l.UserID)
		}
	}
	if len(userIDs) > 0 {
		var users []model.User
		if err := db.Engine.In("id", userIDs).Cols("id", "username").Find(&users); err == nil {
			for _, u := range users {
				usernameMap[u.ID] = u.Username
			}
		}
	}

	upstreamKeyMap := map[int64]string{}
	poolKeyIDs := make([]int64, 0, len(poolKeyMap))
	seenPoolKeyID := map[int64]bool{}
	for _, keyID := range poolKeyMap {
		if keyID <= 0 || seenPoolKeyID[keyID] {
			continue
		}
		seenPoolKeyID[keyID] = true
		poolKeyIDs = append(poolKeyIDs, keyID)
	}
	if len(poolKeyIDs) > 0 {
		var keys []model.PoolKey
		if err := db.Engine.In("id", poolKeyIDs).Cols("id", "value").Find(&keys); err == nil {
			for _, k := range keys {
				upstreamKeyMap[k.ID] = maskKeyValue(k.Value)
			}
		}
	}

	type logWithCredits struct {
		model.LLMLog
		CreditsCharged int64  `json:"credits_charged"`
		CostCharged    int64  `json:"cost_charged"`
		Username       string `json:"username,omitempty"`
		UpstreamAPIKey string `json:"upstream_api_key,omitempty"`
	}
	result := make([]logWithCredits, len(logs))
	for i, l := range logs {
		upstreamAPIKey := ""
		if poolKeyID := poolKeyMap[l.CorrID]; poolKeyID > 0 {
			upstreamAPIKey = upstreamKeyMap[poolKeyID]
		}
		result[i] = logWithCredits{
			LLMLog:         l,
			CreditsCharged: creditsMap[l.CorrID],
			CostCharged:    costMap[l.CorrID],
			Username:       usernameMap[l.UserID],
			UpstreamAPIKey: upstreamAPIKey,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":      result,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// GET /admin/llm-logs/:id
func AdminGetLLMLog(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var log model.LLMLog
	has, err := db.Engine.ID(id).Get(&log)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败，请稍后重试"})
		return
	}
	if !has {
		c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
		return
	}
	c.JSON(http.StatusOK, log)
}

// billingCorrIDFilter builds a non-empty corr_id filter that can use the partial corr_id index.
func billingCorrIDFilter(logs []model.LLMLog) (string, []interface{}) {
	seen := make(map[string]bool, len(logs))
	args := make([]interface{}, 0, len(logs))
	placeholders := make([]string, 0, len(logs))
	for _, l := range logs {
		corrID := strings.TrimSpace(l.CorrID)
		if corrID == "" || seen[corrID] {
			continue
		}
		seen[corrID] = true
		args = append(args, corrID)
		placeholders = append(placeholders, fmt.Sprintf("$%d", len(args)))
	}
	if len(args) == 0 {
		return "", nil
	}
	return "corr_id != '' AND corr_id IN (" + strings.Join(placeholders, ",") + ")", args
}

// GET /v1/llm-logs  (用户查自己的日志，不含 upstream_request 详情)
func UserListLLMLogs(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)
	userGroup, _ := c.Get("user_group")
	groupName, _ := userGroup.(string)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	type filterSet struct {
		status    string
		corrID    string
		model     string
		channelID string
		startAt   string
		endAt     string
	}
	f := filterSet{
		status:    c.Query("status"),
		corrID:    c.Query("corr_id"),
		model:     c.Query("model"),
		channelID: c.Query("channel_id"),
		startAt:   c.Query("start_at"),
		endAt:     c.Query("end_at"),
	}

	applyFilters := func() *xorm.Session {
		s := db.Engine.Where("user_id = ?", userID)
		if f.status != "" {
			s.And("status = ?", f.status)
		}
		if f.corrID != "" {
			s.And("corr_id = ?", f.corrID)
		}
		if f.model != "" {
			s.And("model = ?", f.model)
		}
		if f.channelID != "" {
			s.And("channel_id = ?", f.channelID)
		}
		if f.startAt != "" {
			if t, err := parseDateTime(f.startAt, false); err == nil {
				s.And("created_at >= ?", t)
			}
		}
		if f.endAt != "" {
			if t, err := parseDateTime(f.endAt, true); err == nil {
				s.And("created_at <= ?", t)
			}
		}
		return s
	}

	countSess := applyFilters()
	defer countSess.Close()
	total, err := countSess.Count(new(model.LLMLog))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败，请稍后重试"})
		return
	}

	var logs []model.LLMLog
	// 用户列表不返回 upstream_request / upstream_response / upstream_url 等上游信息
	listSess := applyFilters()
	defer listSess.Close()
	err = listSess.Cols("id", "channel_id", "corr_id", "model",
		"input_price_per_1m_tokens", "output_price_per_1m_tokens", "is_stream",
		"upstream_status", "usage", "status", "error_msg", "created_at").
		OrderBy("id DESC").Limit(pageSize, offset).Find(&logs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败，请稍后重试"})
		return
	}

	channelMap := loadChannelPricingMap(collectChannelIDs(logs))
	logGroupMap := loadLogUserGroupMap(logs)

	// 查询每条日志对应的净扣费积分（hold/charge/settle 扣除 refund 后的实际消耗）
	creditsMap := map[string]int64{}
	if len(logs) > 0 {
		type txRow struct {
			CorrID  string `xorm:"corr_id"`
			Credits int64  `xorm:"credits"`
		}
		corrIDFilter, args := billingCorrIDFilter(logs)
		if corrIDFilter != "" {
			var rows []txRow
			sqlStr := `SELECT corr_id,
				COALESCE(SUM(CASE WHEN type IN ('hold','charge','settle') THEN credits WHEN type='refund' THEN -credits ELSE 0 END),0) AS credits
				FROM billing_transactions WHERE ` + corrIDFilter + ` GROUP BY corr_id`
			_ = db.Engine.SQL(sqlStr, args...).Find(&rows)
			for _, r := range rows {
				creditsMap[r.CorrID] = r.Credits
			}
		}
	}

	type logWithCredits struct {
		model.LLMLog
		CreditsCharged int64 `json:"credits_charged"`
	}
	result := make([]logWithCredits, len(logs))
	for i, l := range logs {
		if l.ErrorMsg != "" {
			l.ErrorMsg = service.UserFacingErrorMessage(l.ErrorMsg)
		}
		ch := channelMap[l.ChannelID]
		displayPrice := displayTokenPriceMeta(&ch, tokenPriceMeta{
			InputPricePer1MTokens:  l.InputPricePer1MTokens,
			OutputPricePer1MTokens: l.OutputPricePer1MTokens,
		}, logGroupMap[l.CorrID], groupName)
		l.InputPricePer1MTokens = displayPrice.InputPricePer1MTokens
		l.OutputPricePer1MTokens = displayPrice.OutputPricePer1MTokens
		result[i] = logWithCredits{
			LLMLog:         l,
			CreditsCharged: creditsMap[l.CorrID],
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":      result,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// GET /v1/llm-logs/:id  （用户查自己某条日志的完整详情，只含用户可见字段）
func UserGetLLMLog(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)
	userGroup, _ := c.Get("user_group")
	groupName, _ := userGroup.(string)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var log model.LLMLog
	has, err := db.Engine.ID(id).Where("user_id = ?", userID).Get(&log)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败，请稍后重试"})
		return
	}
	if !has {
		c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
		return
	}
	// 只返回用户可见字段，不暴露上游路由、Key、请求头等内部信息
	type userLogDetail struct {
		ID                     int64      `json:"id"`
		CorrID                 string     `json:"corr_id"`
		Model                  string     `json:"model"`
		IsStream               bool       `json:"is_stream"`
		ClientRequest          model.JSON `json:"client_request,omitempty"`  // 用户原始请求
		ClientResponse         model.JSON `json:"client_response,omitempty"` // 平台返回给用户的响应
		Usage                  model.JSON `json:"usage,omitempty"`
		Status                 string     `json:"status"`
		ErrorMsg               string     `json:"error_msg,omitempty"`
		CreatedAt              string     `json:"created_at"`
		UpdatedAt              string     `json:"updated_at"`
		InputPricePer1MTokens  *int64     `json:"input_price_per_1m_tokens,omitempty"`
		OutputPricePer1MTokens *int64     `json:"output_price_per_1m_tokens,omitempty"`
	}
	channelMap := loadChannelPricingMap([]int64{log.ChannelID})
	channel := channelMap[log.ChannelID]
	logGroupMap := loadLogUserGroupMap([]model.LLMLog{log})
	displayPrice := displayTokenPriceMeta(&channel, tokenPriceMeta{
		InputPricePer1MTokens:  log.InputPricePer1MTokens,
		OutputPricePer1MTokens: log.OutputPricePer1MTokens,
	}, logGroupMap[log.CorrID], groupName)
	c.JSON(http.StatusOK, userLogDetail{
		ID:             log.ID,
		CorrID:         log.CorrID,
		Model:          log.Model,
		IsStream:       log.IsStream,
		ClientRequest:  log.ClientRequest,
		ClientResponse: log.ClientResponse,
		Usage:          log.Usage,
		Status:         log.Status,
		ErrorMsg: func() string {
			if log.ErrorMsg == "" {
				return ""
			}
			return service.UserFacingErrorMessage(log.ErrorMsg)
		}(),
		CreatedAt:              log.CreatedAt.Format("2006-01-02 15:04:05"),
		UpdatedAt:              log.UpdatedAt.Format("2006-01-02 15:04:05"),
		InputPricePer1MTokens:  displayPrice.InputPricePer1MTokens,
		OutputPricePer1MTokens: displayPrice.OutputPricePer1MTokens,
	})
}
