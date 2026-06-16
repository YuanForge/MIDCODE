package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"fanapi/internal/billing"
	"fanapi/internal/model"
	"fanapi/internal/script"
	"fanapi/internal/service"
	"fanapi/internal/upstream"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	realtimeDefaultUpstreamURL = "wss://api.openai.com/v1/realtime"
	realtimeOpenAIBetaHeader   = "realtime=v1"
	realtimeMaxLogBytes        = 200 * 1024
)

// RealtimeWSProxy proxies OpenAI Realtime WebSocket traffic.
//
// @Summary      OpenAI Realtime API WebSocket
// @Description  OpenAI Realtime WebSocket compatible proxy. Clients connect with /v1/realtime?model=<routing_model>; events are proxied bidirectionally.
// @Tags         LLM
// @Security     ApiKeyAuth
// @Param        model  query  string  true  "Routing model name"
// @Success      101    {string} string "Switching Protocols"
// @Failure      400    {object} model.APIErrorResponse "Invalid request"
// @Failure      401    {object} model.APIErrorResponse "Unauthorized"
// @Failure      404    {object} model.APIErrorResponse "Channel not found"
// @Router       /v1/realtime [get]
func RealtimeWSProxy(c *gin.Context) {
	userID := c.MustGet("user_id").(int64)
	var apiKeyIDVal int64
	if apiKeyID, ok := c.Get("api_key_id"); ok && apiKeyID != nil {
		apiKeyIDVal, _ = apiKeyID.(int64)
	}
	var userGroup string
	if raw, ok := c.Get("user_group"); ok {
		userGroup, _ = raw.(string)
	}

	routingModel := strings.TrimSpace(c.Query("model"))
	if routingModel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请在 query 参数 model 中填写路由模型名称"})
		return
	}

	ch, err := selectRealtimeChannel(c.Request.Context(), routingModel)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "渠道不存在: " + routingModel})
		return
	}
	if bal, balErr := billing.GetBalance(c.Request.Context(), userID); balErr == nil && bal <= 0 {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "余额不足，请充值后继续使用"})
		return
	}

	resolvedModel := routingModel
	if strings.TrimSpace(ch.Model) != "" {
		resolvedModel = strings.TrimSpace(ch.Model)
	}

	entityID := apiKeyIDVal
	if entityID == 0 {
		entityID = userID
	}
	var poolKey *model.PoolKey
	var poolKeyIDVal int64
	if ch.KeyPoolID > 0 {
		pk, pkErr := service.GetOrAssignPoolKey(c.Request.Context(), ch.KeyPoolID, entityID)
		if pkErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "key pool error: " + pkErr.Error()})
			return
		}
		poolKey = pk
		poolKeyIDVal = pk.ID
	}

	poolKeyVal := ""
	if poolKey != nil {
		poolKeyVal = poolKey.Value
	}

	poolKeyBaseURL := ""
	if poolKey != nil {
		poolKeyBaseURL = poolKey.BaseURLOverride
	}
	targetURL, urlErr := resolveRealtimeUpstreamURL(ch, resolvedModel, poolKeyVal, poolKeyBaseURL)
	if urlErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": urlErr.Error()})
		return
	}
	targetURL, urlErr = applyRealtimeQueryAuth(targetURL, ch, poolKeyVal)
	if urlErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": urlErr.Error()})
		return
	}

	defaultHeaders := http.Header{}
	defaultHeaders.Set("OpenAI-Beta", realtimeOpenAIBetaHeader)
	dialHeader, sentHeaders, headerErr := buildUpstreamWSHeaders(
		c.Request.Header,
		ch,
		poolKeyVal,
		ch.PassthroughHeaders,
		map[string]bool{
			"x-upstream-ws-url":       true,
			"x-upstream-realtime-url": true,
		},
		defaultHeaders,
	)
	if headerErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": headerErr.Error()})
		return
	}

	timeout := time.Duration(ch.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	dialer := websocket.Dialer{HandshakeTimeout: timeout}
	upConn, upstreamResp, dialErr := dialer.DialContext(c.Request.Context(), targetURL, dialHeader)
	if dialErr != nil {
		status := 0
		body := ""
		if upstreamResp != nil {
			status = upstreamResp.StatusCode
			body = upstreamResp.Status
		}
		service.RecordChannelError(c.Request.Context(), ch.ID)
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("上游 realtime 连接失败: %v %s", dialErr, body), "upstream_status": status})
		return
	}
	defer upConn.Close()

	clientConn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[ws-realtime] client upgrade failed: %v", err)
		return
	}
	defer clientConn.Close()

	reqData := map[string]interface{}{"model": routingModel}
	upstreamReq := map[string]interface{}{"model": resolvedModel, "_url": targetURL}
	inputHold, outputHold, calcErr := billing.CalcForUser(ch, reqData, userGroup)
	if calcErr != nil {
		_ = writeWSError(clientConn, "billing_error", calcErr.Error())
		return
	}
	totalHold := inputHold + outputHold
	upstreamCostHold, _ := billing.CalcUpstreamCost(ch, reqData)

	var modelCreditCharged int64
	var generalCreditCharged int64
	if totalHold > 0 {
		modelCreditCharged, _ = billing.ChargeModelCredit(c.Request.Context(), userID, routingModel, totalHold)
		generalCreditCharged = totalHold - modelCreditCharged
		if generalCreditCharged > 0 {
			if chargeErr := billing.Charge(c.Request.Context(), userID, generalCreditCharged); chargeErr != nil {
				if modelCreditCharged > 0 {
					_ = billing.RefundModelCredit(c.Request.Context(), userID, routingModel, modelCreditCharged)
				}
				_ = writeWSError(clientConn, "insufficient_balance", chargeErr.Error())
				return
			}
		}
	}

	c.Set("model_credit_routing_key", routingModel)
	c.Set("model_credit_charged", modelCreditCharged)
	c.Set("model_credit_general_charged", generalCreditCharged)

	corrID := uuid.New().String()
	if totalHold > 0 {
		_ = service.WriteTx(c.Request.Context(), userID, ch.ID, apiKeyIDVal, poolKeyIDVal, corrID, "hold", totalHold, upstreamCostHold, modelCreditCharged, model.JSON{
			"input_hold":  inputHold,
			"output_hold": outputHold,
			"user_group":  userGroup,
			"via":         "realtime_ws",
		})
	}

	inputPricePer1M, outputPricePer1M := resolveTokenPriceMetaValue(ch, userGroup)
	enqueueLLMLogInsert(model.LLMLog{
		UserID:                 userID,
		ChannelID:              ch.ID,
		APIKeyID:               apiKeyIDVal,
		CorrID:                 corrID,
		Model:                  resolvedModel,
		InputPricePer1MTokens:  inputPricePer1M,
		OutputPricePer1MTokens: outputPricePer1M,
		IsStream:               true,
		Transport:              "realtime_ws",
		UpstreamURL:            targetURL,
		UpstreamMethod:         "GET",
		UpstreamHeaders:        model.JSON(toInterfaceMap(sentHeaders)),
		UpstreamRequest:        model.JSON(upstreamReq),
		ClientRequest:          model.JSON(reqData),
		UpstreamStatus:         http.StatusSwitchingProtocols,
		Status:                 "pending",
	})

	session := newRealtimeProxySession()
	err = proxyRealtimeEvents(c.Request.Context(), clientConn, upConn, session)
	if err != nil {
		service.RecordChannelError(c.Request.Context(), ch.ID)
		if totalHold > 0 {
			mcRefunded := llmRefundCredits(c, userID, totalHold)
			_ = service.WriteTx(c.Request.Context(), userID, ch.ID, apiKeyIDVal, poolKeyIDVal, corrID, "refund", totalHold, upstreamCostHold, mcRefunded, model.JSON{"reason": "realtime_ws_error"})
		}
		enqueueLLMLogPatch(corrID, []string{"status", "error_msg", "upstream_response", "client_response"}, model.LLMLog{
			Status:           "error",
			ErrorMsg:         err.Error(),
			UpstreamResponse: session.upstreamLogJSON(),
			ClientResponse:   session.clientLogJSON(),
		})
		return
	}

	service.RecordChannelSuccess(c.Request.Context(), ch.ID)
	usage := session.usageData(reqData)
	enqueueLLMLogPatch(corrID, []string{"upstream_response", "client_response"}, model.LLMLog{
		UpstreamResponse: session.upstreamLogJSON(),
		ClientResponse:   session.clientLogJSON(),
	})
	llmSettle(c, ch, reqData, usage, totalHold, userID, ch.ID, apiKeyIDVal, poolKeyIDVal, corrID, userGroup)
}

