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
	rows, err := db.Engine.QueryString(`SELECT to_char(day,'MM-DD') AS day, credits AS total,
        CASE WHEN day=?::date THEN credits ELSE 0 END AS today, 0 AS is_total
        FROM dashboard_credit_daily WHERE user_id=? AND day>=?::date AND day<?::date
        UNION ALL SELECT '',coalesce(sum(credits),0),coalesce(sum(credits) FILTER(WHERE day=?::date),0),1
        FROM dashboard_credit_daily WHERE user_id=?`, todayStart.Format("2006-01-02"), userID, weekStart.Format("2006-01-02"), todayEnd.Format("2006-01-02"), todayStart.Format("2006-01-02"), userID)
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
	rows, err = db.Engine.QueryString(`WITH dates AS (
 SELECT d::date AS day FROM generate_series(?::date,?::date-1,interval '1 day') d
), spans AS (
 SELECT d.day,CASE WHEN NOT coalesce(s.dirty,true) AND NOT s.unsafe THEN s.covered_until END AS until
 FROM dates d LEFT JOIN usage_rollup_state s ON s.day=d.day AND s.user_id=?
)
SELECT to_char(day,'MM-DD') AS day,sum(success) AS success,sum(failed) AS failed FROM (
 SELECT s.day,u.success,u.failed FROM spans s JOIN usage_daily u ON u.user_id=? AND u.bucket=s.day WHERE s.until IS NOT NULL

 UNION ALL
 SELECT s.day,count(*) FILTER(WHERE l.status='ok'),count(*) FILTER(WHERE l.status='error')
 FROM spans s JOIN llm_logs l ON l.user_id=? AND l.created_at>=coalesce(s.until,s.day::timestamp)
 AND l.created_at<s.day+interval '1 day' GROUP BY s.day
 ) counts GROUP BY day ORDER BY day`, weekStart.Format("2006-01-02"), todayEnd.Format("2006-01-02"), userID, userID, userID)
	if err != nil {
		c.JSON(500, gin.H{"error": "调用统计暂时不可用，请稍后重试"})
		return
	}
	{
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
