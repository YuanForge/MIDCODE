package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var uploadImageCategories = map[string]string{
	"reference":    "reference",
	"channel-icon": "channel-icons",
	"inspiration":  "inspiration",
	"site-setting": "site-settings",
	"payment-qr":   "payment-qr",
}

var uploadVideoCategories = map[string]string{
	"reference-video":   "reference-videos",
	"inspiration-video": "inspiration-videos",
}

type uploadRule struct {
	maxSize         int64
	contentPrefixes []string
	defaultExt      string
	emptyFileMsg    string
	tooLargeMsg     string
	invalidTypeMsg  string
	saveFailedMsg   string
}

type uploadFileError struct {
	status  int
	message string
}

func (e *uploadFileError) Error() string { return e.message }

var imageUploadRule = uploadRule{
	maxSize:         10 * 1024 * 1024,
	contentPrefixes: []string{"image/"},
	defaultExt:      ".png",
	emptyFileMsg:    "请选择要上传的图片",
	tooLargeMsg:     "图片不能超过 10MB",
	invalidTypeMsg:  "仅支持上传图片文件",
	saveFailedMsg:   "保存图片失败",
}

var videoUploadRule = uploadRule{
	maxSize:         200 * 1024 * 1024,
	contentPrefixes: []string{"video/"},
	defaultExt:      ".mp4",
	emptyFileMsg:    "请选择要上传的视频",
	tooLargeMsg:     "视频不能超过 200MB",
	invalidTypeMsg:  "仅支持上传视频文件",
	saveFailedMsg:   "保存视频失败",
}

func hasAllowedContentType(contentType string, prefixes []string) bool {
	for _, prefix := range prefixes {
		if strings.HasPrefix(contentType, prefix) {
			return true
		}
	}
	return false
}

func saveUploadedMedia(c *gin.Context, category string, rule uploadRule) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": rule.emptyFileMsg})
		return
	}
	url, err := saveUploadedFileURL(c, file, category, rule)
	if err != nil {
		var fileErr *uploadFileError
		if errors.As(err, &fileErr) {
			c.JSON(fileErr.status, gin.H{"error": fileErr.message})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": rule.saveFailedMsg})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": url})
}

func saveUploadedFileURL(c *gin.Context, file *multipart.FileHeader, category string, rule uploadRule) (string, error) {
	if file == nil {
		return "", &uploadFileError{status: http.StatusBadRequest, message: rule.emptyFileMsg}
	}
	if file.Size <= 0 {
		return "", &uploadFileError{status: http.StatusBadRequest, message: "上传文件不能为空"}
	}
	if file.Size > rule.maxSize {
		return "", &uploadFileError{status: http.StatusRequestEntityTooLarge, message: rule.tooLargeMsg}
	}

	contentType := file.Header.Get("Content-Type")
	if contentType == "" || !hasAllowedContentType(contentType, rule.contentPrefixes) {
		return "", &uploadFileError{status: http.StatusBadRequest, message: rule.invalidTypeMsg}
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext == "" {
		extensions, _ := mime.ExtensionsByType(contentType)
		if len(extensions) > 0 {
			ext = strings.ToLower(extensions[0])
		}
	}
	if ext == "" {
		ext = rule.defaultExt
	}

	subdir := filepath.Join("uploads", category)
	if err := os.MkdirAll(subdir, 0o755); err != nil {
		return "", &uploadFileError{status: http.StatusInternalServerError, message: "创建上传目录失败"}
	}

	userID := c.MustGet("user_id").(int64)
	randomBytes := make([]byte, 8)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", &uploadFileError{status: http.StatusInternalServerError, message: "生成文件名失败"}
	}
	filename := fmt.Sprintf("%d_%d_%s%s", userID, time.Now().Unix(), hex.EncodeToString(randomBytes), ext)
	fullPath := filepath.Join(subdir, filename)
	if err := c.SaveUploadedFile(file, fullPath); err != nil {
		return "", &uploadFileError{status: http.StatusInternalServerError, message: rule.saveFailedMsg}
	}
	return requestBaseURL(c) + fmt.Sprintf("/uploads/%s/%s", category, filename), nil
}

// UploadImage POST /upload/image
func UploadImage(c *gin.Context) {
	categoryKey := c.PostForm("category")
	category, ok := uploadImageCategories[categoryKey]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的上传分类"})
		return
	}
	saveUploadedMedia(c, category, imageUploadRule)
}

// UploadVideo POST /upload/video
func UploadVideo(c *gin.Context) {
	categoryKey := c.PostForm("category")
	category, ok := uploadVideoCategories[categoryKey]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的上传分类"})
		return
	}
	saveUploadedMedia(c, category, videoUploadRule)
}

// UploadReferenceImage POST /user/reference-images
func UploadReferenceImage(c *gin.Context) {
	saveUploadedMedia(c, uploadImageCategories["reference"], imageUploadRule)
}
