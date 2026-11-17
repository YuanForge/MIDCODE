package handler

import (
	"context"
	"database/sql"
	"errors"
	"fanapi/internal/db"
	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"regexp"
	"strings"
	"time"
)

const qqAllowedGroup = "767281836"

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
	var verified bool
	var expires sql.NullTime
	err := db.Engine.DB().QueryRowContext(c.Request.Context(), `SELECT qq,verified_at IS NOT NULL,CASE WHEN verified_at IS NULL THEN updated_at + interval '15 minutes' END FROM user_qq_bindings WHERE user_id=$1`, c.GetInt64("user_id")).Scan(&qq, &verified, &expires)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		c.JSON(503, gin.H{"error": "QQ绑定读取失败"})
		return
	}
	c.JSON(200, gin.H{"qq": qq, "verified": verified, "group_id": qqAllowedGroup, "expires_at": expires.Time, "status": qqBindingStatus(qq, verified, expires.Time, time.Now())})
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
	tx, err := db.Engine.DB().BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.JSON(503, gin.H{"error": "提交失败"})
		return
	}
	defer tx.Rollback()
	// Expired pending claims cannot permanently reserve someone else's QQ.
	_, err = tx.ExecContext(c.Request.Context(), `DELETE FROM user_qq_bindings WHERE qq=$1 AND verified_at IS NULL AND updated_at < now()-interval '15 minutes'`, req.QQ)
	var verified bool
	if err == nil {
		err = tx.QueryRowContext(c.Request.Context(), `INSERT INTO user_qq_bindings(user_id,qq) VALUES($1,$2)
 ON CONFLICT(user_id) DO UPDATE SET qq=EXCLUDED.qq,updated_at=now(),
 verified_at=CASE WHEN user_qq_bindings.qq=EXCLUDED.qq THEN user_qq_bindings.verified_at ELSE NULL END,
 verified_group_id=CASE WHEN user_qq_bindings.qq=EXCLUDED.qq THEN user_qq_bindings.verified_group_id ELSE NULL END
 RETURNING verified_at IS NOT NULL`, c.GetInt64("user_id"), req.QQ).Scan(&verified)
	}
	if err == nil {
		err = tx.Commit()
	}

	var pg *pq.Error
	if errors.As(err, &pg) && pg.Code == "23505" {
		c.JSON(409, gin.H{"error": "该QQ已被其他账号绑定"})
		return
	}
	if err != nil {
		c.JSON(503, gin.H{"error": "QQ绑定失败，请稍后重试"})
		return
	}
	c.JSON(200, gin.H{"qq": req.QQ, "verified": verified, "group_id": qqAllowedGroup, "message": "申请已保存，请在指定群@机器人 绑定"})
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

func qqBindingStatus(qq string, verified bool, expires, now time.Time) string {
	if qq == "" {
		return "unbound"
	}
	if verified {
		return "bound"
	}
	if !now.Before(expires) {
		return "expired"
	}
	return "pending"
}

// The trusted bot must obtain QQ/group from the actual event, never message text.
func ConfirmQQBinding(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	if !authorizeBot(c, ctx) {
		return
	}
	var req struct {
		QQ string `json:"qq"`
	}
	if c.ShouldBindJSON(&req) != nil || !validQQ(req.QQ) {
		c.JSON(400, gin.H{"error": "QQ号码格式错误"})
		return
	}

	var uid int64
	err := db.Engine.DB().QueryRowContext(ctx, `UPDATE user_qq_bindings SET verified_at=COALESCE(verified_at,now()),verified_group_id=$2
 WHERE qq=$1 AND (verified_at IS NOT NULL OR updated_at>=now()-interval '15 minutes') RETURNING user_id`, req.QQ, qqAllowedGroup).Scan(&uid)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(404, gin.H{"error": "没有有效绑定申请，请先到个人中心填写QQ并在15分钟内验证"})
		return
	}
	if err != nil {
		c.JSON(503, gin.H{"error": "绑定确认失败，请重试"})
		return
	}
	c.JSON(200, gin.H{"user_id": uid, "qq": req.QQ, "group_id": qqAllowedGroup, "verified": true, "message": "QQ绑定成功"})
}
