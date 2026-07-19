package handler

import (
	billingcalc "fanapi/internal/billing"
	"net/http"
	"strconv"
	"strings"

	"fanapi/internal/config"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"

	"github.com/gin-gonic/gin"
)

type ResellerHandler struct {
	cfg *config.Config
}

func NewResellerHandler(cfg *config.Config) *ResellerHandler {
	return &ResellerHandler{cfg: cfg}
}

func (h *ResellerHandler) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	account := strings.TrimSpace(req.Username)
	if account == "" {
		account = strings.TrimSpace(req.Email)
	}
	if account == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入用户名或邮箱"})
		return
	}
	token, reseller, user, err := service.LoginReseller(c.Request.Context(), account, req.Password, &h.cfg.Server)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"reseller": gin.H{
			"id":       reseller.ID,
			"name":     reseller.Name,
			"user_id":  reseller.UserID,
			"username": user.Username,
			"email":    user.Email,
		},
	})
}

func (h *ResellerHandler) GetProfile(c *gin.Context) {
	resellerID := c.MustGet("reseller_id").(int64)
	row, err := loadResellerAdminRow(resellerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if row == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "代理商不存在"})
		return
	}
	c.JSON(http.StatusOK, row)
}

func (h *ResellerHandler) ListKeys(c *gin.Context) {
	resellerID := c.MustGet("reseller_id").(int64)
	items, err := service.ListResellerAPIKeys(c.Request.Context(), resellerID, h.cfg.Server.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"keys": items})
}

func (h *ResellerHandler) CreateKey(c *gin.Context) {
	resellerID := c.MustGet("reseller_id").(int64)
	var req struct {
		Name     string  `json:"name" binding:"required,max=64"`
		GroupIDs []int64 `json:"group_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rawKey, err := service.GenerateResellerAPIKeyWithGroups(c.Request.Context(), resellerID, req.Name, req.GroupIDs, h.cfg.Server.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"key": rawKey, "note": "请妥善保存，该 Key 后续只显示一次"})
}

func (h *ResellerHandler) ListSites(c *gin.Context) {
	resellerID := c.MustGet("reseller_id").(int64)
	var sites []model.ResellerSite
	if err := db.Engine.Where("reseller_id = ?", resellerID).Desc("id").Find(&sites); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sites": sites})
}

func (h *ResellerHandler) CreateSite(c *gin.Context) {
	resellerID := c.MustGet("reseller_id").(int64)
	var req struct {
		APIKeyID     int64   `json:"api_key_id"`
		SiteName     string  `json:"site_name" binding:"required,max=80"`
		LogoURL      string  `json:"logo_url"`
		Domain       string  `json:"domain"`
		ProfitRatio  float64 `json:"profit_ratio"`
		SMTPHost     string  `json:"smtp_host" binding:"required"`
		SMTPPort     int     `json:"smtp_port"`
		SMTPUser     string  `json:"smtp_user" binding:"required"`
		SMTPPassword string  `json:"smtp_password" binding:"required"`
		SMTPFrom     string  `json:"smtp_from" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := service.CreateResellerSite(c.Request.Context(), resellerID, service.CreateResellerSiteInput{
		APIKeyID:     req.APIKeyID,
		SiteName:     req.SiteName,
		LogoURL:      req.LogoURL,
		Domain:       req.Domain,
		ProfitRatio:  req.ProfitRatio,
		SMTPHost:     req.SMTPHost,
		SMTPPort:     req.SMTPPort,
		SMTPUser:     req.SMTPUser,
		SMTPPassword: req.SMTPPassword,
		SMTPFrom:     req.SMTPFrom,
	}, h.cfg)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"site": result.Site, "job": result.Job})
}

func (h *ResellerHandler) GetBuildProgress(c *gin.Context) {
	resellerID := c.MustGet("reseller_id").(int64)
	siteID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效站点 ID"})
		return
	}
	var site model.ResellerSite
	found, err := db.Engine.Where("id = ? AND reseller_id = ?", siteID, resellerID).Get(&site)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "代理站不存在"})
		return
	}
	var jobs []model.ResellerSiteBuildJob
	if err := db.Engine.Where("site_id = ? AND reseller_id = ?", site.ID, resellerID).Desc("id").Limit(10).Find(&jobs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"site": site, "jobs": jobs})
}