func selectRealtimeChannel(ctx context.Context, routingModel string) (*model.Channel, error) {
	if ch, err := service.SelectChannelByProtocol(ctx, routingModel, protocolRealtime); err == nil {
		return ch, nil
	}
	if ch, err := service.SelectChannelByProtocol(ctx, routingModel, protocolOpenAI); err == nil {
		return ch, nil
	}
	ch, err := service.GetChannelByName(ctx, routingModel)
	if err != nil {
		return nil, err
	}
	if proto := effectiveProtocol(ch); proto != protocolRealtime && proto != protocolOpenAI {
		return nil, fmt.Errorf("渠道协议 %s 不支持 realtime", proto)
	}
	return ch, nil
}

func resolveRealtimeUpstreamURL(ch *model.Channel, resolvedModel, poolKeyVal, poolKeyBaseURL string) (string, error) {
	raw := ""
	for k, v := range ch.Headers {
		if !strings.EqualFold(k, "x-upstream-realtime-url") && !strings.EqualFold(k, "x-upstream-ws-url") {
			continue
		}
		if sv, ok := v.(string); ok {
			raw = strings.TrimSpace(sv)
			break
		}
	}
	if raw == "" {
		base := upstream.BaseURLForPoolKey(ch.BaseURL, poolKeyBaseURL)
		raw = strings.TrimSpace(base)
	}
	if raw == "" {
		raw = realtimeDefaultUpstreamURL
	}

	raw = script.ResolveHeaderValue(raw, poolKeyVal)
	if resolvedModel != "" {
		raw = strings.ReplaceAll(raw, "{model}", resolvedModel)
	}
	targetURL := normalizeRealtimeWSURL(raw, resolvedModel)
	parsed, err := url.Parse(targetURL)
	if err != nil {
		return "", err
	}
	if parsed.Scheme != "ws" && parsed.Scheme != "wss" {
		return "", fmt.Errorf("上游 URL 不是 WebSocket: %s", targetURL)
	}
	return parsed.String(), nil
}

