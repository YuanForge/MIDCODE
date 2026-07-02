package handler

import (
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"
	"github.com/gin-gonic/gin"
	"net/http"
)

// POST /auth/send-code  — 公用：注册绑定邮箱 / 找回密码前发验证码
func (h *AuthHandler) SendCode(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": formatBindError(err)})
		return
	}
	if err := service.SendVerifyCode(c.Request.Context(), req.Email, h.mailer); err != nil {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "验证码已发送"})
}

// POST /auth/register — 用户名 + 邮箱 + 验证码 + 密码
func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Username   string `json:"username" binding:"required,min=3,max=32"`
		Email      string `json:"email" binding:"required,email"`
		Code       string `json:"code" binding:"required"`
		Password   string `json:"password" binding:"required,min=8,max=128"`
		InviteCode string `json:"invite_code"` // 邀请码（可选）
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": formatBindError(err)})
		return
	}
	// 解析邀请人
	var inviterID *int64
	var inviterQR string
	if req.InviteCode != "" {
		inviter := &model.User{}
		if found, _ := db.Engine.Where("invite_code = ?", req.InviteCode).Cols("id", "wechat_qr").Get(inviter); found {
			inviterID = &inviter.ID
			inviterQR = inviter.WechatQR
		}
	}
	user, err := service.Register(c.Request.Context(), req.Username, req.Email, req.Code, req.Password, inviterID)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	// 注册后自动登录
	token, _, tokenErr := service.Login(c.Request.Context(), req.Username, req.Password, h.cfg)
	if tokenErr != nil {
		c.JSON(http.StatusCreated, gin.H{"id": user.ID, "username": user.Username})
		return
	}
	resp := gin.H{"token": token, "user": gin.H{"id": user.ID, "username": user.Username, "role": user.Role}}
	if inviterQR != "" {
		resp["inviter_wechat_qr"] = inviterQR
	}
	c.JSON(http.StatusCreated, resp)
}

// POST /auth/login — 用户名或邮箱 + 密码
// 接受 {username, password} 或 {email, password}，兼容两种调用方
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	usernameOrEmail := req.Username
	if usernameOrEmail == "" {
		usernameOrEmail = req.Email
	}
	if usernameOrEmail == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入用户名或邮筱"})
		return
	}
	token, user, err := service.Login(c.Request.Context(), usernameOrEmail, req.Password, h.cfg)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	// 如果用户是被客服邀请的，返回该客服的微信二维码
	var inviterQR string
	if user.InviterID != nil {
		inviter := &model.User{}
		if found, _ := db.Engine.ID(*user.InviterID).Cols("wechat_qr").Get(inviter); found {
			inviterQR = inviter.WechatQR
		}
	}
	resp := gin.H{"token": token, "user": gin.H{"id": user.ID, "username": user.Username, "email": user.Email, "role": user.Role}}
	if inviterQR != "" {
		resp["inviter_wechat_qr"] = inviterQR
	}
	c.JSON(http.StatusOK, resp)
}

// POST /auth/forgot-password — 向已绑定邮箱发送重置验证码（邮箱不存在时静默成功，防枚举）
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = service.SendPasswordResetCode(c.Request.Context(), req.Email, h.mailer)
	c.JSON(http.StatusOK, gin.H{"message": "如果该邮箱已绑定账号，重置验证码将发送至您的邮筱"})
}

// POST /auth/reset-password — 通过邮箱验证码重置密码
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Code     string `json:"code" binding:"required"`
		Password string `json:"password" binding:"required,min=8,max=128"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": formatBindError(err)})
		return
	}
	if err := service.ResetPasswordByEmail(c.Request.Context(), req.Email, req.Code, req.Password); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已重置，请使用新密码登录"})
}
