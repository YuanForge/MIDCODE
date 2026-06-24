package handler

// ResponsesWSProxy 处理 GET /v1/responses 的 WebSocket 升级。
//
// OpenAI Responses API WebSocket 协议：
//   1. 客户端以 wss://.../v1/responses?model=xxx 发起连接。
//   2. 连接建立后，客户端发送 {"type":"response.create","response":{...}} 消息。
//   3. 服务端将上游 OpenAI Chat Completions SSE 流转换为 Responses API 事件，
//      以 WebSocket Text 消息（纯 JSON）逐条推送给客户端。
//   4. 一次连接可顺序发起多次 response.create。

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"fanapi/internal/billing"
	"fanapi/internal/model"
	"fanapi/internal/protocol"
	"fanapi/internal/script"
	"fanapi/internal/service"
	"fanapi/internal/upstream"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	// 生产环境应校验 Origin；此处允许所有来源（与现有 CORS 策略保持一致）
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ResponsesWSProxy 处理 GET /v1/responses — WebSocket 升级入口。
//
// @Summary      OpenAI Responses API（WebSocket 双向流）
// @Description  通过 WebSocket 连接使用 OpenAI Responses API。建立连接后发送 response.create 事件即可发起对话，服务端实时推送 Responses API 格式事件。
// @Tags         LLM
// @Security     ApiKeyAuth
// @Param        model  query  string  false  "默认模型名称（routing_model），可在 response.create 消息中覆盖"
// @Success      101    {string} string "Switching Protocols"
// @Failure      400    {object} model.APIErrorResponse "WebSocket 升级失败或消息格式错误"
// @Router       /v1/responses [get]
func ResponsesWSProxy(c *gin.Context) {
	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[ws-responses] upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// 从查询参数获取默认模型（客户端也可在每条 response.create 消息中覆盖）
	defaultModel := c.Query("model")
	upstreamSession := &responsesWSUpstreamSession{}
	defer upstreamSession.close()

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			// 客户端正常断开或网络错误，退出循环
			break
		}

		var msg map[string]interface{}
		if jsonErr := json.Unmarshal(msgBytes, &msg); jsonErr != nil {
			sendWSResponseError(conn, "invalid_json", "消息格式错误")
			continue
		}

		msgType, _ := msg["type"].(string)
		switch msgType {
		case "response.create":
			// response.create 消息格式：
			// { "type": "response.create", "response": { "model": "...", "input": "..." } }
			// 或直接把请求字段放在顶层（兼容部分客户端）
			responseData, ok := msg["response"].(map[string]interface{})
			if !ok {
				// 兼容：顶层即为请求体
				responseData = make(map[string]interface{})
				for k, v := range msg {
					if k != "type" {
						responseData[k] = v
					}
				}
			}
			// 若消息中未指定 model，使用连接时的 query 参数
			if _, hasModel := responseData["model"]; !hasModel && defaultModel != "" {
				responseData["model"] = defaultModel
			}
			if handleErr := handleWSResponseCreate(c, conn, responseData, upstreamSession); handleErr != nil {
				log.Printf("[ws-responses] response.create error: %v", handleErr)
				if !isWSClientErrorAlreadySent(handleErr) {
					sendWSResponseError(conn, "server_error", handleErr.Error())
				}
			}
		default:
			sendWSResponseError(conn, "unknown_event_type", "未知事件类型: "+msgType)
		}
	}
}

