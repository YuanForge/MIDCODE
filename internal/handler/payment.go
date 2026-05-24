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
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"

	"github.com/gin-gonic/gin"
)

const creditsPerYuan = 1_000_000 // 1 元 = 1,000,000 credits

// planCredits 根据支付金额查找匹配的充值套餐，返回含赠送积分的总内部 credits。
// 若无匹配套餐，则按标准汇率 amount*creditsPerYuan 计算（自定义金额，无赠送）。
func planCredits(amount float64) int64 {
	raw := getSettingValue("recharge_plans")
	if raw != "" {
		var plans []map[string]interface{}
		if err := json.Unmarshal([]byte(raw), &plans); err == nil {
			for _, p := range plans {
				planAmt, _ := p["amount"].(float64)
				if math.Abs(planAmt-amount) < 0.005 {
					// credits + bonus 均为展示积分（1显示积分 = creditsPerYuan 内部 credits）
					credits, _ := p["credits"].(float64)
					bonus, _ := p["bonus"].(float64)
					return int64((credits + bonus) * creditsPerYuan)
				}
			}
		}
	}
	// 自定义金额：按标准汇率，无赠送
	return int64(amount * creditsPerYuan)
}

// getSettingValue retrieves a single system setting value by key.
func getSettingValue(key string) string {
	s := &model.SystemSetting{}
	found, _ := db.Engine.Where("key = ?", key).Get(s)
	if !found {
		return ""
	}
	return s.Value
}

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

	// 记录 OCPC 订单转化
	service.MarkOcpcOrder(ctx, order.UserID, order.Amount)

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
	payMoneyFen := int64(req.Amount * 100) // 转换为分
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
	ip := c.GetHeader("X-Forwarded-For")
	if idx := strings.Index(ip, ","); idx != -1 {
		ip = ip[:idx]
	}
	ip = strings.TrimSpace(ip)
	if ip == "" {
		ip = c.ClientIP()
	}

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

	service.MarkOcpcOrder(rechargeCtx, order.UserID, order.Amount)
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

	// 校验金额（允许±1分误差应对浮点）
	expectedFen := int64(order.Amount * 100)
	if req.PayMoney != expectedFen {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": fmt.Sprintf("金额不匹配: expected %d, got %d", expectedFen, req.PayMoney)})
		return
	}

	// 更新订单状态
	paidAt := time.Now()
	_, err = db.Engine.ID(order.ID).Cols("status", "trade_no", "pay_flat", "paid_at").Update(&model.PaymentOrder{
		Status:  "paid",
		TradeNo: req.AlipayNo,
		PayFlat: req.PayFlat,
		PaidAt:  &paidAt,
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "更新订单失败: " + err.Error()})
		return
	}

	// 给用户充值
	rechargeCtx := context.Background()
	if err := service.Recharge(rechargeCtx, order.UserID, 0, order.Credits); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "msg": "充值失败: " + err.Error()})
		return
	}

	// 记录 OCPC 订单转化
	service.MarkOcpcOrder(rechargeCtx, order.UserID, order.Amount)

	c.JSON(http.StatusOK, gin.H{"status": true, "msg": "处理成功"})
}

// GetPaymentOrderStatus 查询单笔订单支付状态（仅订单所有者可访问）。
// GET /pay/order/status?out_trade_no=xxx
func GetPaymentOrderStatus(c *gin.Context) {
	outTradeNo := c.Query("out_trade_no")
	if outTradeNo == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 out_trade_no 参数"})
		return
	}
	userID := c.MustGet("user_id").(int64)

	order := &model.PaymentOrder{}
	found, err := db.Engine.Where("out_trade_no = ? AND user_id = ?", outTradeNo, userID).Get(order)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询订单失败"})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "订单不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": order.Status})
}

// ValidateCoupon 验证优惠券并返回折扣信息。
// GET /user/coupons/validate?code=xxx&amount=xxx
func ValidateCoupon(c *gin.Context) {
	code := strings.TrimSpace(c.Query("code"))
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入优惠券码"})
		return
	}
	var amountYuan float64
	fmt.Sscanf(c.DefaultQuery("amount", "0"), "%f", &amountYuan)

	userID := c.MustGet("user_id").(int64)

	now := time.Now()
	var cp model.Coupon
	found, err := db.Engine.Where("code = ?", code).Get(&cp)
	if err != nil || !found {
		c.JSON(http.StatusBadRequest, gin.H{"error": "优惠券不存在"})
		return
	}
	if cp.ValidFrom != nil && now.Before(*cp.ValidFrom) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "优惠券尚未生效"})
		return
	}
	if cp.ValidUntil != nil && now.After(*cp.ValidUntil) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "优惠券已过期"})
		return
	}
	if cp.TotalCount > 0 && cp.UsedCount >= cp.TotalCount {
		c.JSON(http.StatusBadRequest, gin.H{"error": "优惠券已达使用上限"})
		return
	}
	// 检查每人使用次数
	if cp.PerUserLimit > 0 {
		cnt, _ := db.Engine.Where("coupon_id=? AND user_id=?", cp.ID, userID).Count(&model.CouponUse{})
		if int(cnt) >= cp.PerUserLimit {
			c.JSON(http.StatusBadRequest, gin.H{"error": "您已达到该优惠券使用次数上限"})
			return
		}
	}
	// 最低消费检查（单位：分 → 元）
	minAmountYuan := float64(cp.MinAmount) / 100.0
	if amountYuan > 0 && minAmountYuan > 0 && amountYuan < minAmountYuan {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("该优惠券最低消费 ¥%.2f", minAmountYuan),
		})
		return
	}

	// 计算折扣（percent: discount_value 为折扣比例的百分比×100存储，如 500=5%；fixed: 分为单位）
	var discountYuan float64
	if cp.DiscountType == "percent" {
		discountYuan = amountYuan * float64(cp.DiscountValue) / 10000.0
	} else {
		discountYuan = float64(cp.DiscountValue) / 100.0
	}
	if cp.MaxDiscount > 0 {
		maxYuan := float64(cp.MaxDiscount) / 100.0
		if discountYuan > maxYuan {
			discountYuan = maxYuan
		}
	}
	if discountYuan < 0 {
		discountYuan = 0
	}
	finalAmount := amountYuan - discountYuan
	if finalAmount < 0.01 {
		finalAmount = 0.01
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":          true,
		"coupon_id":      cp.ID,
		"discount_yuan":  math.Round(discountYuan*100) / 100,
		"final_amount":   math.Round(finalAmount*100) / 100,
		"discount_type":  cp.DiscountType,
		"discount_value": cp.DiscountValue,
	})
}
