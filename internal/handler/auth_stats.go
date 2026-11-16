package handler

import (
	"fanapi/internal/db"
	"github.com/gin-gonic/gin"
	"strconv"
	"time"
)

const consumptionTransactionTypes = "'charge','hold','settle'"

// GET /user/stats — 用户仪表盘统计（最近7天消耗趋势 + 累计/今日积分）
func (h *AuthHandler) GetUserStats(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)
	todayStart, todayEnd := shanghaiDayRange(time.Now())
	weekStart := todayStart.AddDate(0, 0, -6)

	// Aggregate request-attributed history once for total, today and seven-day trend.
	var totalConsumed, todayConsumed int64
	dailyCredits := []gin.H{}
	rows, err := db.Engine.QueryString(`WITH grouped AS (
 SELECT COALESCE(corr_id, 'tx:' || id::text) AS request_key,
 COALESCE(MIN(created_at) FILTER (WHERE type IN (`+consumptionTransactionTypes+`)), MIN(created_at)) AS usage_at,
 COALESCE(SUM(CASE WHEN type IN (`+consumptionTransactionTypes+`) THEN credits WHEN type = 'refund' THEN -credits ELSE 0 END),0) AS credits
 FROM billing_transactions WHERE user_id = ? GROUP BY COALESCE(corr_id, 'tx:' || id::text)
 ) SELECT CASE WHEN GROUPING(TO_CHAR(usage_at AT TIME ZONE 'Asia/Shanghai', 'MM-DD')) = 1 THEN COALESCE(SUM(credits),0) ELSE COALESCE(SUM(credits) FILTER (WHERE usage_at >= ? AND usage_at < ?),0) END AS total,
 COALESCE(SUM(credits) FILTER (WHERE usage_at >= ? AND usage_at < ?),0) AS today,
 TO_CHAR(usage_at AT TIME ZONE 'Asia/Shanghai', 'MM-DD') AS day,
 DATE_TRUNC('day', usage_at AT TIME ZONE 'Asia/Shanghai') AS day_order,
 GROUPING(TO_CHAR(usage_at AT TIME ZONE 'Asia/Shanghai', 'MM-DD')) AS is_total
 FROM grouped
 GROUP BY GROUPING SETS ((), (TO_CHAR(usage_at AT TIME ZONE 'Asia/Shanghai', 'MM-DD'), DATE_TRUNC('day', usage_at AT TIME ZONE 'Asia/Shanghai')))
 HAVING GROUPING(TO_CHAR(usage_at AT TIME ZONE 'Asia/Shanghai', 'MM-DD')) = 1
 OR BOOL_OR(usage_at >= ? AND usage_at < ?)
 ORDER BY day_order`, userID, weekStart, todayEnd, todayStart, todayEnd, weekStart, todayEnd)
	if err != nil {
		c.JSON(500, gin.H{"error": "统计暂时不可用，请稍后重试"})
		return
	}
	for _, row := range rows {
		v, _ := strconv.ParseInt(row["total"], 10, 64)
		if row["is_total"] == "1" {
			totalConsumed = v
			todayConsumed, _ = strconv.ParseInt(row["today"], 10, 64)
		} else {
			dailyCredits = append(dailyCredits, gin.H{"day": row["day"], "credits": v})
		}
	}

	// 最近7天每日请求次数（成功/失败）
	dailyRequests := []gin.H{}
	if rows, err := db.Engine.QueryString(`SELECT TO_CHAR(created_at::date, 'MM-DD') AS day,
		COUNT(CASE WHEN status = 'ok' THEN 1 END) AS success,
		COUNT(CASE WHEN status = 'error' THEN 1 END) AS failed
		FROM llm_logs
		WHERE user_id = ? AND created_at >= ? AND created_at < ?
		GROUP BY created_at::date ORDER BY created_at::date`, userID, weekStart, todayEnd); err == nil {
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
