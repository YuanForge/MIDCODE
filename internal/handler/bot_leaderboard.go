package handler

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	"fanapi/internal/db"
	"github.com/gin-gonic/gin"
)

// Match the admin dashboard: net ledger spending on the selected Beijing day.
// Keep the timestamp column unwrapped so the date-range index can be used.
const botDailyLeaderboardQuery = `WITH spending AS (
 SELECT user_id,
 SUM(CASE WHEN type='refund' THEN -credits ELSE credits END) AS consumed
 FROM billing_transactions
 WHERE created_at >= $1 AND created_at < $2
 AND type IN ('charge','hold','settle','refund')
 GROUP BY user_id
 HAVING SUM(CASE WHEN type='refund' THEN -credits ELSE credits END) > 0
), ranked AS (
 SELECT u.id AS user_id, COALESCE(u.username,'') AS username, s.consumed
 FROM spending s JOIN users u ON u.id=s.user_id
 ORDER BY s.consumed DESC, u.id ASC LIMIT 10
)
SELECT r.user_id,r.username,r.consumed,q.qq
FROM ranked r LEFT JOIN user_qq_bindings q ON q.user_id=r.user_id
 AND q.verified_at IS NOT NULL AND q.verified_group_id='767281836'
ORDER BY r.consumed DESC,r.user_id ASC`

func botLeaderboardDay(raw string, now time.Time) (time.Time, time.Time, error) {
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	today := now.In(loc)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, loc)
	if raw == "" {
		return today, today.AddDate(0, 0, 1), nil
	}
	day, err := time.ParseInLocation("2006-01-02", raw, loc)
	if err != nil || day.Format("2006-01-02") != raw || day.Year() < 1 || day.After(today) {
		return time.Time{}, time.Time{}, errors.New("日期须为 YYYY-MM-DD，且不能晚于今天（北京时间）")
	}
	return day, day.AddDate(0, 0, 1), nil
}

type botLeaderboardEntry struct {
	Rank        int     `json:"rank"`
	UserID      int64   `json:"user_id"`
	Username    string  `json:"username"`
	QQ          *string `json:"qq"`
	ConsumedCNY string  `json:"consumed_cny"`
}

func BotDailyLeaderboard(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	if !authorizeBot(c, ctx) {
		return
	}
	now := time.Now()
	start, end, err := botLeaderboardDay(c.Query("date"), now)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rows, err := db.Engine.DB().QueryContext(ctx, botDailyLeaderboardQuery,
		start.Format("2006-01-02 15:04:05"), end.Format("2006-01-02 15:04:05"))
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "排行榜暂不可用，请稍后重试"})
		return
	}
	defer rows.Close()
	items := make([]botLeaderboardEntry, 0, 10)
	for rows.Next() {
		var item botLeaderboardEntry
		var amount int64
		var qq sql.NullString
		if err := rows.Scan(&item.UserID, &item.Username, &amount, &qq); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "排行榜暂不可用，请稍后重试"})
			return
		}
		item.Rank = len(items) + 1
		item.ConsumedCNY = botCNY(amount)
		if qq.Valid {
			item.QQ = &qq.String
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "排行榜暂不可用，请稍后重试"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"date": start.Format("2006-01-02"), "timezone": "Asia/Shanghai", "currency": "CNY",
		"start_at": start, "end_at": end, "as_of": now.UTC(), "is_partial": now.Before(end),
		"limit": 10, "count": len(items), "items": items,
		"accounting_basis": "ledger_created_at_net_spend",
	})
}
