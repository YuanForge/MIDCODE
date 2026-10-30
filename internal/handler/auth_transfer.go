package handler

import (
	"errors"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"
	"github.com/gin-gonic/gin"
	"net/http"
)

func (h *AuthHandler) TransferCredits(c *gin.Context) {
	if c.GetString("auth_type") != "jwt" {
		c.JSON(http.StatusForbidden, gin.H{"error": "请登录个人中心进行转赠"})
		return
	}
	var req struct {
		RecipientID int64  `json:"recipient_id"`
		Credits     int64  `json:"credits"`
		RequestID   string `json:"request_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "转赠参数无效"})
		return
	}
	err := service.TransferCredits(c.Request.Context(), c.MustGet("user_id").(int64), req.RecipientID, req.Credits, req.RequestID)
	if err != nil {
		if errors.Is(err, service.ErrTransfer) {
			c.JSON(400, gin.H{"error": err.Error()})
		} else {
			c.JSON(500, gin.H{"error": "暂时无法确认转赠结果，请使用相同信息重试"})
		}
		return
	}
	c.JSON(200, gin.H{"message": "积分转赠成功"})
}
func (h *AuthHandler) GetTransferBalance(c *gin.Context) {
	balance, err := service.GetDBBalance(c.Request.Context(), c.MustGet("user_id").(int64))
	if err != nil {
		c.JSON(500, gin.H{"error": "获取可转赠积分失败"})
		return
	}
	c.JSON(200, gin.H{"credits": max(int64(0), balance)})
}

func (h *AuthHandler) LatestReceivedGift(c *gin.Context) {
	var gift model.BillingTransaction
	found, err := db.Engine.Context(c.Request.Context()).Where("user_id = ? AND type = ?", c.MustGet("user_id").(int64), "transfer_in").Desc("id").Get(&gift)
	if err != nil {
		c.JSON(500, gin.H{"error": "获取转赠通知失败"})
		return
	}
	if !found {
		c.JSON(200, gin.H{"gift": nil})
		return
	}
	c.JSON(200, gin.H{"gift": gin.H{"id": gift.ID, "credits": gift.Credits, "created_at": gift.CreatedAt}})
}
