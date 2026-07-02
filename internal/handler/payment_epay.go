package handler

import (
	"context"
	"crypto/md5"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"
	"fmt"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type epayCreateReq struct {
	Amount  float64 `json:"amount" binding:"required,min=0.01"` // 充值金额（元），最低 0.01
	Type    string  `json:"type"`                               // alipay / wxpay
	PayType string  `json:"pay_type"`                           // 兼容旧前端字段
}

// CreateEpayOrder creates a payment order and returns the payment redirect URL.
// POST /pay/epay/create  （需要 JWT 认证）
func CreateEpayOrder(c *gin.Context) {
	var req epayCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	payType := strings.TrimSpace(req.Type)
	if payType == "" {
		payType = strings.TrimSpace(req.PayType)
	}
	switch payType {
	case "wechat", "wxpay":
		payType = "wxpay"
	case "alipay":
		payType = "alipay"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "支付类型无效，仅支持 alipay 或 wxpay"})
		return
	}

	epayURL := getSettingValue("epay_url")
	epayPid := getSettingValue("epay_pid")
	epayKey := getSettingValue("epay_key")
	notifyURL := getSettingValue("epay_notify_url")
	returnURL := getSettingValue("epay_return_url")
	siteName := getSettingValue("site_name")
	if siteName == "" {
		siteName = "FanAPI"
	}

	if epayURL == "" || epayPid == "" || epayKey == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "支付功能未配置，请联系管理员"})
		return
	}

	userID := c.MustGet("user_id").(int64)
	outTradeNo := fmt.Sprintf("FAN%d%d", userID, time.Now().UnixMilli())
	credits := planCredits(req.Amount)
	moneyStr := fmt.Sprintf("%.2f", req.Amount)

	// 写入待支付订单
	order := &model.PaymentOrder{
		UserID:     userID,
		OutTradeNo: outTradeNo,
		Amount:     req.Amount,
		Credits:    credits,
		Status:     "pending",
		PayChannel: "epay",
	}
	if _, err := db.Engine.Insert(order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建订单失败: " + err.Error()})
		return
	}

	params := map[string]string{
		"pid":          epayPid,
		"type":         payType,
		"notify_url":   notifyURL,
		"return_url":   returnURL,
		"name":         siteName + " 余额充值",
		"money":        moneyStr,
		"out_trade_no": outTradeNo,
	}
	params["sign"] = epaySign(params, epayKey)
	params["sign_type"] = "MD5"

	payURL := strings.TrimRight(epayURL, "/") + "/submit.php?" + epayBuildQuery(params)
	c.JSON(http.StatusOK, gin.H{
		"pay_url":      payURL,
		"out_trade_no": outTradeNo,
		"amount":       req.Amount,
		"credits":      credits,
	})
}

// EpayCallback handles asynchronous payment notifications from Epay.
// GET /pay/epay/callback  （Epay 回调，无需用户认证）
func EpayCallback(c *gin.Context) {
	params := make(map[string]string)
	for k, vs := range c.Request.URL.Query() {
		if len(vs) > 0 {
			params[k] = vs[0]
		}
	}

	epayKey := getSettingValue("epay_key")

	// 验证签名
	receivedSign := params["sign"]
	delete(params, "sign")
	delete(params, "sign_type")
	if epaySign(params, epayKey) != receivedSign {
		c.String(http.StatusOK, "fail")
		return
	}

	if params["trade_status"] != "TRADE_SUCCESS" {
		c.String(http.StatusOK, "success") // 非成功状态忽略，不重试
		return
	}

	outTradeNo := params["out_trade_no"]
	tradeNo := params["trade_no"]

	// 幂等：查找订单
	order := &model.PaymentOrder{}
	found, err := db.Engine.Where("out_trade_no = ?", outTradeNo).Get(order)
	if err != nil || !found {
		c.String(http.StatusOK, "fail")
		return
	}
	if order.Status == "paid" {
		c.String(http.StatusOK, "success") // 已处理，幂等返回
		return
	}

	// 原子更新订单状态：仅当 status='pending' 时才成功，防止并发回调双重充値
	now := time.Now()
	order.Status = "paid"
	order.TradeNo = tradeNo
	order.PaidAt = &now
	affected, err := db.Engine.ID(order.ID).Where("status = 'pending'").Cols("status", "trade_no", "paid_at").Update(order)
	if err != nil {
		c.String(http.StatusOK, "fail")
		return
	}
	if affected == 0 {
		c.String(http.StatusOK, "success") // 并发处理，已完成，幂等返回
		return
	}

	// 给用户充值
	ctx := context.Background()
	if err := service.Recharge(ctx, order.UserID, 0, order.Credits); err != nil {
		c.String(http.StatusOK, "fail")
		return
	}

	c.String(http.StatusOK, "success")
}

// GetUserPaymentOrders returns the authenticated user's payment orders (paginated).
// GET /user/payment-orders
func GetUserPaymentOrders(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)

	var page, size int
	if err := c.ShouldBindQuery(&struct {
		Page int `form:"page"`
		Size int `form:"size"`
	}{}); err != nil {
		page, size = 1, 20
	} else {
		page = 1
		size = 20
	}
	if p := c.Query("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	if s := c.Query("size"); s != "" {
		fmt.Sscanf(s, "%d", &size)
	}
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}

	var orders []model.PaymentOrder
	total, err := db.Engine.
		Where("user_id = ?", userID).
		OrderBy("created_at DESC").
		Limit(size, (page-1)*size).
		FindAndCount(&orders)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"orders": orders,
		"total":  total,
	})
}

// epaySign generates the MD5 signature for Epay parameters.
func epaySign(params map[string]string, key string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		v := params[k]
		if v == "" {
			continue
		}
		parts = append(parts, k+"="+v)
	}

	raw := strings.Join(parts, "&") + key
	sum := md5.Sum([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

// epayBuildQuery assembles a URL query string preserving original param values.
func epayBuildQuery(params map[string]string) string {
	v := url.Values{}
	for k, val := range params {
		v.Set(k, val)
	}
	return v.Encode()
}

// ─── 中台支付（PayApply）接口 ───────────────────────────────────────────────
