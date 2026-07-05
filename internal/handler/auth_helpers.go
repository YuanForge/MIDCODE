package handler

import "github.com/gin-gonic/gin"

// clientIP 从请求头获取真实客户端 IP。
func clientIP(c *gin.Context) string {
	return c.ClientIP()
}
