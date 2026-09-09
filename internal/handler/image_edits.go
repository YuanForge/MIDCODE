package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"strconv"

	"github.com/gin-gonic/gin"
)

// CreateOpenAIImageEdits forwards uploaded images through the synchronous LLM pipeline.
// @Summary OpenAI 图片编辑
// @Description 使用 LLM 渠道同步转发上游图片编辑接口，保留 multipart 文件，不创建异步任务。
// @Tags 媒体生成
// @Accept mpfd,json
// @Produce json
// @Security ApiKeyAuth
// @Param image formData file true "源图片，可重复传入 image[]"
// @Param model formData string true "图片模型"
// @Param prompt formData string true "编辑提示词"
// @Success 200 {object} object
// @Router /v1/images/edits [post]
func CreateOpenAIImageEdits(c *gin.Context) {
	c.Set("client_proto", protocolOpenAI)
	c.Set(llmRouteContextKey, "/v1/images/edits")
	defer func() {
		if c.Request.MultipartForm != nil {
			_ = c.Request.MultipartForm.RemoveAll()
		}
	}()
	llmProxy(c)
}

func decodeOpenAIImageMultipart(c *gin.Context, body []byte) (map[string]interface{}, error) {
	_, params, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil {
		return nil, err
	}
	form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
	if err != nil {
		return nil, err
	}
	c.Request.MultipartForm = form
	if len(form.File["image"])+len(form.File["image[]"]) == 0 {
		return nil, fmt.Errorf("image is required")
	}
	req := make(map[string]interface{}, len(form.Value))
	for key, values := range form.Value {
		if len(values) == 1 {
			req[key] = values[0]
		} else {
			items := make([]interface{}, len(values))
			for i, value := range values {
				items[i] = value
			}
			req[key] = items
		}
	}
	if raw, ok := req["n"].(string); ok {
		n, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return nil, fmt.Errorf("n must be a positive integer")
		}
		req["n"] = n
	}
	if raw, ok := req["stream"].(string); ok {
		value, err := strconv.ParseBool(raw)
		if err != nil {
			return nil, err
		}
		req["stream"] = value
	}
	return req, nil
}

// Rebuild each attempt with its mapped fields and the original file parts.
func encodeOpenAIImageMultipart(form *multipart.Form, req map[string]interface{}) ([]byte, string, error) {
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for key, value := range req {
		values, ok := value.([]interface{})
		if !ok {
			values = []interface{}{value}
		}
		for _, item := range values {
			text, ok := item.(string)
			if !ok {
				encoded, err := json.Marshal(item)
				if err != nil {
					return nil, "", err
				}
				text = string(encoded)
			}
			if err := w.WriteField(key, text); err != nil {
				return nil, "", err
			}
		}
	}
	for _, files := range form.File {
		for _, file := range files {
			part, err := w.CreatePart(file.Header)
			if err != nil {
				return nil, "", err
			}
			src, err := file.Open()
			if err != nil {
				return nil, "", err
			}
			_, err = io.Copy(part, src)
			_ = src.Close()
			if err != nil {
				return nil, "", err
			}
		}
	}
	if err := w.Close(); err != nil {
		return nil, "", err
	}
	return body.Bytes(), w.FormDataContentType(), nil
}
