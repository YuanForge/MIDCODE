package handler

import (
	"fmt"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"fanapi/internal/model"

	"github.com/gin-gonic/gin"
)

// CreateOpenAIImageEdits accepts OpenAI's multipart image editing request and
// routes the uploaded files through the same billed image task pipeline.
//
// @Summary      OpenAI 图片编辑
// @Description  OpenAI 图片编辑兼容接口。服务端等待任务完成后返回官方 {created, data} 响应；超时或失败返回明确错误。
// @Tags         媒体生成
// @Accept       mpfd
// @Produce      json
// @Security     ApiKeyAuth
// @Param        image   formData  file    true   "源图片，可重复传入 image[]"
// @Param        prompt  formData  string  true   "编辑提示词"
// @Param        mask    formData  file    false  "可选遮罩图片"
// @Param        model   formData  string  true   "图片模型"
// @Param        n       formData  int     false  "生成数量"
// @Param        size    formData  string  false  "图片尺寸"
// @Param        response_format formData string false "url 或 b64_json"
// @Success      200   {object}  object{created=int,data=[]object}
// @Failure      400   {object}  object  "参数或上传文件错误"
// @Failure      502   {object}  object  "上游图片编辑失败"
// @Failure      504   {object}  object  "图片编辑超时"
// @Router       /v1/images/edits [post]
func CreateOpenAIImageEdits(c *gin.Context) {
	form, err := c.MultipartForm()
	if err != nil {
		writeOpenAIImageError(c, http.StatusBadRequest, "请求必须使用 multipart/form-data", "invalid_request_error", 0)
		return
	}
	req, err := parseOpenAIImageEditValues(form.Value)
	if err != nil {
		writeOpenAIImageError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", 0)
		return
	}
	images, mask, err := collectOpenAIImageEditFiles(form)
	if err != nil {
		writeOpenAIImageError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", 0)
		return
	}

	imageURLs := make([]string, 0, len(images))
	for _, file := range images {
		imageURL, saveErr := saveUploadedFileURL(c, file, "image-edits", imageUploadRule)
		if saveErr != nil {
			writeOpenAIImageUploadError(c, saveErr)
			return
		}
		imageURLs = append(imageURLs, imageURL)
	}
	var maskURL string
	if mask != nil {
		maskURL, err = saveUploadedFileURL(c, mask, "image-edits", imageUploadRule)
		if err != nil {
			writeOpenAIImageUploadError(c, err)
			return
		}
	}

	req.ReferImages = imageURLs
	payload := buildOpenAIImageEditPayload(req, imageURLs, maskURL)
	serveOpenAIImageTask(c, req, payload)
}

func parseOpenAIImageEditValues(values url.Values) (*model.ImageRequest, error) {
	if values == nil {
		values = url.Values{}
	}
	req := &model.ImageRequest{
		Model:  strings.TrimSpace(values.Get("model")),
		Prompt: strings.TrimSpace(values.Get("prompt")),
		Size:   strings.ToLower(strings.TrimSpace(values.Get("size"))),
		Extra:  make(map[string]interface{}),
	}
	if req.Model == "" {
		return nil, fmt.Errorf("model is required")
	}
	if req.Prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	if rawN := strings.TrimSpace(values.Get("n")); rawN != "" {
		n, err := strconv.Atoi(rawN)
		if err != nil || n <= 0 {
			return nil, fmt.Errorf("n must be a positive integer")
		}
		req.N = n
	}
	known := map[string]bool{"model": true, "prompt": true, "size": true, "n": true, "image": true, "image[]": true, "mask": true}
	for key, rawValues := range values {
		if known[key] || len(rawValues) == 0 {
			continue
		}
		req.Extra[key] = rawValues[len(rawValues)-1]
	}
	return req, nil
}

func collectOpenAIImageEditFiles(form *multipart.Form) ([]*multipart.FileHeader, *multipart.FileHeader, error) {
	if form == nil {
		return nil, nil, fmt.Errorf("image is required")
	}
	images := append([]*multipart.FileHeader(nil), form.File["image"]...)
	images = append(images, form.File["image[]"]...)
	if len(images) == 0 {
		return nil, nil, fmt.Errorf("image is required")
	}
	for _, image := range images {
		if image == nil {
			return nil, nil, fmt.Errorf("image is required")
		}
	}
	var mask *multipart.FileHeader
	if masks := form.File["mask"]; len(masks) > 0 {
		mask = masks[0]
	}
	return images, mask, nil
}

func buildOpenAIImageEditPayload(req *model.ImageRequest, imageURLs []string, maskURL string) map[string]interface{} {
	payload := req.ToMap()
	payload["refer_images"] = imageURLs
	payload["_body_type"] = "multipart/form-data"
	files := map[string]interface{}{}
	if len(imageURLs) == 1 {
		files["image"] = imageURLs[0]
	} else {
		files["image"] = imageURLs
	}
	if strings.TrimSpace(maskURL) != "" {
		files["mask"] = maskURL
	}
	payload["_files"] = files
	return payload
}

func writeOpenAIImageUploadError(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	message := "保存图片失败，请稍后重试"
	if fileErr, ok := err.(*uploadFileError); ok {
		status = fileErr.status
		message = fileErr.message
	}
	writeOpenAIImageError(c, status, message, "invalid_request_error", 0)
}
