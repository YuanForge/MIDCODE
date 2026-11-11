package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"unicode"

	"fanapi/internal/db"
	"fanapi/internal/model"

	"github.com/gin-gonic/gin"
)

// ListModelPreferences only returns the authenticated user's preferences.
func (h *AuthHandler) ListModelPreferences(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if userID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	preferences := make([]model.UserModelPreference, 0)
	if err := db.Engine.Context(c.Request.Context()).Where("user_id = ?", userID).
		OrderBy("routing_model ASC").Find(&preferences); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取模型偏好失败，请稍后重试"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"preferences": preferences})
}

type modelPreferencePatch struct {
	RoutingModel string `json:"routing_model"`
	Pinned       *bool  `json:"pinned"`
	Favorite     *bool  `json:"favorite"`
}

func (h *AuthHandler) UpdateModelPreference(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if userID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	var request modelPreferencePatch
	decoder := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "模型偏好参数无效"})
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": "模型偏好参数无效"})
		return
	}
	request.RoutingModel = strings.TrimSpace(request.RoutingModel)
	if request.RoutingModel == "" || len(request.RoutingModel) > 512 ||
		strings.ContainsFunc(request.RoutingModel, unicode.IsControl) ||
		(request.Pinned == nil && request.Favorite == nil) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供有效模型及置顶或收藏状态"})
		return
	}

	// Validate the public model identity using the same active catalog as ListModels.
	// API keys are additionally restricted to their bound model groups.
	query := `SELECT EXISTS (
		SELECT 1 FROM model_group_models mgm
		JOIN model_groups mg ON mg.id = mgm.group_id AND mg.is_active = true
		JOIN channels ch ON ch.id = mgm.channel_id AND ch.is_active = true
		JOIN model_providers mp ON mp.id = ch.model_provider_id AND mp.is_active = true
		WHERE trim(mgm.routing_model) = ?`
	args := []interface{}{request.RoutingModel}
	if apiKeyID := c.GetInt64("api_key_id"); apiKeyID > 0 {
		query += ` AND EXISTS (SELECT 1 FROM api_key_model_groups akmg WHERE akmg.group_id = mg.id AND akmg.api_key_id = ?)`
		args = append(args, apiKeyID)
	}
	query += `) AS available`
	var catalog struct{ Available bool }
	if _, err := db.Engine.Context(c.Request.Context()).SQL(query, args...).Get(&catalog); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取模型列表失败，请稍后重试"})
		return
	}
	if !catalog.Available {
		c.JSON(http.StatusNotFound, gin.H{"error": "模型不存在或当前不可用"})
		return
	}

	// A single upsert preserves omitted fields even when different tabs update
	// favorite and pinned concurrently. Explicit false must still be persisted.
	const upsert = `INSERT INTO user_model_preferences
		(user_id, routing_model, pinned, favorite, created_at, updated_at)
		VALUES (?, ?, COALESCE(?, false), COALESCE(?, false), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT (user_id, routing_model) DO UPDATE SET
		pinned = COALESCE(?, user_model_preferences.pinned),
		favorite = COALESCE(?, user_model_preferences.favorite),
		updated_at = CURRENT_TIMESTAMP
		RETURNING routing_model, pinned, favorite`
	var preference model.UserModelPreference
	found, err := db.Engine.Context(c.Request.Context()).SQL(upsert,
		userID, request.RoutingModel, request.Pinned, request.Favorite, request.Pinned, request.Favorite).Get(&preference)
	if err != nil || !found {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存模型偏好失败，请稍后重试"})
		return
	}
	c.JSON(http.StatusOK, preference)
}
