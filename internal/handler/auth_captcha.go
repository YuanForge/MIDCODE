package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"fanapi/internal/captcha"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
)

func (h *AuthHandler) captchaIP(c *gin.Context) string {
	return captcha.ResolveIP(c.Request, h.captcha.Trusted)
}
func captchaError(c *gin.Context, err error) {
	c.Set("security_captcha_result", "rejected")
	switch {
	case errors.Is(err, captcha.ErrInvalid):
		c.JSON(403, gin.H{"code": "CAPTCHA_REQUIRED", "error": "请完成人机验证后重试"})
	case errors.Is(err, captcha.ErrLimited):
		c.Header("Retry-After", "600")
		c.JSON(429, gin.H{"code": "CAPTCHA_RATE_LIMITED", "error": "验证请求过于频繁，请稍后重试"})
	default:
		c.JSON(503, gin.H{"code": "CAPTCHA_UNAVAILABLE", "error": "验证服务暂不可用，请稍后重试"})
	}
}

type captchaRequest struct {
	Purpose string `json:"purpose" binding:"required,oneof=login send_code reset_email"`
	Subject string `json:"subject" binding:"required,max=254"`
}

func (h *AuthHandler) CaptchaNew(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	var req captchaRequest
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"error": "验证参数无效"})
		return
	}
	out, e := h.captcha.Issue(c.Request.Context(), h.captchaIP(c), req.Purpose, strings.TrimSpace(req.Subject))
	if e != nil {
		captchaError(c, e)
		return
	}
	c.JSON(http.StatusOK, out)
}
func (h *AuthHandler) CaptchaVerify(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	var req struct {
		captchaRequest
		ID     string         `json:"id" binding:"required,len=64"`
		Answer captcha.Answer `json:"answer"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"error": "验证参数无效"})
		return
	}
	token, e := h.captcha.Verify(c.Request.Context(), h.captchaIP(c), req.Purpose, strings.TrimSpace(req.Subject), req.ID, req.Answer)
	if e != nil {
		captchaError(c, e)
		return
	}
	c.JSON(200, gin.H{"token": token})
}
func (h *AuthHandler) requireCaptcha(c *gin.Context, purpose, subject, token string) bool {
	e := h.captcha.Consume(c.Request.Context(), h.captchaIP(c), purpose, strings.TrimSpace(subject), token)
	if e != nil {
		captchaError(c, e)
		return false
	}
	return true
}
func (h *AuthHandler) loginIsFamiliar(c *gin.Context, identity string) (bool, error) {
	var u model.User
	found, e := db.Engine.Where("username = ?", identity).Cols("id", "password_hash").Get(&u)
	if e != nil {
		return false, e
	}
	if !found {
		found, e = db.Engine.Where("email = ?", identity).Cols("id", "password_hash").Get(&u)
		if e != nil {
			return false, e
		}
	}
	if !found {
		return false, nil
	}
	return h.captcha.Familiar(c.Request.Context(), h.captchaIP(c), strconv.FormatInt(u.ID, 10), u.PasswordHash)
}
