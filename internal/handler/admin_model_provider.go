package handler

import (
	"errors"
	"net/http"
	"strconv"

	"fanapi/internal/model"
	"fanapi/internal/service"

	"github.com/gin-gonic/gin"
)

type modelProviderPayload struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	SortOrder *int   `json:"sort_order"`
}

func ListModelProviders(c *gin.Context) {
	providers, err := service.ListModelProviders(c.Request.Context(), c.Query("include_inactive") == "true")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"providers": providers})
}

func CreateModelProvider(c *gin.Context) {
	var req modelProviderPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	sortOrder := 0
	if req.SortOrder == nil {
		var err error
		sortOrder, err = service.NextModelProviderSortOrder(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		sortOrder = *req.SortOrder
	}
	provider := &model.ModelProvider{Code: req.Code, Name: req.Name, SortOrder: sortOrder, IsActive: true}
	if err := service.CreateModelProvider(c.Request.Context(), provider); err != nil {
		writeModelProviderError(c, err)
		return
	}
	c.JSON(http.StatusCreated, provider)
}

func UpdateModelProvider(c *gin.Context) {
	id, ok := parseModelProviderID(c)
	if !ok {
		return
	}
	var req modelProviderPayload
	if err := c.ShouldBindJSON(&req); err != nil || req.SortOrder == nil {
		if err == nil {
			err = errors.New("sort_order is required")
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	provider := &model.ModelProvider{ID: id, Code: req.Code, Name: req.Name, SortOrder: *req.SortOrder}
	if err := service.UpdateModelProvider(c.Request.Context(), provider); err != nil {
		writeModelProviderError(c, err)
		return
	}
	c.JSON(http.StatusOK, provider)
}

func ToggleModelProvider(c *gin.Context) {
	id, ok := parseModelProviderID(c)
	if !ok {
		return
	}
	var req struct {
		IsActive *bool `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.IsActive == nil {
		if err == nil {
			err = errors.New("is_active is required")
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := service.ToggleModelProvider(c.Request.Context(), id, *req.IsActive); err != nil {
		writeModelProviderError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteModelProvider(c *gin.Context) {
	id, ok := parseModelProviderID(c)
	if !ok {
		return
	}
	if err := service.DeleteModelProvider(c.Request.Context(), id); err != nil {
		writeModelProviderError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func parseModelProviderID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "model provider id is invalid"})
		return 0, false
	}
	return id, true
}

func writeModelProviderError(c *gin.Context, err error) {
	var referenced *service.ModelProviderReferencedError
	switch {
	case errors.Is(err, service.ErrModelProviderNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.As(err, &referenced):
		c.JSON(http.StatusConflict, gin.H{
			"error": err.Error(), "group_count": referenced.GroupCount, "channel_count": referenced.ChannelCount,
		})
	case errors.Is(err, service.ErrModelProviderConflict), errors.Is(err, service.ErrModelProviderReferenced):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case isModelProviderValidationError(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

func isModelProviderValidationError(err error) bool {
	if err == nil {
		return false
	}
	message := err.Error()
	return message == "model provider is required" ||
		message == "model provider id is required" ||
		message == "model provider name is required" ||
		message == "model provider sort order cannot be negative" ||
		message == "model provider code must match [a-z0-9][a-z0-9_-]*"
}
