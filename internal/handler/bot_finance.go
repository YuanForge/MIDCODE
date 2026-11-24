package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fanapi/internal/db"
	"fanapi/internal/service"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Raw bot keys are returned once; only SHA-256 digests are persisted.
func botKeyHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
func botKeyAdmin(c *gin.Context) bool {
	if c.GetString("auth_type") != "jwt" || c.GetInt64("user_id") != 1 {
		c.JSON(403, gin.H{"error": "仅主管理员登录会话可管理机器人密钥"})
		return false
	}
	return true
}
func CreateBotKey(c *gin.Context) {
	if !botKeyAdmin(c) {
		return
	}
	c.Header("Cache-Control", "no-store")
	var req struct {
		Lottery bool   `json:"lottery"`
		Name    string `json:"name" binding:"required,max=64"`
	}
	if c.ShouldBindJSON(&req) != nil || strings.TrimSpace(req.Name) == "" {
		c.JSON(400, gin.H{"error": "请提供密钥名称（最多64字符）"})
		return
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		c.JSON(500, gin.H{"error": "密钥创建失败"})
		return
	}
	raw := "bot_" + hex.EncodeToString(secret)
	var id int64
	err := db.Engine.DB().QueryRowContext(c.Request.Context(), `INSERT INTO bot_api_keys(name,key_hash,created_by,lottery) VALUES($1,$2,$3,$4) RETURNING id`, strings.TrimSpace(req.Name), botKeyHash(raw), c.GetInt64("user_id"), req.Lottery).Scan(&id)
	if err != nil {
		c.JSON(500, gin.H{"error": "密钥创建失败"})
		return
	}
	c.JSON(201, gin.H{"id": id, "name": strings.TrimSpace(req.Name), "key": raw, "scope": "users:financial-summary:read", "lottery": req.Lottery, "note": "密钥仅显示一次，请妥善保存"})
}
func ListBotKeys(c *gin.Context) {
	if !botKeyAdmin(c) {
		return
	}
	c.Header("Cache-Control", "no-store")
	rows, err := db.Engine.QueryString(`SELECT id,name,is_active,created_by,created_at,lottery FROM bot_api_keys ORDER BY id DESC`)
	if err != nil {
		c.JSON(500, gin.H{"error": "密钥列表读取失败"})
		return
	}
	var qq string
	var members pq.StringArray
	if err := db.Engine.DB().QueryRowContext(c.Request.Context(), `SELECT COALESCE((SELECT qq FROM bot_lottery_admins WHERE user_id=$1),''), ARRAY(SELECT qq FROM bot_lottery_admins WHERE user_id=$1 UNION SELECT qq FROM bot_lottery_admin_members WHERE user_id=$1 ORDER BY qq)`, c.GetInt64("user_id")).Scan(&qq, &members); err != nil {
		c.JSON(503, gin.H{"error": "读取抽奖管理员 QQ 失败"})
		return
	}
	c.JSON(200, gin.H{"keys": rows, "lottery_admin_qq": qq, "lottery_admin_qqs": members})
}

func UpdateLotteryAdminMember(c *gin.Context) {
	if !botKeyAdmin(c) {
		return
	}
	qq := c.Param("qq")
	if !validQQ(qq) {
		c.JSON(400, gin.H{"error": "QQ 号格式错误"})
		return
	}
	query := `INSERT INTO bot_lottery_admin_members(user_id,qq) VALUES($1,$2) ON CONFLICT DO NOTHING`
	if c.Request.Method == http.MethodDelete {
		query = `WITH removed AS (DELETE FROM bot_lottery_admins WHERE user_id=$1 AND qq=$2) DELETE FROM bot_lottery_admin_members WHERE user_id=$1 AND qq=$2`
	}
	if _, err := db.Engine.DB().ExecContext(c.Request.Context(), query, c.GetInt64("user_id"), qq); err != nil {
		c.JSON(503, gin.H{"error": "更新抽奖管理员名单失败"})
		return
	}
	c.Status(204)
}

func SetLotteryAdminQQ(c *gin.Context) {
	if !botKeyAdmin(c) {
		return
	}
	var req struct {
		QQ *string `json:"qq"`
	}
	if c.ShouldBindJSON(&req) != nil || req.QQ == nil {
		c.JSON(400, gin.H{"error": "请提供 QQ 号"})
		return
	}
	qq := strings.TrimSpace(*req.QQ)
	if qq != "" && !validQQ(qq) {
		c.JSON(400, gin.H{"error": "QQ 号格式错误"})
		return
	}
	id := c.GetInt64("user_id")
	var err error
	if qq == "" {
		_, err = db.Engine.DB().ExecContext(c.Request.Context(), `DELETE FROM bot_lottery_admins WHERE user_id=$1`, id)
	} else {
		_, err = db.Engine.DB().ExecContext(c.Request.Context(), `INSERT INTO bot_lottery_admins(user_id,qq) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET qq=excluded.qq`, id, qq)
	}
	if err != nil {
		c.JSON(503, gin.H{"error": "保存抽奖管理员 QQ 失败"})
		return
	}
	c.JSON(200, gin.H{"qq": qq})
}
func RevokeBotKey(c *gin.Context) {
	if !botKeyAdmin(c) {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"error": "无效密钥ID"})
		return
	}
	res, err := db.Engine.DB().ExecContext(c.Request.Context(), `UPDATE bot_api_keys SET is_active=false WHERE id=$1`, id)
	if err != nil {
		c.JSON(500, gin.H{"error": "撤销失败"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(404, gin.H{"error": "密钥不存在"})
		return
	}
	c.Status(204)
}
func botDateRange(now time.Time) (time.Time, time.Time, time.Time) {
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	n := now.In(loc)
	end := time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, loc)
	return end.AddDate(0, 0, -7), end.AddDate(0, 0, -1), end
}
func botCNY(n int64) string {
	sign := ""
	if n < 0 {
		sign = "-"
	}
	whole := n / 1000000
	part := n % 1000000
	if whole < 0 {
		whole = -whole
	}
	if part < 0 {
		part = -part
	}
	return fmt.Sprintf("%s%d.%06d", sign, whole, part)
}

