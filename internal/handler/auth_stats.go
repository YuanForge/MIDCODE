package handler

import (
	"fanapi/internal/db"
	"github.com/gin-gonic/gin"
	"strconv"
)

const consumptionTransactionTypes = "'charge','hold','settle','consume'"

// GET /user/stats — 用户仪表盘统计（最近7天消耗趋势 + 累计/今日积分）
func (h *AuthHandler) GetUserStats(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)

	// 累计消耗积分
	var totalConsumed, todayConsumed int64
	if rows, err := db.Engine.QueryString(`SELECT COALESCE(SUM(CASE
		WHEN type IN (`+consumptionTransactionTypes+`) THEN credits
		WHEN type = 'refund' THEN -credits
		ELSE 0 END), 0) AS total
		FROM billing_transactions WHERE user_id = ?`, userID); err == nil && len(rows) > 0 {
		totalConsumed, _ = strconv.ParseInt(rows[0]["total"], 10, 64)
	}

	// 今日消耗
	if rows, err := db.Engine.QueryString(`SELECT COALESCE(SUM(CASE
		WHEN type IN (`+consumptionTransactionTypes+`) THEN credits
		WHEN type = 'refund' THEN -credits
		ELSE 0 END), 0) AS total
		FROM billing_transactions WHERE user_id = ? AND created_at >= CURRENT_DATE`, userID); err == nil && len(rows) > 0 {
		todayConsumed, _ = strconv.ParseInt(rows[0]["total"], 10, 64)
	}

	// 最近7天每日消耗趋势
	dailyCredits := []gin.H{}
	if rows, err := db.Engine.QueryString(`SELECT TO_CHAR(created_at::date, 'MM-DD') AS day,
		COALESCE(SUM(CASE
		WHEN type IN (`+consumptionTransactionTypes+`) THEN credits
			WHEN type = 'refund' THEN -credits
			ELSE 0 END), 0) AS credits
		FROM billing_transactions
		WHERE user_id = ? AND created_at >= CURRENT_DATE - INTERVAL '6 days'
		GROUP BY created_at::date ORDER BY created_at::date`, userID); err == nil {
		for _, row := range rows {
			v, _ := strconv.ParseInt(row["credits"], 10, 64)
			dailyCredits = append(dailyCredits, gin.H{"day": row["day"], "credits": v})
		}
	}

	// 最近7天每日请求次数（成功/失败）
	dailyRequests := []gin.H{}
	if rows, err := db.Engine.QueryString(`SELECT TO_CHAR(created_at::date, 'MM-DD') AS day,
		COUNT(CASE WHEN status = 'ok' THEN 1 END) AS success,
		COUNT(CASE WHEN status = 'error' THEN 1 END) AS failed
		FROM llm_logs
		WHERE user_id = ? AND created_at >= CURRENT_DATE - INTERVAL '6 days'
		GROUP BY created_at::date ORDER BY created_at::date`, userID); err == nil {
		for _, row := range rows {
			s, _ := strconv.ParseInt(row["success"], 10, 64)
			f, _ := strconv.ParseInt(row["failed"], 10, 64)
			dailyRequests = append(dailyRequests, gin.H{"day": row["day"], "success": s, "failed": f})
		}
	}

	c.JSON(200, gin.H{
		"total_consumed": totalConsumed,
		"today_consumed": todayConsumed,
		"daily_credits":  dailyCredits,
		"daily_requests": dailyRequests,
	})
}
