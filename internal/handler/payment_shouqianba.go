package handler

import (
	"bytes"
	"context"
	"crypto"
	"crypto/md5"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"
	"fmt"
	"github.com/gin-gonic/gin"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type shouqianbaCreateReq struct {
	Amount  float64 `json:"amount" binding:"required,min=0.01"`    // 充值金额（元）
	PayFlat int     `json:"pay_flat" binding:"required,oneof=1 2"` // 1=微信 2=支付宝
}

type shouqianbaPrecreateReq struct {
	TerminalSN  string `json:"terminal_sn"`
	ClientSN    string `json:"client_sn"`
	TotalAmount string `json:"total_amount"`
	Payway      string `json:"payway"`
	Subject     string `json:"subject"`
	Operator    string `json:"operator"`
	NotifyURL   string `json:"notify_url,omitempty"`
}

type shouqianbaPrecreateResp struct {
	ResultCode  string `json:"result_code"`
	ErrorMsg    string `json:"error_msg"`
	BizResponse struct {
		ResultCode string `json:"result_code"`
		ErrorMsg   string `json:"error_msg"`
		Data       struct {
			SN            string `json:"sn"`
			ClientSN      string `json:"client_sn"`
			TradeNo       string `json:"trade_no"`
			Status        string `json:"status"`
			OrderStatus   string `json:"order_status"`
			QRCode        string `json:"qr_code"`
			WapPayRequest string `json:"wap_pay_request"`
			TotalAmount   string `json:"total_amount"`
		} `json:"data"`
	} `json:"biz_response"`
}

type shouqianbaNotifyReq struct {
	ClientSN    string `json:"client_sn"`
	TradeNo     string `json:"trade_no"`
	Status      string `json:"status"`
	OrderStatus string `json:"order_status"`
	TotalAmount string `json:"total_amount"`
	Payway      string `json:"payway"`
}

// CreateShouqianbaOrder 创建收钱吧预下单并返回支付地址。
// POST /pay/shouqianba/create （需要 JWT 认证）
func CreateShouqianbaOrder(c *gin.Context) {
	var req shouqianbaCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	apiDomain := strings.TrimSpace(getSettingValue("shouqianba_api_domain"))
	terminalSN := strings.TrimSpace(getSettingValue("shouqianba_terminal_sn"))
	terminalKey := strings.TrimSpace(getSettingValue("shouqianba_terminal_key"))
	notifyURL := strings.TrimSpace(getSettingValue("shouqianba_notify_url"))
	if apiDomain == "" || terminalSN == "" || terminalKey == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "收钱吧支付未配置，请联系管理员"})
		return
	}

	userID := c.MustGet("user_id").(int64)
	outTradeNo := fmt.Sprintf("FSQ%d%d", userID, time.Now().UnixMilli())
	credits := planCredits(req.Amount)
	totalFen := int64(math.Round(req.Amount * 100))

	payway := "3" // 微信
	payChannel := "wechat"
	if req.PayFlat == 2 {
		payway = "2" // 支付宝
		payChannel = "alipay"
	}

	order := &model.PaymentOrder{
		UserID:     userID,
		OutTradeNo: outTradeNo,
		Amount:     req.Amount,
		Credits:    credits,
		Status:     "pending",
		PayFlat:    req.PayFlat,
		PayFrom:    "pc",
		ProName:    "余额充值",
		PayChannel: "shouqianba_" + payChannel,
	}
	if _, err := db.Engine.Insert(order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建订单失败: " + err.Error()})
		return
	}

	payload := shouqianbaPrecreateReq{
		TerminalSN:  terminalSN,
		ClientSN:    outTradeNo,
		TotalAmount: strconv.FormatInt(totalFen, 10),
		Payway:      payway,
		Subject:     "余额充值",
		Operator:    strconv.FormatInt(userID, 10),
		NotifyURL:   notifyURL,
	}
	body, _ := json.Marshal(payload)
	sign := md5.Sum(append(body, []byte(terminalKey)...))
	auth := terminalSN + " " + fmt.Sprintf("%x", sign)

	requestURL := strings.TrimRight(apiDomain, "/") + "/upay/v2/precreate"
	httpReq, _ := http.NewRequest(http.MethodPost, requestURL, bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", auth)

	httpResp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "调用收钱吧失败: " + err.Error()})
		return
	}
	defer httpResp.Body.Close()

	respBody, _ := io.ReadAll(httpResp.Body)
	var ret shouqianbaPrecreateResp
	if err := json.Unmarshal(respBody, &ret); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "收钱吧响应解析失败"})
		return
	}

	payURL := strings.TrimSpace(ret.BizResponse.Data.QRCode)
	if payURL == "" {
		payURL = strings.TrimSpace(ret.BizResponse.Data.WapPayRequest)
	}
	if payURL == "" {
		msg := strings.TrimSpace(ret.BizResponse.ErrorMsg)
		if msg == "" {
			msg = strings.TrimSpace(ret.ErrorMsg)
		}
		if msg == "" {
			msg = "收钱吧未返回支付链接"
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": msg})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"pay_url":      payURL,
		"out_trade_no": outTradeNo,
		"amount":       req.Amount,
		"credits":      credits,
	})
}

