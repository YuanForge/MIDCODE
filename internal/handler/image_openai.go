package handler

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"

	"github.com/gin-gonic/gin"
)

const (
	silentTaskCreationContextKey = "silent_task_creation"
	createdTaskIDContextKey      = "created_task_id"
	openAIImageWaitTimeout       = 180 * time.Second
)

var errOpenAIImageResultEmpty = errors.New("图片生成完成但未返回图片数据")

type openAIImageDataItem struct {
	URL     string `json:"url,omitempty"`
	B64JSON string `json:"b64_json,omitempty"`
}

// CreateOpenAIImageGenerations adapts the platform task pipeline to the
// official OpenAI image generations response contract.
//
// @Summary      OpenAI 图片生成
// @Description  OpenAI 图片生成兼容接口。服务端等待任务完成后返回官方 {created, data} 响应；超时或失败返回明确错误。
// @Tags         媒体生成
// @Accept       json
// @Produce      json
// @Security     ApiKeyAuth
// @Param        body  body      model.ImageRequest  true  "OpenAI 图片生成参数"
// @Success      200   {object}  object{created=int,data=[]object}
// @Failure      400   {object}  object  "参数错误"
// @Failure      502   {object}  object  "上游图片生成失败"
// @Failure      504   {object}  object  "图片生成超时"
// @Router       /v1/images/generations [post]
func CreateOpenAIImageGenerations(c *gin.Context) {
	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		writeOpenAIImageError(c, http.StatusBadRequest, "读取请求体失败", "invalid_request_error", 0)
		return
	}
	req, err := bindImageRequest(bodyBytes)
	if err != nil {
		writeOpenAIImageError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", 0)
		return
	}
	req.ReferImages = expandReferImages(req.ReferImages, requestBaseURL(c))
	serveOpenAIImageTask(c, req, req.ToMap())
	return
}

func serveOpenAIImageTask(c *gin.Context, req *model.ImageRequest, payload map[string]interface{}) {
	c.Set(silentTaskCreationContextKey, true)
	createTask(c, "image", payload)
	if c.Writer.Written() {
		return
	}

	rawTaskID, ok := c.Get(createdTaskIDContextKey)
	if !ok {
		writeOpenAIImageError(c, http.StatusInternalServerError, "创建图片任务失败，请稍后重试", "server_error", 0)
		return
	}
	taskID, ok := rawTaskID.(int64)
	if !ok || taskID <= 0 {
		writeOpenAIImageError(c, http.StatusInternalServerError, "创建图片任务失败，请稍后重试", "server_error", 0)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), openAIImageWaitTimeout)
	defer cancel()
	task, err := waitForImageTask(ctx, c.MustGet("user_id").(int64), taskID)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			writeOpenAIImageError(c, http.StatusGatewayTimeout, "图片生成超时，请稍后通过任务接口查询结果", "image_generation_timeout", taskID)
			return
		}
		writeOpenAIImageError(c, http.StatusInternalServerError, "查询图片任务失败，请稍后重试", "server_error", taskID)
		return
	}
	if task.Status == "failed" {
		message := task.ErrorMsg
		if strings.TrimSpace(message) == "" {
			message = "图片生成失败"
		}
		writeOpenAIImageError(c, http.StatusBadGateway, message, "image_generation_failed", taskID)
		return
	}

	responseFormat, _ := req.Extra["response_format"].(string)
	data, err := openAIImageData(task, responseFormat)
	if err != nil {
		writeOpenAIImageError(c, http.StatusBadGateway, err.Error(), "image_generation_empty", taskID)
		return
	}
	created := task.CreatedAt.Unix()
	if created <= 0 {
		created = time.Now().Unix()
	}
	c.JSON(http.StatusOK, gin.H{"created": created, "data": data})
}

func waitForImageTask(ctx context.Context, userID, taskID int64) (*model.Task, error) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		var task model.Task
		found, err := db.Engine.Context(ctx).Where("id = ? AND user_id = ?", taskID, userID).
			Cols("id", "user_id", "type", "status", "result", "error_msg", "created_at", "updated_at").Get(&task)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, errors.New("task not found")
		}
		if task.Status == "done" || task.Status == "failed" {
			return &task, nil
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
		}
	}
}

func openAIImageData(task *model.Task, responseFormat string) ([]openAIImageDataItem, error) {
	if task == nil || len(task.Result) == 0 {
		return nil, errOpenAIImageResultEmpty
	}
	var data []openAIImageDataItem
	var collect func(interface{})
	collect = func(raw interface{}) {
		switch value := raw.(type) {
		case string:
			value = strings.TrimSpace(value)
			if value != "" {
				data = append(data, imageDataItemFromString(value, responseFormat))
			}
		case []interface{}:
			for _, item := range value {
				collect(item)
			}
		case []string:
			for _, item := range value {
				collect(item)
			}
		case map[string]interface{}:
			if b64, _ := value["b64_json"].(string); strings.TrimSpace(b64) != "" {
				data = append(data, openAIImageDataItem{B64JSON: strings.TrimSpace(b64)})
				return
			}
			if url, _ := value["url"].(string); strings.TrimSpace(url) != "" {
				data = append(data, imageDataItemFromString(strings.TrimSpace(url), responseFormat))
				return
			}
			for _, key := range []string{"data", "items", "result", "url"} {
				if nested, ok := value[key]; ok {
					collect(nested)
					if len(data) > 0 {
						return
					}
				}
			}
		}
	}

	for _, key := range []string{"data", "url", "items", "result"} {
		if value, ok := task.Result[key]; ok {
			collect(value)
			if len(data) > 0 {
				break
			}
		}
	}
	if len(data) == 0 {
		return nil, errOpenAIImageResultEmpty
	}
	return data, nil
}

func imageDataItemFromString(value, responseFormat string) openAIImageDataItem {
	if responseFormat == "b64_json" {
		if encoded, ok := decodeDataURI(value); ok {
			return openAIImageDataItem{B64JSON: encoded}
		}
	}
	return openAIImageDataItem{URL: value}
}

func decodeDataURI(value string) (string, bool) {
	if !strings.HasPrefix(strings.ToLower(value), "data:") {
		return "", false
	}
	comma := strings.IndexByte(value, ',')
	if comma < 0 || !strings.Contains(strings.ToLower(value[:comma]), ";base64") {
		return "", false
	}
	encoded := value[comma+1:]
	if _, err := base64.StdEncoding.DecodeString(encoded); err != nil {
		return "", false
	}
	return encoded, true
}

func writeOpenAIImageError(c *gin.Context, status int, message, code string, taskID int64) {
	errBody := gin.H{"message": message, "type": "image_generation_error", "code": code}
	if taskID > 0 {
		errBody["task_id"] = taskID
	}
	c.JSON(status, gin.H{"error": errBody})
}