// handleWSResponseCreate 处理单条 response.create 请求。
// responseData 已是 Responses API 格式，此处执行：
//   - 请求格式转换（Responses → OpenAI Chat Completions）
//   - 渠道选择与计费
//   - 上游流式请求
//   - SSE → Responses API WS 事件推送
//   - 结算
func handleWSResponseCreate(c *gin.Context, conn *websocket.Conn, responseData map[string]interface{}, upstreamSession *responsesWSUpstreamSession) error {
	userID := c.MustGet("user_id").(int64)
	var apiKeyIDVal int64
	if apiKeyID, ok := c.Get("api_key_id"); ok && apiKeyID != nil {
		apiKeyIDVal, _ = apiKeyID.(int64)
	}
	var userGroup string
	if raw, ok := c.Get("user_group"); ok {
		userGroup, _ = raw.(string)
	}

	// 渠道选择
	routingKey, _ := responseData["model"].(string)
	if routingKey == "" {
		routingKey, _ = responseData["model"].(string)
	}
	if routingKey == "" {
		return fmt.Errorf("请在请求体 model 字段填写模型名称")
	}

	ch, chErr := service.SelectChannel(c.Request.Context(), routingKey)
	if chErr != nil {
		ch, chErr = service.GetChannelByName(c.Request.Context(), routingKey)
		if chErr != nil {
			return fmt.Errorf("渠道不存在: %s", routingKey)
		}
	}

	resolvedModel := routingKey
	if ch.Model != "" {
		resolvedModel = ch.Model
	}

	// 号池 Key 分配
	entityID := apiKeyIDVal
	if entityID == 0 {
		entityID = userID
	}
	var poolKey *model.PoolKey
	var poolKeyIDVal int64
	if ch.KeyPoolID > 0 {
		if pk, pkErr := service.GetOrAssignPoolKey(c.Request.Context(), ch.KeyPoolID, entityID); pkErr == nil {
			poolKey = pk
			poolKeyIDVal = pk.ID
		}
	}

	proto := effectiveProtocol(ch)
	upstreamWSURL := resolveUpstreamWSURL(ch, resolvedModel, poolKey)
	useUpstreamWS := upstreamWSURL != "" && proto == protocolResponses

	var openAIReq map[string]interface{}
	if !useUpstreamWS {
		// 非上游 WS 直连时走现有链路：Responses API → OpenAI Chat Completions
		var convErr error
		openAIReq, convErr = protocol.NormalizeClientRequest(responseData, protocol.ProtocolResponses)
		if convErr != nil {
			return convErr
		}
		openAIReq["stream"] = true
		if ch.Model != "" {
			openAIReq["model"] = ch.Model
		}
		// 注入 stream_options include_usage（供计费）
		if _, hasOpts := openAIReq["stream_options"]; !hasOpts {
			openAIReq["stream_options"] = map[string]interface{}{"include_usage": true}
		} else if opts, ok := openAIReq["stream_options"].(map[string]interface{}); ok {
			opts["include_usage"] = true
		}
	} else {
		// 上游 WS 直连：保持 Responses API 格式，必要时仅覆盖 model
		openAIReq = prepareResponsesWSRequest(responseData, resolvedModel)
	}

	// 保存原始请求（用于计费估算）
	origReqData := make(map[string]interface{}, len(openAIReq))
	for k, v := range openAIReq {
		origReqData[k] = v
	}

	// 计费预扣
	inputHold, outputHold, calcErr := billing.CalcForUser(ch, origReqData, userGroup)
	if calcErr != nil {
		return calcErr
	}
	totalHold := inputHold + outputHold
	upstreamCostHold, _ := billing.CalcUpstreamCost(ch, origReqData)

	var modelCreditCharged int64
	var generalCreditCharged int64
	if totalHold > 0 {
		if routingKey != "" {
			modelCreditCharged, _ = billing.ChargeModelCredit(c.Request.Context(), userID, routingKey, totalHold)
		}
		generalCreditCharged = totalHold - modelCreditCharged
		if generalCreditCharged > 0 {
			if chargeErr := billing.Charge(c.Request.Context(), userID, generalCreditCharged); chargeErr != nil {
				if modelCreditCharged > 0 {
					_ = billing.RefundModelCredit(c.Request.Context(), userID, routingKey, modelCreditCharged)
				}
				return chargeErr
			}
		}
	}

	c.Set("model_credit_routing_key", routingKey)
	c.Set("model_credit_charged", modelCreditCharged)
	c.Set("model_credit_general_charged", generalCreditCharged)

	// refundHold 在错误路径下退还本次预扣
	refundHold := func(_ string) (refunded, modelRefunded int64) {
		if totalHold <= 0 {
			return 0, 0
		}
		if generalCreditCharged > 0 {
			if err := billing.Refund(c.Request.Context(), userID, generalCreditCharged); err != nil {
				log.Printf("[responses-ws] refund general hold failed user_id=%d credits=%d err=%v", userID, generalCreditCharged, err)
			} else {
				refunded += generalCreditCharged
			}
		}
		if modelCreditCharged > 0 {
			if err := billing.RefundModelCredit(c.Request.Context(), userID, routingKey, modelCreditCharged); err != nil {
				log.Printf("[responses-ws] refund model hold failed user_id=%d routing_key=%s credits=%d err=%v", userID, routingKey, modelCreditCharged, err)
			} else {
				refunded += modelCreditCharged
				modelRefunded = modelCreditCharged
			}
		}
		return refunded, modelRefunded
	}

	corrID := uuid.New().String()
	if totalHold > 0 {
		if err := service.WriteTx(c.Request.Context(), userID, ch.ID, apiKeyIDVal, poolKeyIDVal, corrID, "hold", totalHold, upstreamCostHold, modelCreditCharged, model.JSON{
			"input_hold":  inputHold,
			"output_hold": outputHold,
			"user_group":  userGroup,
			"via":         "websocket",
		}); err != nil {
			if modelCreditCharged > 0 {
				_ = billing.RefundModelCredit(c.Request.Context(), userID, routingKey, modelCreditCharged)
			}
			return fmt.Errorf("计费流水写入失败，请稍后重试")
		}
	}

	// LLM 日志
	inputPricePer1M, outputPricePer1M := resolveTokenPriceMetaValue(ch, userGroup)
	llmLog := &model.LLMLog{
		UserID:                 userID,
		ChannelID:              ch.ID,
		APIKeyID:               apiKeyIDVal,
		CorrID:                 corrID,
		Model:                  resolvedModel,
		InputPricePer1MTokens:  inputPricePer1M,
		OutputPricePer1MTokens: outputPricePer1M,
		IsStream:               true,
		Transport:              "ws",
		UpstreamRequest:        model.JSON(openAIReq),
		ClientRequest:          model.JSON(responseData),
		Status:                 "pending",
	}
	enqueueLLMLogInsert(*llmLog)

	var usageForSettle map[string]interface{}
	if useUpstreamWS {
		usageWS, rawWSMessages, clientResp, wsErr := forwardResponsesWSWithSession(c.Request.Context(), upstreamSession, conn, c, ch, poolKey, upstreamWSURL, openAIReq)
		if wsErr != nil {
			service.RecordChannelError(c.Request.Context(), ch.ID)
			refunded, mcRefunded := refundHold("upstream_error")
			if totalHold > 0 {
				recordLLMRefundTx(c.Request.Context(), c, userID, ch.ID, apiKeyIDVal, poolKeyIDVal, corrID, refunded, scaleRefundCost(upstreamCostHold, refunded, totalHold), mcRefunded, model.JSON{"reason": "upstream_error"})
			}
			enqueueLLMLogPatch(corrID, []string{"status", "error_msg"}, model.LLMLog{Status: "error", ErrorMsg: wsErr.Error()})
			return wsErr
		}
		service.RecordChannelSuccess(c.Request.Context(), ch.ID)
		enqueueLLMLogPatch(corrID, []string{"upstream_status", "upstream_response", "client_response"}, model.LLMLog{
			UpstreamStatus:   http.StatusOK,
			UpstreamResponse: model.JSON{"messages": rawWSMessages},
			ClientResponse:   clientResp,
		})
		usageForSettle = usageWS
	} else {
		// 发送上游请求（强制流式）
		_, resp, reqErr := sendLLMRequest(c, ch, openAIReq, poolKey, proto, resolvedModel, true)
		if reqErr != nil {
			service.RecordChannelError(c.Request.Context(), ch.ID)
			refunded, mcRefunded := refundHold("upstream_error")
			if totalHold > 0 {
				recordLLMRefundTx(c.Request.Context(), c, userID, ch.ID, apiKeyIDVal, poolKeyIDVal, corrID, refunded, scaleRefundCost(upstreamCostHold, refunded, totalHold), mcRefunded, model.JSON{"reason": "upstream_error"})
			}
			enqueueLLMLogPatch(corrID, []string{"status", "error_msg"}, model.LLMLog{Status: "error", ErrorMsg: reqErr.Error()})
			return reqErr
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			bodyErr, _ := io.ReadAll(resp.Body)
			service.RecordChannelError(c.Request.Context(), ch.ID)
			refunded, mcRefunded := refundHold("upstream_error")
			if totalHold > 0 {
				recordLLMRefundTx(c.Request.Context(), c, userID, ch.ID, apiKeyIDVal, poolKeyIDVal, corrID, refunded, scaleRefundCost(upstreamCostHold, refunded, totalHold), mcRefunded, model.JSON{"reason": "upstream_error"})
			}
			enqueueLLMLogPatch(corrID, []string{"status", "upstream_status", "error_msg"}, model.LLMLog{Status: "error", UpstreamStatus: resp.StatusCode, ErrorMsg: string(bodyErr)})
			return fmt.Errorf("上游返回 %d: %s", resp.StatusCode, string(bodyErr))
		}

		service.RecordChannelSuccess(c.Request.Context(), ch.ID)

		// 流式 SSE → Responses API WS 事件
		usg := &usageState{protocol: proto}
		sseConv := protocol.NewSSEConverter(proto, protocol.ProtocolResponses)

		const maxSSELogBytes = 200 * 1024
		var rawSSELines []string
		var rawSSEBytes int

		scanner := bufio.NewScanner(resp.Body)
		// 可选：提高单行上限，避免长 data: 行触发 scanner.Err()==bufio.ErrTooLong
		buf := make([]byte, 0, 64*1024)
		scanner.Buffer(buf, 1024*1024) // 1MB

		wsError := false
		for scanner.Scan() {
			line := scanner.Text()
			usg.processLine(line)
			if rawSSEBytes < maxSSELogBytes {
				rawSSELines = append(rawSSELines, line)
				rawSSEBytes += len(line) + 1
			}

			var outLines []string
			if sseConv != nil {
				outLines = sseConv.Convert(line)
			} else {
				// 上游协议 == responses 时直接透传（不常见，保留兜底）
				outLines = []string{line}
			}
			for _, l := range outLines {
				if !strings.HasPrefix(l, "data: ") {
					continue
				}
				data := strings.TrimPrefix(l, "data: ")
				if data == "[DONE]" {
					continue
				}
				if writeErr := conn.WriteMessage(websocket.TextMessage, []byte(data)); writeErr != nil {
					wsError = true
					break
				}
			}
			if wsError {
				break
			}
		}

		// 关键：补充 Scan 循环后的错误检查
		if scanErr := scanner.Err(); scanErr != nil && !wsError {
			service.RecordChannelError(c.Request.Context(), ch.ID)
			refunded, mcRefunded := refundHold("upstream_stream_read_error")
			if totalHold > 0 {
				recordLLMRefundTx(c.Request.Context(), c, userID, ch.ID, apiKeyIDVal, poolKeyIDVal, corrID, refunded, scaleRefundCost(upstreamCostHold, refunded, totalHold), mcRefunded, model.JSON{"reason": "upstream_stream_read_error"})
			}
			enqueueLLMLogPatch(corrID, []string{"status", "error_msg"}, model.LLMLog{Status: "error", ErrorMsg: scanErr.Error()})
			return fmt.Errorf("读取上游流失败: %w", scanErr)
		}

		// 冲刷 SSE 转换器末尾事件（response.completed 等）
		if !wsError && sseConv != nil {
			for _, l := range sseConv.Flush() {
				if !strings.HasPrefix(l, "data: ") {
					continue
				}
				data := strings.TrimPrefix(l, "data: ")
				if data == "[DONE]" {
					continue
				}
				_ = conn.WriteMessage(websocket.TextMessage, []byte(data))
			}
		}

		// 日志回写
		enqueueLLMLogPatch(corrID, []string{"upstream_status", "upstream_response", "client_response"}, model.LLMLog{
			UpstreamStatus:   http.StatusOK,
			UpstreamResponse: model.JSON{"lines": rawSSELines},
			ClientResponse:   buildStreamClientResponse(rawSSELines, proto),
		})
		usageForSettle = usg.normalized(origReqData)
	}

	llmSettle(c, ch, origReqData, usageForSettle, totalHold, userID, ch.ID, apiKeyIDVal, poolKeyIDVal, corrID, userGroup)
	return nil
}