// ShouqianbaNotify 收钱吧支付回调（无需用户认证）。
// POST /pay/shouqianba/notify
func ShouqianbaNotify(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		log.Printf("[shouqianba notify] read body failed: %v", err)
		c.String(http.StatusOK, "fail")
		return
	}

	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if auth == "" {
		log.Printf("[shouqianba notify] missing authorization header")
		c.String(http.StatusOK, "fail")
		return
	}
	parts := strings.Fields(auth)
	receivedSign := auth
	if len(parts) > 1 {
		receivedSign = parts[len(parts)-1]
	}

	publicKeyPEM := strings.TrimSpace(getSettingValue("shouqianba_public_key"))
	if publicKeyPEM == "" || !verifyShouqianbaSignature(body, receivedSign, publicKeyPEM) {
		if publicKeyPEM == "" {
			log.Printf("[shouqianba notify] missing setting shouqianba_public_key")
		} else {
			log.Printf("[shouqianba notify] signature verify failed")
		}
		c.String(http.StatusOK, "fail")
		return
	}

	var req shouqianbaNotifyReq
	if err := json.Unmarshal(body, &req); err != nil {
		log.Printf("[shouqianba notify] invalid json body: %v", err)
		c.String(http.StatusOK, "fail")
		return
	}

	if req.OrderStatus != "PAID" {
		log.Printf("[shouqianba notify] ignore non-paid status: client_sn=%s order_status=%s status=%s", req.ClientSN, req.OrderStatus, req.Status)
		c.String(http.StatusOK, "success")
		return
	}

	order := &model.PaymentOrder{}
	found, err := db.Engine.Where("out_trade_no = ?", req.ClientSN).Get(order)
	if err != nil || !found {
		if err != nil {
			log.Printf("[shouqianba notify] query order failed: client_sn=%s err=%v", req.ClientSN, err)
		} else {
			log.Printf("[shouqianba notify] order not found: client_sn=%s", req.ClientSN)
		}
		c.String(http.StatusOK, "fail")
		return
	}
	if order.Status == "paid" {
		log.Printf("[shouqianba notify] already paid: client_sn=%s", req.ClientSN)
		c.String(http.StatusOK, "success")
		return
	}

	paidFen, err := strconv.ParseInt(req.TotalAmount, 10, 64)
	if err != nil || paidFen <= 0 {
		log.Printf("[shouqianba notify] invalid total_amount: client_sn=%s total_amount=%q err=%v", req.ClientSN, req.TotalAmount, err)
		c.String(http.StatusOK, "fail")
		return
	}
	expectedFen := int64(math.Round(order.Amount * 100))
	if paidFen != expectedFen {
		log.Printf("[shouqianba notify] amount mismatch: client_sn=%s expected=%d got=%d", req.ClientSN, expectedFen, paidFen)
		c.String(http.StatusOK, "fail")
		return
	}

	payFlat := order.PayFlat
	payChannel := order.PayChannel
	switch req.Payway {
	case "2":
		payFlat = 2
		payChannel = "shouqianba_alipay"
	case "3":
		payFlat = 1
		payChannel = "shouqianba_wechat"
	}

	now := time.Now()
	update := &model.PaymentOrder{
		Status:     "paid",
		TradeNo:    req.TradeNo,
		PayFlat:    payFlat,
		PayChannel: payChannel,
		PaidAt:     &now,
	}
	affected, err := db.Engine.ID(order.ID).Where("status = 'pending'").Cols("status", "trade_no", "pay_flat", "pay_channel", "paid_at").Update(update)
	if err != nil {
		log.Printf("[shouqianba notify] update order failed: id=%d client_sn=%s err=%v", order.ID, req.ClientSN, err)
		c.String(http.StatusOK, "fail")
		return
	}
	if affected == 0 {
		log.Printf("[shouqianba notify] idempotent race handled: id=%d client_sn=%s", order.ID, req.ClientSN)
		c.String(http.StatusOK, "success")
		return
	}

	rechargeCtx := context.Background()
	if err := service.Recharge(rechargeCtx, order.UserID, 0, order.Credits); err != nil {
		log.Printf("[shouqianba notify] recharge failed: order_id=%d user_id=%d err=%v", order.ID, order.UserID, err)
		c.String(http.StatusOK, "fail")
		return
	}

	log.Printf("[shouqianba notify] success: order_id=%d client_sn=%s user_id=%d payway=%s", order.ID, req.ClientSN, order.UserID, req.Payway)
	c.String(http.StatusOK, "success")
}

func verifyShouqianbaSignature(body []byte, signatureBase64 string, publicKeyPEM string) bool {
	block, _ := pem.Decode([]byte(publicKeyPEM))
	if block == nil {
		return false
	}

	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		cert, certErr := x509.ParseCertificate(block.Bytes)
		if certErr != nil {
			return false
		}
		parsed = cert.PublicKey
	}

	pub, ok := parsed.(*rsa.PublicKey)
	if !ok {
		return false
	}

	sig, err := base64.StdEncoding.DecodeString(signatureBase64)
	if err != nil {
		return false
	}

	hash := sha256.Sum256(body)
	return rsa.VerifyPKCS1v15(pub, crypto.SHA256, hash[:], sig) == nil
}
