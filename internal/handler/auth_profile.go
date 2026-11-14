package handler

import (
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"net/http"
)

// GET /user/profile
func (h *AuthHandler) GetProfile(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)
	user := &model.User{}
	found, err := db.Engine.ID(userID).Cols("id", "username", "email", "role", "group").Get(user)
	if err != nil || !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":       user.ID,
		"username": user.Username,
		"email":    user.Email,
		"role":     user.Role,
		"group":    user.Group,
	})
}

// POST /user/bind-email — 登录后绑定邮箱（需先调 /auth/send-code 获取验证码）
func (h *AuthHandler) BindEmail(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
		Code  string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID := c.MustGet("user_id").(int64)
	if err := service.BindEmail(c.Request.Context(), userID, req.Email, req.Code); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "邮箱绑定成功"})
}

// PUT /user/password — 当前登录用户修改自己的密码（已登录状态下无需提供旧密码）
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)
	var req struct {
		NewPassword string `json:"new_password" binding:"required,min=8,max=128"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}
	affected, err := db.Engine.ID(userID).Cols("password_hash").Update(&model.User{PasswordHash: string(hash)})
	if err != nil || affected != 1 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码修改失败，请重试"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码修改成功"})
}