func forwardResponsesWS(ctx context.Context, clientConn *websocket.Conn, c *gin.Context, ch *model.Channel, poolKey *model.PoolKey, upstreamWSURL string, responseReq map[string]interface{}) (map[string]interface{}, []string, model.JSON, error) {
	timeout := time.Duration(ch.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 60 * time.Second
	}

	poolKeyVal := ""
	if poolKey != nil {
		poolKeyVal = poolKey.Value
	}
	targetURL := script.ResolveHeaderValue(upstreamWSURL, poolKeyVal)

	dialHeader, sentHeaders, headerErr := buildUpstreamWSHeaders(
		c.Request.Header,
		ch,
		poolKeyVal,
		ch.PassthroughHeaders,
		map[string]bool{"x-upstream-ws-url": true},
		nil,
	)
	if headerErr != nil {
		return nil, nil, nil, headerErr
	}
	_ = sentHeaders

	if parsed, err := url.Parse(targetURL); err == nil {
		if parsed.Scheme != "ws" && parsed.Scheme != "wss" {
			return nil, nil, nil, fmt.Errorf("上游 URL 不是 WebSocket: %s", targetURL)
		}
	}

	dialer := websocket.Dialer{HandshakeTimeout: timeout}
	upConn, _, err := dialer.DialContext(ctx, targetURL, dialHeader)
	if err != nil {
		return nil, nil, nil, err
	}
	defer upConn.Close()

	reqBody := make(map[string]interface{}, len(responseReq)+1)
	for k, v := range responseReq {
		reqBody[k] = v
	}
	reqBody["stream"] = true

	createMsg := map[string]interface{}{
		"type":     "response.create",
		"response": reqBody,
	}
	createBytes, _ := json.Marshal(createMsg)
	if err := upConn.WriteMessage(websocket.TextMessage, createBytes); err != nil {
		return nil, nil, nil, err
	}

	const maxWSLogBytes = 200 * 1024
	var rawMessages []string
	rawBytes := 0
	var textBuf strings.Builder
	var usage map[string]interface{}

	for {
		msgType, msgBytes, readErr := upConn.ReadMessage()
		if readErr != nil {
			if websocket.IsCloseError(readErr, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				break
			}
			return usage, rawMessages, toWSClientResp(textBuf.String()), readErr
		}
		if msgType != websocket.TextMessage {
			continue
		}

		msgStr := string(msgBytes)
		if rawBytes < maxWSLogBytes {
			rawMessages = append(rawMessages, msgStr)
			rawBytes += len(msgStr) + 1
		}

		var event map[string]interface{}
		if json.Unmarshal(msgBytes, &event) == nil {
			typeVal, _ := event["type"].(string)
			switch typeVal {
			case "response.output_text.delta":
				if delta, _ := event["delta"].(string); delta != "" {
					textBuf.WriteString(delta)
				}
			case "response.output_text.done":
				// 某些上游只在 done 事件里给完整文本，不发 delta。
				if textBuf.Len() == 0 {
					if doneText, _ := event["text"].(string); doneText != "" {
						textBuf.WriteString(doneText)
					}
				}
			case "response.completed":
				if respObj, ok := event["response"].(map[string]interface{}); ok {
					if usg, ok := respObj["usage"].(map[string]interface{}); ok {
						pt := int64(0)
						ct := int64(0)
						if n, ok := usg["input_tokens"].(float64); ok {
							pt = int64(n)
						}
						if n, ok := usg["output_tokens"].(float64); ok {
							ct = int64(n)
						}
						usage = map[string]interface{}{
							"prompt_tokens":     pt,
							"completion_tokens": ct,
							"total_tokens":      pt + ct,
						}
					}
				}
			case "error":
				if errObj, ok := event["error"].(map[string]interface{}); ok {
					if msg, _ := errObj["message"].(string); msg != "" {
						_ = clientConn.WriteMessage(websocket.TextMessage, msgBytes)
						return usage, rawMessages, toWSClientResp(textBuf.String()), fmt.Errorf("上游错误: %s", msg)
					}
				}
			}
		}

		if writeErr := clientConn.WriteMessage(websocket.TextMessage, msgBytes); writeErr != nil {
			return usage, rawMessages, toWSClientResp(textBuf.String()), writeErr
		}

		if eventType, _ := event["type"].(string); eventType == "response.completed" {
			break
		}
	}

	if usage == nil {
		// 上游未返回 usage 时，按请求+输出文本估算，避免误判为 no_output 全额退款。
		prompt := billing.EstimateTokensFromRequest(responseReq)
		completion := int64(textBuf.Len()/4 + 1)
		if textBuf.Len() == 0 {
			completion = 0
		}
		usage = map[string]interface{}{
			"prompt_tokens":     prompt,
			"completion_tokens": completion,
			"total_tokens":      prompt + completion,
			"estimated":         true,
		}
	}

	return usage, rawMessages, toWSClientResp(textBuf.String()), nil
}