func normalizeRealtimeWSURL(raw, resolvedModel string) string {
	raw = strings.TrimSpace(raw)
	lower := strings.ToLower(raw)
	if strings.HasPrefix(lower, "https://") {
		raw = "wss://" + raw[len("https://"):]
	} else if strings.HasPrefix(lower, "http://") {
		raw = "ws://" + raw[len("http://"):]
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	path := strings.TrimRight(parsed.Path, "/")
	switch {
	case path == "":
		parsed.Path = "/v1/realtime"
	case strings.HasSuffix(path, "/v1"):
		parsed.Path = path + "/realtime"
	case strings.HasSuffix(path, "/realtime"):
		parsed.Path = path
	case strings.Contains(path, "/v1/"):
		idx := strings.Index(path, "/v1/")
		parsed.Path = path[:idx+len("/v1")] + "/realtime"
	}
	if resolvedModel != "" {
		q := parsed.Query()
		if q.Get("model") == "" {
			q.Set("model", resolvedModel)
			parsed.RawQuery = q.Encode()
		}
	}
	return parsed.String()
}

func applyRealtimeQueryAuth(targetURL string, ch *model.Channel, poolKeyVal string) (string, error) {
	key := strings.TrimSpace(poolKeyVal)
	if key == "" {
		return targetURL, nil
	}
	authType := strings.ToLower(strings.TrimSpace(ch.AuthType))
	if authType == "" {
		authType = "bearer"
	}
	if authType != "query_param" {
		return targetURL, nil
	}
	paramName := strings.TrimSpace(ch.AuthParamName)
	if paramName == "" {
		paramName = "key"
	}
	parsed, err := url.Parse(targetURL)
	if err != nil {
		return "", err
	}
	q := parsed.Query()
	if q.Get(paramName) == "" {
		q.Set(paramName, key)
		parsed.RawQuery = q.Encode()
	}
	return parsed.String(), nil
}

type realtimeProxySession struct {
	mu             sync.Mutex
	clientLog      []string
	upstreamLog    []string
	clientLogBytes int
	upLogBytes     int
	textBytes      int64
	usage          map[string]interface{}
}

func newRealtimeProxySession() *realtimeProxySession {
	return &realtimeProxySession{}
}

func (s *realtimeProxySession) recordClient(msg []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clientLogBytes = appendLogMessage(&s.clientLog, s.clientLogBytes, msg)
}

func (s *realtimeProxySession) recordUpstream(msg []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.upLogBytes = appendLogMessage(&s.upstreamLog, s.upLogBytes, msg)
	s.extractUpstreamEvent(msg)
}

func appendLogMessage(logs *[]string, currentBytes int, msg []byte) int {
	if currentBytes >= realtimeMaxLogBytes {
		return currentBytes
	}
	msgStr := string(msg)
	*logs = append(*logs, msgStr)
	return currentBytes + len(msgStr) + 1
}

func (s *realtimeProxySession) extractUpstreamEvent(msg []byte) {
	var event map[string]interface{}
	if json.Unmarshal(msg, &event) != nil {
		return
	}
	eventType, _ := event["type"].(string)
	switch eventType {
	case "response.text.delta", "response.audio_transcript.delta", "response.output_text.delta":
		if delta, _ := event["delta"].(string); delta != "" {
			s.textBytes += int64(len(delta))
		}
	case "response.done", "response.completed":
		if usage := realtimeUsageFromEvent(event); usage != nil {
			s.usage = usage
		}
	}
}

func realtimeUsageFromEvent(event map[string]interface{}) map[string]interface{} {
	respObj, _ := event["response"].(map[string]interface{})
	if respObj == nil {
		return nil
	}
	usageObj, _ := respObj["usage"].(map[string]interface{})
	if usageObj == nil {
		return nil
	}
	inputTokens := int64FromAny(usageObj["input_tokens"])
	outputTokens := int64FromAny(usageObj["output_tokens"])
	totalTokens := int64FromAny(usageObj["total_tokens"])
	if totalTokens == 0 {
		totalTokens = inputTokens + outputTokens
	}
	usage := map[string]interface{}{
		"prompt_tokens":     inputTokens,
		"completion_tokens": outputTokens,
		"total_tokens":      totalTokens,
	}
	if details, ok := usageObj["input_token_details"].(map[string]interface{}); ok {
		if cached := int64FromAny(details["cached_tokens"]); cached > 0 {
			usage["cache_read_tokens"] = cached
		}
	}
	return usage
}

func int64FromAny(v interface{}) int64 {
	n, _ := billing.ToInt64(v)
	return n
}

func (s *realtimeProxySession) usageData(reqData map[string]interface{}) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.usage != nil {
		return s.usage
	}
	prompt := billing.EstimateTokensFromRequest(reqData)
	completion := int64(0)
	if s.textBytes > 0 {
		completion = s.textBytes/4 + 1
	}
	if prompt == 0 && completion == 0 {
		return nil
	}
	return map[string]interface{}{
		"prompt_tokens":     prompt,
		"completion_tokens": completion,
		"total_tokens":      prompt + completion,
		"estimated":         true,
	}
}

