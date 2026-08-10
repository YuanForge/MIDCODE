package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"

	"github.com/gin-gonic/gin"
	"xorm.io/xorm"
)

func ListModelOfficialPrices(c *gin.Context) {
	if !requireAdminPermission(c, "settings:write") {
		return
	}
	filter, ok := parseModelOfficialPriceFilter(c)
	if !ok {
		return
	}
	prices, total, err := service.ListModelOfficialPrices(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取官方价失败，请稍后重试"})
		return
	}
	rate, err := service.GetUSDCNYExchangeRateStatus(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取汇率状态失败，请稍后重试"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"prices": prices, "total": total, "exchange_rate": rate})
}

func CreateModelOfficialPrice(c *gin.Context) {
	if !requireAdminPermission(c, "settings:write") {
		return
	}
	var input service.CreateModelOfficialPriceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	price, ok := commitModelOfficialPriceMutation(c, "create", model.JSON{}, func(session *xorm.Session) (*model.ModelOfficialPrice, error) {
		return service.CreateModelOfficialPriceTx(session, input)
	})
	if !ok {
		return
	}
	c.JSON(http.StatusCreated, price)
}

func UpdateModelOfficialPrice(c *gin.Context) {
	if !requireAdminPermission(c, "settings:write") {
		return
	}
	id, ok := parseModelOfficialPriceID(c)
	if !ok {
		return
	}
	var input service.UpdateModelOfficialPriceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	price, ok := commitModelOfficialPriceMutation(c, "update", model.JSON{}, func(session *xorm.Session) (*model.ModelOfficialPrice, error) {
		return service.UpdateModelOfficialPriceTx(session, id, input)
	})
	if !ok {
		return
	}
	c.JSON(http.StatusOK, price)
}

func SetModelOfficialPriceStatus(c *gin.Context) {
	if !requireAdminPermission(c, "settings:write") {
		return
	}
	id, ok := parseModelOfficialPriceID(c)
	if !ok {
		return
	}
	var input struct {
		IsActive *bool `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.IsActive == nil {
		if err == nil {
			err = errors.New("is_active is required")
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	price, ok := commitModelOfficialPriceMutation(c, "status", model.JSON{"is_active": *input.IsActive}, func(session *xorm.Session) (*model.ModelOfficialPrice, error) {
		return service.SetModelOfficialPriceStatusTx(session, id, *input.IsActive)
	})
	if !ok {
		return
	}
	c.JSON(http.StatusOK, price)
}

func DeleteModelOfficialPrice(c *gin.Context) {
	if !requireAdminPermission(c, "settings:write") {
		return
	}
	id, ok := parseModelOfficialPriceID(c)
	if !ok {
		return
	}
	_, ok = commitModelOfficialPriceMutation(c, "delete", model.JSON{}, func(session *xorm.Session) (*model.ModelOfficialPrice, error) {
		return service.DeleteModelOfficialPriceTx(session, id)
	})
	if !ok {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func parseModelOfficialPriceFilter(c *gin.Context) (service.ModelOfficialPriceListFilter, bool) {
	filter := service.ModelOfficialPriceListFilter{Page: 1, Size: 20, ModelName: c.Query("model_name"), BillingType: c.Query("billing_type")}
	var err error
	if value := c.Query("page"); value != "" {
		filter.Page, err = strconv.Atoi(value)
		if err != nil || filter.Page < 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "page is invalid"})
			return filter, false
		}
	}
	if value := c.Query("size"); value != "" {
		filter.Size, err = strconv.Atoi(value)
		if err != nil || filter.Size < 1 || filter.Size > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "size is invalid"})
			return filter, false
		}
	}
	if value := c.Query("model_provider_id"); value != "" {
		filter.ModelProviderID, err = strconv.ParseInt(value, 10, 64)
		if err != nil || filter.ModelProviderID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "model_provider_id is invalid"})
			return filter, false
		}
	}
	if value := c.Query("is_active"); value != "" {
		active, parseErr := strconv.ParseBool(value)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "is_active is invalid"})
			return filter, false
		}
		filter.IsActive = &active
	}
	return filter, true
}

func parseModelOfficialPriceID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "model official price id is invalid"})
		return 0, false
	}
	return id, true
}

func writeModelOfficialPriceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrModelOfficialPriceProviderNotFound), errors.Is(err, service.ErrModelOfficialPriceNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrModelOfficialPriceConflict):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrModelOfficialPriceInvalid), errors.Is(err, service.ErrModelOfficialPriceExchangeRateUnavailable):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存官方价失败，请稍后重试"})
	}
}

func commitModelOfficialPriceMutation(c *gin.Context, action string, extra model.JSON, mutate func(*xorm.Session) (*model.ModelOfficialPrice, error)) (*model.ModelOfficialPrice, bool) {
	session := db.Engine.NewSession().Context(c.Request.Context())
	defer session.Close()
	if err := session.Begin(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存官方价失败，请稍后重试"})
		return nil, false
	}
	price, err := mutate(session)
	if err != nil {
		_ = session.Rollback()
		writeModelOfficialPriceError(c, err)
		return nil, false
	}
	if err := writeModelOfficialPriceAudit(session, c, action, price, extra); err != nil {
		_ = session.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存官方价失败，请稍后重试"})
		return nil, false
	}
	if err := session.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存官方价失败，请稍后重试"})
		return nil, false
	}
	return price, true
}

func writeModelOfficialPriceAudit(session *xorm.Session, c *gin.Context, action string, price *model.ModelOfficialPrice, extra model.JSON) error {
	adminID := getAdminID(c)
	var admin model.User
	_, _ = session.ID(adminID).Cols("email", "username").Get(&admin)
	adminEmail := admin.Username
	if admin.Email != nil && strings.TrimSpace(*admin.Email) != "" {
		adminEmail = *admin.Email
	}
	detail := model.JSON{
		"model_provider_id":       price.ModelProviderID,
		"model_name":              price.ModelName,
		"billing_type":            price.BillingType,
		"currency":                price.Currency,
		"source_price_config":     price.SourcePriceConfig,
		"normalized_price_config": price.NormalizedPriceConfig,
		"exchange_rate_used":      price.ExchangeRateUsed,
		"exchange_rate_date":      price.ExchangeRateDate,
		"is_active":               price.IsActive,
	}
	for key, value := range extra {
		detail[key] = value
	}
	audit := &model.AdminAuditLog{
		AdminID:      adminID,
		AdminEmail:   adminEmail,
		Action:       action,
		ResourceType: "model_official_price",
		ResourceID:   price.ID,
		Summary:      fmt.Sprintf("%s official price %s (%s)", action, price.ModelName, price.BillingType),
		Detail:       detail,
		IP:           c.ClientIP(),
		UA:           c.Request.UserAgent(),
	}
	_, err := session.Insert(audit)
	return err
}
