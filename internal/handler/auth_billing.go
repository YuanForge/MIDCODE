package handler

import (
	"fanapi/internal/service"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
)

// GetBalance 查询余额
// @Summary      查询账户余额
// @Description  返回当前 API Key 对应账户的剩余余额，1 CNY = 1,000,000 credits。
// @Tags         用户
// @Produce      json
// @Security     ApiKeyAuth
// @Success      200  {object}  object{balance_credits=int,balance_cny=number}
// @Router       /user/balance [get]
func (h *AuthHandler) GetBalance(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)
	balance, err := service.GetBalance(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"balance_credits": balance,
		"balance_cny":     float64(balance) / 1_000_000,
	})
}

// GET /user/model-credits — 查询当前用户的专属模型积分列表
func (h *AuthHandler) GetModelCredits(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)
	records, err := service.ListModelCredits(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"model_credits": records})
}

// GET /user/transactions
func (h *AuthHandler) GetTransactions(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)
	page := 1
	size := 20
	if p := c.Query("page"); p != "" {
		if n, err := strconv.Atoi(p); err == nil && n > 0 {
			page = n
		}
	}
	if s := c.Query("size"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 100 {
			size = n
		}
	}
	corrID := c.Query("corr_id")
	taskID := c.Query("task_id")
	apiKeyID, _ := strconv.ParseInt(c.Query("api_key_id"), 10, 64)
	txs, err := service.ListTransactions(c.Request.Context(), userID, page, size, corrID, taskID, apiKeyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	total, _ := service.CountTransactions(c.Request.Context(), userID, corrID, taskID, apiKeyID)
	c.JSON(http.StatusOK, gin.H{"transactions": txs, "total": total})
}
