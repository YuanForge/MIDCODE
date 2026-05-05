package handler

import (
	"net/http"
	"strconv"

	"fanapi/internal/db"
	"fanapi/internal/model"

	"github.com/gin-gonic/gin"
)

// ListConversations 列出当前用户的对话历史（最多 50 条，按更新时间倒序）
// GET /v1/conversations
func ListConversations(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)

	size, _ := strconv.Atoi(c.DefaultQuery("size", "50"))
	if size < 1 || size > 200 {
		size = 50
	}

	var convs []model.ChatConversation
	if err := db.Engine.Where("user_id = ?", userID).
		OrderBy("updated_at DESC").
		Limit(size).
		Find(&convs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": convs})
}

// SaveConversation 创建或更新对话（按 id 判断；id=0 则新建）
// POST /v1/conversations
func SaveConversation(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)

	var req struct {
		ID       int64         `json:"id"`
		Title    string        `json:"title"`
		Model    string        `json:"model"`
		Messages model.RawJSON `json:"messages"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if req.ID > 0 {
		// 更新
		conv := model.ChatConversation{}
		found, err := db.Engine.Where("id = ? AND user_id = ?", req.ID, userID).Get(&conv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
			return
		}
		if !found {
			c.JSON(http.StatusNotFound, gin.H{"error": "对话不存在"})
			return
		}
		conv.Title = req.Title
		conv.Model = req.Model
		conv.Messages = req.Messages
		if _, err := db.Engine.ID(conv.ID).
			Cols("title", "model", "messages", "updated_at").
			Update(&conv); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
			return
		}
		c.JSON(http.StatusOK, conv)
		return
	}

	// 新建
	conv := model.ChatConversation{
		UserID:   userID,
		Title:    req.Title,
		Model:    req.Model,
		Messages: req.Messages,
	}
	if _, err := db.Engine.Insert(&conv); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, conv)
}

// DeleteConversation 删除指定对话
// DELETE /v1/conversations/:id
func DeleteConversation(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}

	n, err := db.Engine.Where("id = ? AND user_id = ?", id, userID).
		Delete(new(model.ChatConversation))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "对话不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