type responsesWSUpstreamSession struct {
	conn        *websocket.Conn
	key         string
	targetURL   string
	sentHeaders map[string]string
}

func (s *responsesWSUpstreamSession) close() {
	if s == nil || s.conn == nil {
		return
	}
	_ = s.conn.Close()
	s.conn = nil
	s.key = ""
	s.targetURL = ""
	s.sentHeaders = nil
}

func (s *responsesWSUpstreamSession) ensure(ctx context.Context, c *gin.Context, ch *model.Channel, poolKey *model.PoolKey, upstreamWSURL string, timeout time.Duration) (*websocket.Conn, string, map[string]string, error) {
	if s == nil {
		return nil, "", nil, fmt.Errorf("missing responses upstream session")
	}

	poolKeyVal := ""
	poolKeyID := int64(0)
	if poolKey != nil {
		poolKeyVal = poolKey.Value
		poolKeyID = poolKey.ID
	}

	targetURL := normalizeResponsesWSURL(script.ResolveHeaderValue(upstreamWSURL, poolKeyVal))
	targetURL, authErr := applyRealtimeQueryAuth(targetURL, ch, poolKeyVal)
	if authErr != nil {
		return nil, "", nil, authErr
	}
	parsed, parseErr := url.Parse(targetURL)
	if parseErr != nil {
		return nil, "", nil, parseErr
	}
	if parsed.Scheme != "ws" && parsed.Scheme != "wss" {
		return nil, "", nil, fmt.Errorf("上游 URL 不是 WebSocket: %s", targetURL)
	}

	targetURL = parsed.String()
	sessionKey := fmt.Sprintf("%d:%d:%s", ch.ID, poolKeyID, targetURL)
	if s.conn != nil && s.key == sessionKey {
		return s.conn, s.targetURL, s.sentHeaders, nil
	}

	s.close()
	dialHeader, sentHeaders, headerErr := buildUpstreamWSHeaders(
		c.Request.Header,
		ch,
		poolKeyVal,
		ch.PassthroughHeaders,
		map[string]bool{
			"x-upstream-responses-ws-url": true,
			"x-upstream-responses-url":    true,
			"x-upstream-ws-url":           true,
		},
		nil,
	)
	if headerErr != nil {
		return nil, "", nil, headerErr
	}

	dialer := websocket.Dialer{HandshakeTimeout: timeout}
	upConn, _, dialErr := dialer.DialContext(ctx, targetURL, dialHeader)
	if dialErr != nil {
		return nil, "", nil, dialErr
	}

	s.conn = upConn
	s.key = sessionKey
	s.targetURL = targetURL
	s.sentHeaders = sentHeaders
	return s.conn, s.targetURL, s.sentHeaders, nil
}