func ResellerPlatformChannels(c *gin.Context) {
	authType, _ := c.Get("auth_type")
	if authType != "apikey" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "reseller API key required"})
		return
	}
	userID := c.MustGet("user_id").(int64)
	var user model.User
	found, err := db.Engine.ID(userID).Cols("role", "is_active").Get(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !found || user.Role != "reseller" || !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "reseller API key required"})
		return
	}

	var channels []model.Channel
	if err := db.Engine.Where("is_active = true").
		Cols("id", "name", "model", "display_name", "model_provider", "type", "protocol", "billing_type", "billing_config", "icon_url", "description", "updated_at").
		OrderBy("id ASC").
		Find(&channels); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type platformChannel struct {
		ID            int64                  `json:"id"`
		Name          string                 `json:"name"`
		RoutingModel  string                 `json:"routing_model"`
		ModelProvider string                 `json:"model_provider"`
		Type          string                 `json:"type"`
		Protocol      string                 `json:"protocol"`
		BillingType   string                 `json:"billing_type"`
		BillingConfig map[string]interface{} `json:"billing_config"`
		PriceDisplay  string                 `json:"price_display"`
		IconURL       string                 `json:"icon_url"`
		Description   string                 `json:"description"`
		UpdatedAt     interface{}            `json:"updated_at"`
	}

	items := make([]platformChannel, 0, len(channels))
	for _, ch := range channels {
		routingModel := service.ChannelRoutingKey(ch)
		if routingModel == "" {
			continue
		}
		priceConfig := billingcalc.EffectivePricingConfig(map[string]interface{}(ch.BillingConfig), "")
		sanitizedConfig := sanitizeResellerBillingConfig(priceConfig)
		items = append(items, platformChannel{
			ID:            ch.ID,
			Name:          firstNonEmpty(ch.DisplayName, ch.Name, ch.Model),
			RoutingModel:  routingModel,
			ModelProvider: service.EffectiveModelProvider(ch),
			Type:          ch.Type,
			Protocol:      ch.Protocol,
			BillingType:   ch.BillingType,
			BillingConfig: sanitizedConfig,
			PriceDisplay:  buildPriceDisplay(ch.BillingType, model.JSON(sanitizedConfig)),
			IconURL:       ch.IconURL,
			Description:   ch.Description,
			UpdatedAt:     ch.UpdatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"channels": items})
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func sanitizeResellerBillingConfig(cfg map[string]interface{}) map[string]interface{} {
	if cfg == nil {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, len(cfg))
	for key, value := range cfg {
		if resellerBillingFieldHidden(key) {
			continue
		}
		if nested, ok := normalizeResellerJSONMap(value); ok {
			out[key] = sanitizeResellerBillingConfig(nested)
			continue
		}
		out[key] = value
	}
	return out
}

func normalizeResellerJSONMap(value interface{}) (map[string]interface{}, bool) {
	switch typed := value.(type) {
	case map[string]interface{}:
		return typed, true
	case model.JSON:
		return map[string]interface{}(typed), true
	default:
		return nil, false
	}
}

func resellerBillingFieldHidden(key string) bool {
	k := strings.ToLower(strings.TrimSpace(key))
	if k == "" {
		return true
	}
	switch k {
	case "pricing_groups", "upstream_platform_id", "upstream_model", "source", "price_unavailable", "cost_unavailable":
		return true
	}
	return strings.HasPrefix(k, "cost_") ||
		strings.HasPrefix(k, "upstream_") ||
		strings.Contains(k, "_cost_") ||
		strings.HasSuffix(k, "_cost") ||
		strings.Contains(k, "auto_sync") ||
		strings.Contains(k, "secret") ||
		strings.Contains(k, "api_key")
}

func AdminListResellers(c *gin.Context) {
	rows, err := db.Engine.QueryString(`
SELECT
  r.id, r.user_id, r.name, r.contact_name, r.phone, r.notes, r.is_active, r.created_at, r.updated_at,
  u.username, u.email,
  COALESCE((SELECT COUNT(*) FROM api_keys WHERE user_id = r.user_id), 0) AS key_count,
  COALESCE((SELECT COUNT(*) FROM reseller_sites WHERE reseller_id = r.id), 0) AS site_count
FROM resellers r
JOIN users u ON u.id = r.user_id
ORDER BY r.id DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, resellerRowFromMap(row))
	}
	c.JSON(http.StatusOK, gin.H{"resellers": items})
}

func AdminCreateReseller(c *gin.Context) {
	var req struct {
		Username    string `json:"username" binding:"required,min=3,max=32"`
		Email       string `json:"email"`
		Password    string `json:"password" binding:"required,min=8,max=128"`
		Name        string `json:"name" binding:"required,max=80"`
		ContactName string `json:"contact_name"`
		Phone       string `json:"phone"`
		Notes       string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	reseller, user, err := service.CreateReseller(c.Request.Context(), service.CreateResellerInput{
		Username:    req.Username,
		Email:       req.Email,
		Password:    req.Password,
		Name:        req.Name,
		ContactName: req.ContactName,
		Phone:       req.Phone,
		Notes:       req.Notes,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"reseller": reseller,
		"user":     gin.H{"id": user.ID, "username": user.Username, "email": user.Email, "role": user.Role},
	})
}

func AdminUpdateReseller(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效代理商 ID"})
		return
	}
	var req struct {
		Name        *string `json:"name"`
		ContactName *string `json:"contact_name"`
		Phone       *string `json:"phone"`
		Notes       *string `json:"notes"`
		IsActive    *bool   `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var reseller model.Reseller
	found, err := db.Engine.ID(id).Get(&reseller)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "代理商不存在"})
		return
	}
	cols := []string{}
	if req.Name != nil {
		reseller.Name = strings.TrimSpace(*req.Name)
		cols = append(cols, "name")
	}
	if req.ContactName != nil {
		reseller.ContactName = strings.TrimSpace(*req.ContactName)
		cols = append(cols, "contact_name")
	}
	if req.Phone != nil {
		reseller.Phone = strings.TrimSpace(*req.Phone)
		cols = append(cols, "phone")
	}
	if req.Notes != nil {
		reseller.Notes = strings.TrimSpace(*req.Notes)
		cols = append(cols, "notes")
	}
	if req.IsActive != nil {
		reseller.IsActive = *req.IsActive
		cols = append(cols, "is_active")
		_, _ = db.Engine.ID(reseller.UserID).Cols("is_active").Update(&model.User{IsActive: *req.IsActive})
	}
	if len(cols) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有可更新字段"})
		return
	}
	if _, err := db.Engine.ID(id).Cols(cols...).Update(&reseller); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "更新成功"})
}

