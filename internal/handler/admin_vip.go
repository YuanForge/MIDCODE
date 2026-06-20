package handler

import (
	"fanapi/internal/model"
	"fanapi/internal/service"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
)

type vipGroupPayload struct {
	Code              string `json:"code"`
	Name              string `json:"name"`
	RechargeThreshold int64  `json:"recharge_threshold"`
	DiscountBps       int64  `json:"discount_bps"`
	SortOrder         int    `json:"sort_order"`
	Description       string `json:"description"`
	IsActive          bool   `json:"is_active"`
}

// GET /admin/vip-groups
func ListVIPGroups(c *gin.Context) {
	includeInactive := c.Query("include_inactive") == "true" || c.Query("include_inactive") == "1"
	groups, err := service.ListVIPGroups(c.Request.Context(), includeInactive)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"groups": groups})
}

// POST /admin/vip-groups
func CreateVIPGroup(c *gin.Context) {
	var req vipGroupPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	group := payloadToVIPGroup(req)
	if err := service.CreateVIPGroup(c.Request.Context(), &group); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, group)
}

// PUT /admin/vip-groups/:id
func UpdateVIPGroup(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var req vipGroupPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	group := payloadToVIPGroup(req)
	group.ID = id
	if err := service.UpdateVIPGroup(c.Request.Context(), &group); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, group)
}

// DELETE /admin/vip-groups/:id
func DeleteVIPGroup(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	if err := service.DeleteVIPGroup(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// POST /admin/users/:id/refresh-vip
func RefreshUserVIPGroup(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	group, totalRecharge, err := service.RefreshUserVIPGroup(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"group":              group,
		"total_recharge":     totalRecharge,
		"total_recharge_cny": float64(totalRecharge) / 1_000_000,
		"discount_bps":       service.VIPDiscountBpsForGroup(group),
		"discount_percent":   float64(service.VIPDiscountBpsForGroup(group)) / 100,
	})
}

// POST /admin/vip-groups/refresh-users
func RefreshAllUserVIPGroups(c *gin.Context) {
	count, err := service.RefreshAllUserVIPGroups(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "refreshed": count})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "refreshed": count})
}

// PUT /admin/users/:id/vip-group
func SetUserVIPGroup(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var req struct {
		Group string `json:"group"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := service.SetUserVIPGroup(c.Request.Context(), id, req.Group); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "vip group updated", "group": req.Group})
}

func payloadToVIPGroup(req vipGroupPayload) model.VIPGroup {
	discountBps := req.DiscountBps
	if discountBps == 0 {
		discountBps = 10000
	}
	return model.VIPGroup{
		Code:              req.Code,
		Name:              req.Name,
		RechargeThreshold: req.RechargeThreshold,
		DiscountBps:       discountBps,
		SortOrder:         req.SortOrder,
		Description:       req.Description,
		IsActive:          req.IsActive,
	}
}
