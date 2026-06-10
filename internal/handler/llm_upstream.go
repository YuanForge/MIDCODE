package handler

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"fanapi/internal/model"
	"fanapi/internal/script"
	"fanapi/internal/upstream"

	"github.com/gin-gonic/gin"
)

// sendLLMRequest 构建并发送对上游 LLM 的 HTTP 请求。
// proto 决定认证默认方式，ch.AuthType 可覆盖为：
//   - "bearer"     (默认) Authorization: Bearer KEY
//   - "query_param" 将 KEY 作为查询参数附加到 URL
//   - "basic"      HTTP Basic Auth，KEY 格式为 "user:pass"
//   - "sigv4"      AWS Signature V4，KEY 格式为 "ACCESS_KEY:SECRET_KEY"
func sendLLMRequest(c *gin.Context, ch *model.Channel, reqData map[string]interface{}, poolKey *model.PoolKey, _ string, resolvedModel string, isStream bool, responsesOperation ...string) (map[string]string, *http.Response, error) {
	// passthrough_body=true：直接使用客户端原始请求体，不做任何序列化/修改
	var body []byte
	if ch.PassthroughBody {
		if rb, ok := c.Get("raw_body"); ok {
			if rawBytes, ok := rb.([]byte); ok {
				body = rawBytes
			}
		}
	}
	if len(body) == 0 {
		body, _ = json.Marshal(reqData)
	}
	timeout := time.Duration(ch.TimeoutMs) * time.Millisecond
	httpClient := &http.Client{Timeout: timeout}

	op := ""
	if len(responsesOperation) > 0 {
		op = responsesOperation[0]
	}
	poolKeyBaseURL := ""
	if poolKey != nil {
		poolKeyBaseURL = poolKey.BaseURLOverride
	}
	targetURL := resolveLLMTargetURL(upstream.BaseURLForPoolKey(ch.BaseURL, poolKeyBaseURL), resolvedModel, isStream, op)

	method := ch.Method
	if method == "" {
		method = http.MethodPost
	}
	upReq, err := http.NewRequestWithContext(c.Request.Context(), method, targetURL, bytes.NewReader(body))
	if err != nil {
		return nil, nil, err
	}
	upReq.Header.Set("Content-Type", "application/json")
	upReq.Header.Set("Accept", "text/event-stream")

	// passthrough_headers=true：将客户端请求头原样转发给上游，
	// 保留 User-Agent、Anthropic-Version、Anthropic-Beta 等身份标识头。
	// 渠道 Headers（如 Authorization）在之后写入，可覆盖客户端头。
	if ch.PassthroughHeaders {
		// 跳过这些头：Authorization（由渠道 Headers 覆盖）、逐跳传输头、路由元数据头
		passthroughSkip := map[string]bool{
			"Authorization":     true,
			"Host":              true,
			"Content-Length":    true,
			"Transfer-Encoding": true,
			"Connection":        true,
			"Upgrade":           true,
			"Proxy-Connection":  true,
		}
		for k, vals := range c.Request.Header {
			if !passthroughSkip[k] {
				upReq.Header[k] = vals
			}
		}
	}

	// 将渠道 Headers 里的占位符替换后写入请求
	// 支持 {{pool_key}} / {{}} 注入号池 Key，以及其他动态占位符
	poolKeyVal := ""
	if poolKey != nil {
		poolKeyVal = poolKey.Value
	}
	for k, v := range ch.Headers {
		if sv, ok := v.(string); ok {
			upReq.Header.Set(k, script.ResolveHeaderValue(sv, poolKeyVal))
		}
	}

	// URL 里也支持 {{pool_key}} / {{}} 占位符（如 Gemini ?key={{}} 写法）
	if strings.Contains(upReq.URL.RawQuery, "%7B%7B") || strings.Contains(targetURL, "{{") {
		newURL := script.ResolveHeaderValue(upReq.URL.String(), poolKeyVal)
		if u, err2 := url.Parse(newURL); err2 == nil {
			upReq.URL = u
		}
	}

	// 采集完整请求头（用于管理端日志排查，含完整 API Key）
	if err := applyChannelAuth(upReq, ch, poolKeyVal, body); err != nil {
		return nil, nil, err
	}

	sanitizedHeaders := make(map[string]string, len(upReq.Header))
	for k, vals := range upReq.Header {
		sanitizedHeaders[k] = strings.Join(vals, ", ")
	}

	resp, err := httpClient.Do(upReq)
	return sanitizedHeaders, resp, err
}

func resolveLLMTargetURL(baseURL, resolvedModel string, isStream bool, responsesOperation string) string {
	targetURL := baseURL
	if resolvedModel != "" {
		targetURL = strings.ReplaceAll(targetURL, "{model}", resolvedModel)
	}
	if strings.Contains(targetURL, "{stream_action}") {
		if isStream {
			targetURL = strings.ReplaceAll(targetURL, "{stream_action}", "streamGenerateContent")
			if strings.Contains(targetURL, "?") {
				targetURL += "&alt=sse"
			} else {
				targetURL += "?alt=sse"
			}
		} else {
			targetURL = strings.ReplaceAll(targetURL, "{stream_action}", "generateContent")
		}
	}
	if responsesOperation == responsesOperationCompact {
		targetURL = resolveResponsesCompactURL(targetURL)
	}
	return targetURL
}

