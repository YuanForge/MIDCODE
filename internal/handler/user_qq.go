package handler

import (
	"database/sql"
	"errors"
	"fanapi/internal/db"
	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"regexp"
	"strings"
)

var qqNumberPattern = regexp.MustCompile(`^[1-9][0-9]{4,19}$`)

func validQQ(s string) bool { return qqNumberPattern.MatchString(s) }
func qqSession(c *gin.Context) bool {
	if c.GetString("auth_type") != "jwt" {
		c.JSON(403, gin.H{"error": "请登录用户页面后操作"})
		return false
	}
	c.Header("Cache-Control", "no-store")
	return true
}
func GetQQBinding(c *gin.Context) {
	if !qqSession(c) {
		return
	}
	var qq string
	err := db.Engine.DB().QueryRowContext(c.Request.Context(), `SELECT qq FROM user_qq_bindings WHERE user_id=$1`, c.GetInt64("user_id")).Scan(&qq)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		c.JSON(503, gin.H{"error": "QQ绑定读取失败"})
		return
	}
	c.JSON(200, gin.H{"qq": qq, "verified": false})
}
func SaveQQBinding(c *gin.Context) {
	if !qqSession(c) {
		return
	}
	var req struct {
		QQ string `json:"qq"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"error": "请输入QQ号码"})
		return
	}
	req.QQ = strings.TrimSpace(req.QQ)
	if !validQQ(req.QQ) {
		c.JSON(400, gin.H{"error": "QQ号码须为5至20位数字，且不能以0开头"})
		return
	}
	_, err := db.Engine.DB().ExecContext(c.Request.Context(), `INSERT INTO user_qq_bindings(user_id,qq) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET qq=EXCLUDED.qq,updated_at=now()`, c.GetInt64("user_id"), req.QQ)
	var pg *pq.Error
	if errors.As(err, &pg) && pg.Code == "23505" {
		c.JSON(409, gin.H{"error": "该QQ已被其他账号绑定"})
		return
	}
	if err != nil {
		c.JSON(503, gin.H{"error": "QQ绑定失败，请稍后重试"})
		return
	}
	c.JSON(200, gin.H{"qq": req.QQ, "verified": false, "message": "QQ绑定已保存"})
}
func DeleteQQBinding(c *gin.Context) {
	if !qqSession(c) {
		return
	}
	if _, err := db.Engine.DB().ExecContext(c.Request.Context(), `DELETE FROM user_qq_bindings WHERE user_id=$1`, c.GetInt64("user_id")); err != nil {
		c.JSON(503, gin.H{"error": "解绑失败，请稍后重试"})
		return
	}
	c.Status(204)
}