const botSpendQuery = `WITH grouped AS (
 SELECT COALESCE(corr_id,'tx:'||id::text) AS request_key,
 COALESCE(MIN(created_at) FILTER(WHERE type IN ('charge','hold','settle')),MIN(created_at)) AS usage_at,
 SUM(CASE WHEN type IN ('charge','hold','settle') THEN credits WHEN type='refund' THEN -credits ELSE 0 END) AS credits
 FROM billing_transactions WHERE user_id=$1 GROUP BY COALESCE(corr_id,'tx:'||id::text)
) SELECT COALESCE(SUM(credits) FILTER(WHERE usage_at >= $2 AND usage_at < $4),0),
 COALESCE(SUM(credits) FILTER(WHERE usage_at >= $3 AND usage_at < $4),0) FROM grouped`

func authorizeBot(c *gin.Context, ctx context.Context) bool {
	return authorizeBotCapability(c, ctx, false)
}

func authorizeBotCapability(c *gin.Context, ctx context.Context, lottery bool) bool {
	c.Header("Cache-Control", "no-store")
	raw := strings.TrimSpace(c.GetHeader("X-API-Key"))
	if raw == "" {
		raw = strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "))
	}
	if !strings.HasPrefix(raw, "bot_") || len(raw) != 68 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "需要有效的机器人专用密钥"})
		return false
	}
	var allowed bool
	err := db.Engine.DB().QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM bot_api_keys k JOIN users u ON u.id=k.created_by WHERE k.key_hash=$1 AND k.is_active AND u.is_active AND u.role='admin' AND (NOT $2 OR k.lottery))`, botKeyHash(raw), lottery).Scan(&allowed)
	if err != nil {
		c.JSON(503, gin.H{"error": "认证服务暂不可用"})
		return false
	}
	if !allowed {
		c.JSON(401, gin.H{"error": "机器人密钥无效或已撤销"})
		return false
	}
	return true
}

func BotUserFinancialSummary(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	if !authorizeBot(c, ctx) {
		return
	}
	var err error
	var userID int64
	if qq := c.Param("qq"); qq != "" {
		if !validQQ(qq) {
			c.JSON(400, gin.H{"error": "QQ号码格式错误"})
			return
		}
		err = db.Engine.DB().QueryRowContext(ctx, `SELECT user_id FROM user_qq_bindings WHERE qq=$1 AND verified_at IS NOT NULL AND verified_group_id='767281836'`, qq).Scan(&userID)
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(404, gin.H{"error": "该QQ尚未绑定账号"})
			return
		}
		if err != nil {
			c.JSON(503, gin.H{"error": "QQ查询暂不可用"})
			return
		}
	} else {
		userID, err = strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil || userID <= 0 {
			c.JSON(400, gin.H{"error": "用户ID必须为正整数"})
			return
		}
	}

	var exists bool
	err = db.Engine.DB().QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1)`, userID).Scan(&exists)
	if err != nil {
		c.JSON(503, gin.H{"error": "查询暂不可用"})
		return
	}
	if !exists {
		c.JSON(404, gin.H{"error": "用户不存在"})
		return
	}
	now := time.Now()
	start, yesterday, end := botDateRange(now)
	wall := func(t time.Time) string { return t.Format("2006-01-02 15:04:05") }
	var week, day int64
	err = db.Engine.DB().QueryRowContext(ctx, botSpendQuery, userID, wall(start), wall(yesterday), wall(end)).Scan(&week, &day)
	if err != nil {
		c.JSON(503, gin.H{"error": "消费统计暂不可用，请稍后重试"})
		return
	}
	balance, err := service.GetBalance(ctx, userID)
	if err != nil {
		c.JSON(503, gin.H{"error": "余额读取失败"})
		return
	}
	c.JSON(200, gin.H{"user_id": userID, "currency": "CNY", "timezone": "Asia/Shanghai", "balance_cny": botCNY(balance), "yesterday": gin.H{"start_at": yesterday, "end_at": end, "consumed_cny": botCNY(day)}, "last_7_days": gin.H{"start_at": start, "end_at": end, "consumed_cny": botCNY(week)}, "as_of": now.UTC()})
}