func forwardResponsesWSWithSession(ctx context.Context, session *responsesWSUpstreamSession, clientConn *websocket.Conn, c *gin.Context, ch *model.Channel, poolKey *model.PoolKey, upstreamWSURL string, responseReq map[string]interface{}) (map[string]interface{}, []string, model.JSON, error) {
	timeout := time.Duration(ch.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	if session == nil {
		session = &responsesWSUpstreamSession{}
	}

	upConn, _, _, err := session.ensure(ctx, c, ch, poolKey, upstreamWSURL, timeout)
	if err != nil {
		return nil, nil, nil, err
	}

	createMsg := map[string]interface{}{
		"type":     "response.create",
		"response": responseReq,
	}
	createBytes, _ := json.Marshal(createMsg)
	if err := upConn.WriteMessage(websocket.TextMessage, createBytes); err != nil {
		session.close()
		return nil, nil, nil, err
	}

	const maxWSLogBytes = 200 * 1024
	var rawMessages []string
	rawBytes := 0
	var textBuf strings.Builder
	var usage map[string]interface{}
	var terminalErr error
	var terminalSeen bool

	for {
		msgType, msgBytes, readErr := upConn.ReadMessage()
		if readErr != nil {
			session.close()
			if websocket.IsCloseError(readErr, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseNoStatusReceived) && terminalSeen {
				break
			}
			if websocket.IsCloseError(readErr, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseNoStatusReceived) {
				return usage, rawMessages, toWSClientResp(textBuf.String()), fmt.Errorf("upstream websocket closed before response.completed")
			}
			return usage, rawMessages, toWSClientResp(textBuf.String()), readErr
		}
		if msgType != websocket.TextMessage {
			continue
		}

		msgStr := string(msgBytes)
		if rawBytes < maxWSLogBytes {
			rawMessages = append(rawMessages, msgStr)
			rawBytes += len(msgStr) + 1
		}

		var event map[string]interface{}
		if json.Unmarshal(msgBytes, &event) == nil {
			typeVal, _ := event["type"].(string)
			switch typeVal {
			case "response.output_text.delta":
				if delta, _ := event["delta"].(string); delta != "" {
					textBuf.WriteString(delta)
				}
			case "response.output_text.done":
				if textBuf.Len() == 0 {
					if doneText, _ := event["text"].(string); doneText != "" {
						textBuf.WriteString(doneText)
					}
				}
			case "response.completed", "response.incomplete":
				terminalSeen = true
				if respObj, ok := event["response"].(map[string]interface{}); ok {
					if usg := responsesUsageFromEvent(respObj); usg != nil {
						usage = usg
					}
				}
			case "response.failed":
				terminalSeen = true
				terminalErr = responsesWSFailureError(event)
				if respObj, ok := event["response"].(map[string]interface{}); ok {
					if usg := responsesUsageFromEvent(respObj); usg != nil {
						usage = usg
					}
				}
			case "error":
				terminalSeen = true
				terminalErr = responsesWSFailureError(event)
			}
		}

		if writeErr := clientConn.WriteMessage(websocket.TextMessage, msgBytes); writeErr != nil {
			session.close()
			return usage, rawMessages, toWSClientResp(textBuf.String()), writeErr
		}

		if terminalSeen {
			break
		}
	}

	if terminalErr != nil {
		return usage, rawMessages, toWSClientResp(textBuf.String()), &wsClientErrorAlreadySent{err: terminalErr}
	}

	if usage == nil {
		prompt := billing.EstimateTokensFromRequest(responseReq)
		completion := int64(textBuf.Len()/4 + 1)
		if textBuf.Len() == 0 {
			completion = 0
		}
		usage = map[string]interface{}{
			"prompt_tokens":     prompt,
			"completion_tokens": completion,
			"total_tokens":      prompt + completion,
			"estimated":         true,
		}
	}

	return usage, rawMessages, toWSClientResp(textBuf.String()), nil
}

func prepareResponsesWSRequest(responseData map[string]interface{}, resolvedModel string) map[string]interface{} {
	out := make(map[string]interface{}, len(responseData)+1)
	for k, v := range responseData {
		if strings.EqualFold(k, "stream") || strings.EqualFold(k, "background") || strings.EqualFold(k, "stream_options") {
			continue
		}
		out[k] = v
	}
	if resolvedModel != "" {
		out["model"] = resolvedModel
	}
	return out
}

func responsesUsageFromEvent(respObj map[string]interface{}) map[string]interface{} {
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

func responsesWSFailureError(event map[string]interface{}) error {
	if errObj, ok := event["error"].(map[string]interface{}); ok {
		if msg, _ := errObj["message"].(string); msg != "" {
			return fmt.Errorf("upstream error: %s", msg)
		}
	}
	if respObj, ok := event["response"].(map[string]interface{}); ok {
		if errObj, ok := respObj["error"].(map[string]interface{}); ok {
			if msg, _ := errObj["message"].(string); msg != "" {
				return fmt.Errorf("upstream error: %s", msg)
			}
		}
	}
	eventType, _ := event["type"].(string)
	if eventType == "" {
		eventType = "unknown"
	}
	return fmt.Errorf("upstream event %s", eventType)
}

type wsClientErrorAlreadySent struct {
	err error
}

func (e *wsClientErrorAlreadySent) Error() string {
	return e.err.Error()
}

func (e *wsClientErrorAlreadySent) Unwrap() error {
	return e.err
}

func isWSClientErrorAlreadySent(err error) bool {
	var sent *wsClientErrorAlreadySent
	return errors.As(err, &sent)
}

func normalizeResponsesWSURL(raw string) string {
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
		parsed.Path = "/v1/responses"
	case strings.HasSuffix(path, "/responses"):
		parsed.Path = path
	case strings.HasSuffix(path, "/chat/completions"):
		parsed.Path = strings.TrimSuffix(path, "/chat/completions") + "/responses"
	case strings.HasSuffix(path, "/v1"):
		parsed.Path = path + "/responses"
	case strings.Contains(path, "/v1/"):
		idx := strings.Index(path, "/v1/")
		parsed.Path = path[:idx+len("/v1")] + "/responses"
	}
	return parsed.String()
}

func resolveUpstreamWSURL(ch *model.Channel, resolvedModel string, poolKey *model.PoolKey) string {
	poolKeyVal := ""
	if poolKey != nil {
		poolKeyVal = poolKey.Value
	}

	for k, v := range ch.Headers {
		if !strings.EqualFold(k, "x-upstream-responses-ws-url") && !strings.EqualFold(k, "x-upstream-responses-url") {
			continue
		}
		s, ok := v.(string)
		if !ok || strings.TrimSpace(s) == "" {
			continue
		}
		u := strings.TrimSpace(script.ResolveHeaderValue(s, poolKeyVal))
		if resolvedModel != "" {
			u = strings.ReplaceAll(u, "{model}", resolvedModel)
		}
		lower := strings.ToLower(u)
		if strings.HasPrefix(lower, "ws://") || strings.HasPrefix(lower, "wss://") || strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
			return normalizeResponsesWSURL(u)
		}
	}

	// 允许在渠道 Headers 中显式指定上游 WS 地址：x-upstream-ws-url
	for k, v := range ch.Headers {
		if !strings.EqualFold(k, "x-upstream-ws-url") {
			continue
		}
		s, ok := v.(string)
		if !ok || strings.TrimSpace(s) == "" {
			continue
		}
		u := strings.TrimSpace(script.ResolveHeaderValue(s, poolKeyVal))
		if resolvedModel != "" {
			u = strings.ReplaceAll(u, "{model}", resolvedModel)
		}
		if strings.HasPrefix(strings.ToLower(u), "ws://") || strings.HasPrefix(strings.ToLower(u), "wss://") {
			return u
		}
	}

	poolKeyBaseURL := ""
	if poolKey != nil {
		poolKeyBaseURL = poolKey.BaseURLOverride
	}
	base := upstream.BaseURLForPoolKey(ch.BaseURL, poolKeyBaseURL)
	if resolvedModel != "" {
		base = strings.ReplaceAll(base, "{model}", resolvedModel)
	}
	base = strings.TrimSpace(script.ResolveHeaderValue(base, poolKeyVal))
	if base == "" {
		return ""
	}

	lower := strings.ToLower(base)
	if strings.HasPrefix(lower, "ws://") || strings.HasPrefix(lower, "wss://") {
		return base
	}
	// 单渠道双协议：HTTP 走 base_url；WS 自动推导同路径 wss/ws 地址。
	if strings.HasPrefix(lower, "https://") {
		return "wss://" + base[len("https://"):]
	}
	if strings.HasPrefix(lower, "http://") {
		return "ws://" + base[len("http://"):]
	}
	return ""
}

func toWSClientResp(content string) model.JSON {
	if content == "" {
		return nil
	}
	return model.JSON{"content": content, "stream": true}
}

// sendWSResponseError 向客户端发送 Responses API 格式错误事件。
func sendWSResponseError(conn *websocket.Conn, code, message string) {
	ev := map[string]interface{}{
		"type": "error",
		"error": map[string]interface{}{
			"code":    code,
			"message": message,
		},
	}
	b, _ := json.Marshal(ev)
	_ = conn.WriteMessage(websocket.TextMessage, b)
}
