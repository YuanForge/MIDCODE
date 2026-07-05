package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"
	"fmt"
	"github.com/gin-gonic/gin"
	"io"
	"math"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

type payApplyCreateReq struct {
	Amount  float64 `json:"amount" binding:"required,min=0.01"`    // 充值金额（元）
	PayFlat int     `json:"pay_flat" binding:"required,oneof=1 2"` // 1=微信 2=支付宝
	PayFrom string  `json:"pay_from"`                              // 支付终端：pc / wap / wapwx 等
	ProName string  `json:"pro_name"`                              // 商品名称（可选，默认"余额充值"）
}

// CreatePayApplyOrder 创建中台支付订单并返回支付链接。
// POST /pay/apply/create （需要 JWT 认证）
func CreatePayApplyOrder(c *gin.Context) {
	var req payApplyCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	applyURLRoot := getSettingValue("pay_apply_urlroot")
	applyKey := getSettingValue("pay_apply_key")
	if applyURLRoot == "" || applyKey == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "支付功能未配置，请联系管理员"})
		return
	}

	proName := req.ProName
	if proName == "" {
		proName = "余额充值"
	}

	userID := c.MustGet("user_id").(int64)

	// 生成本系统订单号（对齐 Python：时间戳 + 4位随机）
	tradeNo := fmt.Sprintf("FAN%s%04d",
		time.Now().Format("20060102150405"),
		rand.Intn(10000),
	)
	payMoneyFen := int64(math.Round(req.Amount * 100)) // 转换为分
	credits := planCredits(req.Amount)

	// 今日0点时间戳（幂等去重：同用户同金额同产品已有 pending 订单则复用）
	now := time.Now()
	zeroTime := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	existOrder := &model.PaymentOrder{}
	found, _ := db.Engine.
		Where("user_id = ? AND amount = ? AND pro_name = ? AND pay_flat = ? AND status = 'pending' AND created_at >= ?",
			userID, req.Amount, proName, req.PayFlat, zeroTime).
		Get(existOrder)

	var outTradeNo string
	var orderID int64
	if found {
		outTradeNo = existOrder.OutTradeNo
		orderID = existOrder.ID
		// 更新 pay_from
		db.Engine.ID(orderID).Cols("pay_from").Update(&model.PaymentOrder{PayFrom: req.PayFrom}) //nolint
	} else {
		payChannel := "wechat"
		if req.PayFlat == 2 {
			payChannel = "alipay"
		}
		order := &model.PaymentOrder{
			UserID:     userID,
			OutTradeNo: tradeNo,
			Amount:     req.Amount,
			Credits:    credits,
			Status:     "pending",
			PayFlat:    req.PayFlat,
			PayFrom:    req.PayFrom,
			ProName:    proName,
			PayChannel: payChannel,
		}
		if _, err := db.Engine.Insert(order); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "创建订单失败: " + err.Error()})
			return
		}
		outTradeNo = tradeNo
		orderID = order.ID
	}

	// 获取客户端 IP
	ip := c.ClientIP()

	// 调用中台获取支付链接
	applyURL := strings.TrimRight(applyURLRoot, "/") + "/api/pay/apply/"
	payload := map[string]interface{}{
		"pro_key":     applyKey,
		"trade_no":    outTradeNo,
		"pro_name":    proName,
		"pay_money":   payMoneyFen,
		"pay_flat":    req.PayFlat,
		"pro_user_id": userID,
		"ip":          ip,
		"pay_from":    req.PayFrom,
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(applyURL, "application/json", bytes.NewReader(body)) //nolint
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "调用支付中台失败: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var ret map[string]interface{}
	if err := json.Unmarshal(respBody, &ret); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "支付中台响应解析失败"})
		return
	}

	payURL := ""
	if data, ok := ret["data"].(map[string]interface{}); ok {
		payURL, _ = data["pay_url"].(string)
	}

	c.JSON(http.StatusOK, gin.H{
		"pay_url":      payURL,
		"out_trade_no": outTradeNo,
		"order_id":     orderID,
		"amount":       req.Amount,
		"credits":      credits,
	})
}

type payApplyNotifyReq struct {
	ProKey   string `json:"pro_key"`
	TradeNo  string `json:"trade_no"`
	AlipayNo string `json:"alipay_no"` // 三方平台流水号
	PayMoney int64  `json:"pay_money"` // 支付金额（分）
	PayFlat  int    `json:"pay_flat"`  // 1=微信 2=支付宝
	UserID   int64  `json:"user_id"`
}

// PayApplyNotify 中台支付回调接口（中台异步通知，无需用户认证）。
// POST /pay/apply/notify
func PayApplyNotify(c *gin.Context) {
	var req payApplyNotifyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "参数解析失败"})
		return
	}

	if req.ProKey == "" {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "请填写商品key"})
		return
	}
	if req.TradeNo == "" {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "请填写订单号"})
		return
	}
	if req.AlipayNo == "" {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "请填写三方订单号"})
		return
	}
	if req.PayMoney <= 0 {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "请填写支付金额"})
		return
	}
	if req.PayFlat <= 0 {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "请填写支付平台"})
		return
	}

	// 校验 pro_key
	applyKey := getSettingValue("pay_apply_key")
	if req.ProKey != applyKey {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "商品key无效"})
		return
	}

	// 查找订单
	order := &model.PaymentOrder{}
	found, err := db.Engine.Where("out_trade_no = ?", req.TradeNo).Get(order)
	if err != nil || !found {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "订单不存在"})
		return
	}

	// 幂等：已处理则直接返回成功
	if order.Status == "paid" {
		c.JSON(http.StatusOK, gin.H{"status": true, "msg": "已处理"})
		return
	}

	expectedFen := int64(math.Round(order.Amount * 100))
	if req.PayMoney != expectedFen {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": fmt.Sprintf("金额不匹配: expected %d, got %d", expectedFen, req.PayMoney)})
		return
	}

	paidAt := time.Now()
	rechargeCtx := context.Background()
	settled, err := service.SettlePaymentOrderRecharge(rechargeCtx, order, req.AlipayNo, req.PayFlat, "", paidAt)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "处理订单失败: " + err.Error()})
		return
	}
	if !settled {
		c.JSON(http.StatusOK, gin.H{"status": true, "msg": "已处理"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": true, "msg": "处理成功"})
}
