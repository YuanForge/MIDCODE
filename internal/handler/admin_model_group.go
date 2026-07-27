package handler

import (
	"fanapi/internal/model"
	"fanapi/internal/service"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type modelGroupPayload struct {
	Code            string `json:"code"`
	Name            string `json:"name"`
	ModelProviderID int64  `json:"model_provider_id"`
	Description     string `json:"description"`
	IsActive        bool   `json:"is_active"`
}

func ListModelGroups(c *gin.Context) {
	groups, err := service.ListModelGroups(c.Request.Context(), c.Query("include_inactive") == "true")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"groups": groups})
}

func CreateModelGroup(c *gin.Context) {
	var req modelGroupPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	group := model.ModelGroup{Code: req.Code, Name: req.Name, ModelProviderID: req.ModelProviderID, Description: req.Description, IsActive: req.IsActive}
	if err := service.CreateModelGroup(c.Request.Context(), &group); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, group)
}

func UpdateModelGroup(c *gin.Context) {
	id, err := parseModelGroupID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var req modelGroupPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	group := model.ModelGroup{ID: id, Code: req.Code, Name: req.Name, ModelProviderID: req.ModelProviderID, Description: req.Description, IsActive: req.IsActive}
	if err := service.UpdateModelGroup(c.Request.Context(), &group); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, group)
}

func ToggleModelGroup(c *gin.Context) {
	id, err := parseModelGroupID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var req struct {
		IsActive bool `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := service.ToggleModelGroup(c.Request.Context(), id, req.IsActive); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteModelGroup(c *gin.Context) {
	id, err := parseModelGroupID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := service.DeleteModelGroup(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func ListModelGroupModels(c *gin.Context) {
	id, err := parseModelGroupID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	models, err := service.ListModelGroupModels(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"models": models})
}

func BindModelGroupModel(c *gin.Context) {
	groupID, err := parseModelGroupID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var req struct {
		ChannelID    int64  `json:"channel_id"`
		RoutingModel string `json:"routing_model"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	binding, err := service.BindModelGroupModel(c.Request.Context(), groupID, req.ChannelID, strings.TrimSpace(req.RoutingModel))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, binding)
}

func UnbindModelGroupModel(c *gin.Context) {
	groupID, err := parseModelGroupID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	bindingID, err := strconv.ParseInt(c.Param("modelID"), 10, 64)
	if err != nil || bindingID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "model binding id is invalid"})
		return
	}
	if err := service.UnbindModelGroupModel(c.Request.Context(), groupID, bindingID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func parseModelGroupID(c *gin.Context) (int64, error) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, strconv.ErrSyntax
	}
	return id, nil
}
