package handler

import (
	"fanapi/internal/db"
	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
	"time"
)

// GET /admin/transactions — 全局账单流水（分页）
func ListAllTransactions(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}
	startAt, err := parseDateTime(c.Query("start_at"), false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "start_at 时间格式错误"})
		return
	}
	endAt, err := parseDateTime(c.Query("end_at"), true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end_at 时间格式错误"})
		return
	}

	var txs []model.BillingTransaction
	query := db.Engine.Desc("id")
	if !startAt.IsZero() {
		query = query.Where("created_at >= ?", startAt)
	}
	if !endAt.IsZero() {
		query = query.And("created_at <= ?", endAt)
	}
	if txType := c.Query("type"); txType != "" {
		query = query.And("type = ?", txType)
	}
	if userID := c.Query("user_id"); userID != "" {
		query = query.And("user_id = ?", userID)
	}
	if apiKeyID := c.Query("api_key_id"); apiKeyID != "" {
		query = query.And("api_key_id = ?", apiKeyID)
	}
	total, err := query.Limit(size, (page-1)*size).FindAndCount(&txs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type summaryRow struct {
		Revenue int64 `xorm:"'revenue'"`
		Cost    int64 `xorm:"'cost'"`
		Profit  int64 `xorm:"'profit'"`
		Count   int64 `xorm:"'count'"`
	}
	where := "WHERE 1=1"
	args := make([]interface{}, 0, 4)
	if !startAt.IsZero() {
		where += " AND created_at >= ?"
		args = append(args, startAt)
	}
	if !endAt.IsZero() {
		where += " AND created_at <= ?"
		args = append(args, endAt)
	}
	if txType := c.Query("type"); txType != "" {
		where += " AND type = ?"
		args = append(args, txType)
	}
	if userID := c.Query("user_id"); userID != "" {
		where += " AND user_id = ?"
		args = append(args, userID)
	}
	if apiKeyID := c.Query("api_key_id"); apiKeyID != "" {
		where += " AND api_key_id = ?"
		args = append(args, apiKeyID)
	}
	summary := summaryRow{}
	sql := `SELECT
		COALESCE(SUM(CASE
			WHEN type IN ('charge','settle','hold') THEN credits
			WHEN type = 'refund' THEN -credits
			ELSE 0 END), 0) AS revenue,
		COALESCE(SUM(CASE
			WHEN type IN ('charge','settle','hold') THEN cost
			WHEN type = 'refund' THEN -cost
			ELSE 0 END), 0) AS cost,
		COALESCE(SUM(CASE
			WHEN type IN ('charge','settle','hold') THEN credits - cost
			WHEN type = 'refund' THEN -(credits - cost)
			ELSE 0 END), 0) AS profit,
		COUNT(*) AS count
	FROM billing_transactions ` + where
	if _, err := db.Engine.SQL(sql, args...).Get(&summary); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type transactionView struct {
		ID           int64      `json:"id"`
		UserID       int64      `json:"user_id"`
		ChannelID    int64      `json:"channel_id"`
		APIKeyID     int64      `json:"api_key_id"`
		PoolKeyID    int64      `json:"pool_key_id"`
		CorrID       string     `json:"corr_id"`
		Type         string     `json:"type"`
		Amount       float64    `json:"amount"`
		Cost         float64    `json:"cost"`
		Profit       float64    `json:"profit"`
		BalanceAfter int64      `json:"balance_after"`
		Metrics      model.JSON `json:"metrics"`
		CreatedAt    time.Time  `json:"created_at"`
	}

	views := make([]transactionView, len(txs))
	for i, tx := range txs {
		profitCredits := int64(0)
		switch tx.Type {
		case "refund":
			profitCredits = -(tx.Credits - tx.Cost)
		case "charge", "settle", "hold":
			profitCredits = tx.Credits - tx.Cost
		}

		views[i] = transactionView{
			ID:           tx.ID,
			UserID:       tx.UserID,
			ChannelID:    tx.ChannelID,
			APIKeyID:     tx.APIKeyID,
			PoolKeyID:    tx.PoolKeyID,
			CorrID:       tx.CorrID,
			Type:         tx.Type,
			Amount:       creditsToCNY(tx.Credits),
			Cost:         creditsToCNY(tx.Cost),
			Profit:       creditsToCNY(profitCredits),
			BalanceAfter: tx.BalanceAfter,
			Metrics:      tx.Metrics,
			CreatedAt:    tx.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"transactions": views,
		"total":        total,
		"summary": gin.H{
			"revenue":           creditsToCNY(summary.Revenue),
			"cost":              creditsToCNY(summary.Cost),
			"profit":            creditsToCNY(summary.Profit),
			"transaction_count": summary.Count,
		},
	})
}