func AdminListResellerSites(c *gin.Context) {
	query := db.Engine.Desc("id")
	if resellerID, err := strconv.ParseInt(c.Query("reseller_id"), 10, 64); err == nil && resellerID > 0 {
		query = query.Where("reseller_id = ?", resellerID)
	}
	var sites []model.ResellerSite
	if err := query.Find(&sites); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sites": sites})
}

func AdminListResellerSiteBuildJobs(c *gin.Context) {
	query := db.Engine.Desc("id").Limit(200)
	if siteID, err := strconv.ParseInt(c.Query("site_id"), 10, 64); err == nil && siteID > 0 {
		query = query.Where("site_id = ?", siteID)
	}
	if resellerID, err := strconv.ParseInt(c.Query("reseller_id"), 10, 64); err == nil && resellerID > 0 {
		query = query.Where("reseller_id = ?", resellerID)
	}
	var jobs []model.ResellerSiteBuildJob
	if err := query.Find(&jobs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"jobs": jobs})
}

func AdminRetryResellerBuildJob(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效任务 ID"})
		return
	}
	if !resellerBuildEnabled(c) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reseller_builder.auto_build 未开启，不能自动重试"})
		return
	}
	if err := service.BuildResellerSite(c.Request.Context(), id, appConfigFromContext(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "重试完成"})
}

func loadResellerAdminRow(id int64) (gin.H, error) {
	rows, err := db.Engine.QueryString(`
SELECT
  r.id, r.user_id, r.name, r.contact_name, r.phone, r.notes, r.is_active, r.created_at, r.updated_at,
  u.username, u.email,
  COALESCE((SELECT COUNT(*) FROM api_keys WHERE user_id = r.user_id), 0) AS key_count,
  COALESCE((SELECT COUNT(*) FROM reseller_sites WHERE reseller_id = r.id), 0) AS site_count
FROM resellers r
JOIN users u ON u.id = r.user_id
WHERE r.id = $1`, id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	row := resellerRowFromMap(rows[0])
	return row, nil
}

func resellerRowFromMap(row map[string]string) gin.H {
	return gin.H{
		"id":           parseInt64Field(row, "id"),
		"user_id":      parseInt64Field(row, "user_id"),
		"name":         row["name"],
		"contact_name": row["contact_name"],
		"phone":        row["phone"],
		"notes":        row["notes"],
		"is_active":    parseBoolField(row["is_active"]),
		"username":     row["username"],
		"email":        row["email"],
		"key_count":    parseInt64Field(row, "key_count"),
		"site_count":   parseInt64Field(row, "site_count"),
		"created_at":   row["created_at"],
		"updated_at":   row["updated_at"],
	}
}

func parseBoolField(value string) bool {
	return value == "true" || value == "t" || value == "1"
}

func appConfigFromContext(c *gin.Context) *config.Config {
	if raw, ok := c.Get("app_config"); ok {
		if cfg, ok := raw.(*config.Config); ok {
			return cfg
		}
	}
	return &config.Config{}
}

func resellerBuildEnabled(c *gin.Context) bool {
	return appConfigFromContext(c).ResellerBuilder.AutoBuild
}