func resolveResponsesCompactURL(targetURL string) string {
	parsed, err := url.Parse(targetURL)
	if err != nil {
		base, query, hasQuery := strings.Cut(targetURL, "?")
		base = strings.TrimRight(base, "/") + "/compact"
		if hasQuery {
			return base + "?" + query
		}
		return base
	}

	path := strings.TrimRight(parsed.Path, "/")
	switch {
	case strings.HasSuffix(path, "/responses/compact"):
		parsed.Path = path
	case strings.HasSuffix(path, "/responses"):
		parsed.Path = path + "/compact"
	case strings.HasSuffix(path, "/chat/completions"):
		parsed.Path = strings.TrimSuffix(path, "/chat/completions") + "/responses/compact"
	case strings.HasSuffix(path, "/v1"):
		parsed.Path = path + "/responses/compact"
	case path == "":
		parsed.Path = "/responses/compact"
	default:
		parsed.Path = path + "/responses/compact"
	}
	return parsed.String()
}

// applyChannelAuth applies key-pool credentials according to the channel auth type.
func applyChannelAuth(req *http.Request, ch *model.Channel, key string, body []byte) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil
	}

	authType := strings.ToLower(strings.TrimSpace(ch.AuthType))
	if authType == "" {
		authType = "bearer"
	}

	switch authType {
	case "bearer":
		if req.Header.Get("Authorization") == "" {
			req.Header.Set("Authorization", "Bearer "+key)
		}
	case "query_param":
		paramName := strings.TrimSpace(ch.AuthParamName)
		if paramName == "" {
			paramName = "key"
		}
		q := req.URL.Query()
		if q.Get(paramName) == "" {
			q.Set(paramName, key)
			req.URL.RawQuery = q.Encode()
		}
	case "basic":
		if req.Header.Get("Authorization") != "" {
			return nil
		}
		parts := strings.SplitN(key, ":", 2)
		if len(parts) != 2 {
			return fmt.Errorf("basic key format should be user:pass")
		}
		req.SetBasicAuth(parts[0], parts[1])
	case "sigv4":
		if req.Header.Get("Authorization") != "" {
			return nil
		}
		region := strings.TrimSpace(ch.AuthRegion)
		if region == "" {
			region = "us-east-1"
		}
		serviceName := strings.TrimSpace(ch.AuthService)
		if serviceName == "" {
			serviceName = "execute-api"
		}
		return signSigV4(req, key, region, serviceName, body)
	default:
		return fmt.Errorf("unsupported auth_type: %s", authType)
	}
	return nil
}

// signSigV4 为请求添加 AWS Signature Version 4 认证头。
// credentialKey 格式："ACCESS_KEY_ID:SECRET_ACCESS_KEY"。
// 实现了标准 AWS SigV4 流程（仅支持 POST + JSON body）。
func signSigV4(req *http.Request, credentialKey, region, svc string, body []byte) error {
	parts := strings.SplitN(credentialKey, ":", 2)
	if len(parts) != 2 {
		return fmt.Errorf("sigv4 key 格式应为 ACCESS_KEY_ID:SECRET_ACCESS_KEY")
	}
	accessKeyID := parts[0]
	secretKey := parts[1]

	now := time.Now().UTC()
	datestamp := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")

	req.Header.Set("x-amz-date", amzDate)

	// 构建规范化请求字符串
	parsedURL, _ := url.Parse(req.URL.String())
	canonicalURI := parsedURL.EscapedPath()
	if canonicalURI == "" {
		canonicalURI = "/"
	}
	canonicalQS := parsedURL.RawQuery

	payloadHash := fmt.Sprintf("%x", sha256.Sum256(body))
	req.Header.Set("x-amz-content-sha256", payloadHash)

	host := req.Host
	if host == "" {
		host = parsedURL.Host
	}
	req.Header.Set("Host", host)

	signedHeaders := "content-type;host;x-amz-content-sha256;x-amz-date"
	canonicalHeaders := fmt.Sprintf("content-type:%s\nhost:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		req.Header.Get("Content-Type"), host, payloadHash, amzDate)

	canonicalReq := strings.Join([]string{
		req.Method,
		canonicalURI,
		canonicalQS,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	credentialScope := fmt.Sprintf("%s/%s/%s/aws4_request", datestamp, region, svc)
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		fmt.Sprintf("%x", sha256.Sum256([]byte(canonicalReq))),
	}, "\n")

	signingKey := hmacSHA256(
		hmacSHA256(
			hmacSHA256(
				hmacSHA256([]byte("AWS4"+secretKey), datestamp),
				region),
			svc),
		"aws4_request")

	signature := fmt.Sprintf("%x", hmacSHA256(signingKey, stringToSign))

	authHeader := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKeyID, credentialScope, signedHeaders, signature)
	req.Header.Set("Authorization", authHeader)
	return nil
}

func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return mac.Sum(nil)
}