func (s *realtimeProxySession) upstreamLogJSON() model.JSON {
	s.mu.Lock()
	defer s.mu.Unlock()
	return model.JSON{"messages": append([]string(nil), s.upstreamLog...)}
}

func (s *realtimeProxySession) clientLogJSON() model.JSON {
	s.mu.Lock()
	defer s.mu.Unlock()
	return model.JSON{"messages": append([]string(nil), s.clientLog...)}
}

func proxyRealtimeEvents(ctx context.Context, clientConn, upstreamConn *websocket.Conn, session *realtimeProxySession) error {
	errCh := make(chan error, 2)
	go proxyRealtimeDirection(ctx, clientConn, upstreamConn, session.recordClient, errCh)
	go proxyRealtimeDirection(ctx, upstreamConn, clientConn, session.recordUpstream, errCh)

	err := <-errCh
	_ = clientConn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
	_ = upstreamConn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
	if isNormalWSClose(err) {
		return nil
	}
	return err
}

func proxyRealtimeDirection(ctx context.Context, src, dst *websocket.Conn, record func([]byte), errCh chan<- error) {
	for {
		select {
		case <-ctx.Done():
			errCh <- nil
			return
		default:
		}
		msgType, msg, err := src.ReadMessage()
		if err != nil {
			errCh <- err
			return
		}
		if msgType != websocket.TextMessage && msgType != websocket.BinaryMessage {
			continue
		}
		record(msg)
		if err := dst.WriteMessage(msgType, msg); err != nil {
			errCh <- err
			return
		}
	}
}

func isNormalWSClose(err error) bool {
	if err == nil {
		return true
	}
	return websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseNoStatusReceived)
}

func writeWSError(conn *websocket.Conn, code, message string) error {
	ev := map[string]interface{}{
		"type": "error",
		"error": map[string]interface{}{
			"code":    code,
			"message": message,
		},
	}
	b, _ := json.Marshal(ev)
	return conn.WriteMessage(websocket.TextMessage, b)
}

func toInterfaceMap(in map[string]string) map[string]interface{} {
	out := make(map[string]interface{}, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
