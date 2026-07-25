package middleware

import (
	"net/http"
	"strings"

	"fanapi/internal/config"
	"fanapi/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// ResellerAuth verifies JWT tokens issued to reseller accounts.
func ResellerAuth(cfg *config.ServerConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "需要登录"})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(cfg.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token 无效或已过期"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["role"] != "reseller" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "无权限"})
			return
		}
		sub, ok := claims["sub"].(float64)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "登录凭证异常"})
			return
		}

		userID := int64(sub)
		reseller, err := service.GetActiveResellerByUserID(c.Request.Context(), userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "代理商账号不存在或已停用"})
			return
		}

		c.Set("user_id", userID)
		c.Set("reseller_id", reseller.ID)
		c.Set("role", "reseller")
		c.Next()
	}
}
