package middleware

import (
	"net/http"
	"strings"

	"fanapi/internal/config"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Auth supports both X-API-Key header and Authorization: Bearer JWT.
func Auth(cfg *config.ServerConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try API Key first
		rawKey := c.GetHeader("X-API-Key")
		if rawKey != "" {
			apiKey, err := service.LookupAPIKey(c.Request.Context(), rawKey)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "API Key 无效"})
				return
			}
			// 检查用户账户是否被冻结
			user := &model.User{}
			if found, _ := db.Engine.ID(apiKey.UserID).Cols("group", "is_active").Get(user); found {
				if !user.IsActive {
					c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "账户已被冻结，请联系管理员"})
					return
				}
				c.Set("user_group", user.Group)
			}
			c.Set("user_id", apiKey.UserID)
			c.Set("api_key_id", apiKey.ID)
			c.Set("key_type", apiKey.KeyType)
			c.Set("auth_type", "apikey")
			c.Next()
			return
		}

		// Try JWT Bearer
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			// First try to validate as API Key (supports "Authorization: Bearer sk-xxx")
			if apiKey, err := service.LookupAPIKey(c.Request.Context(), tokenStr); err == nil {
				// 检查用户账户是否被冻结
				user := &model.User{}
				if found, _ := db.Engine.ID(apiKey.UserID).Cols("group", "is_active").Get(user); found {
					if !user.IsActive {
						c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "账户已被冻结，请联系管理员"})
						return
					}
					c.Set("user_group", user.Group)
				}
				c.Set("user_id", apiKey.UserID)
				c.Set("api_key_id", apiKey.ID)
				c.Set("key_type", apiKey.KeyType)
				c.Set("auth_type", "apikey")
				c.Next()
				return
			}

			// Fall back to JWT
			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return []byte(cfg.JWTSecret), nil
			})
			if err != nil || !token.Valid {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "登录已过期，请重新登录"})
				return
			}
			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "登录凭证异常，请重新登录"})
				return
			}
			userID := int64(claims["sub"].(float64))
			role, _ := claims["role"].(string)
			group, _ := claims["group"].(string)
			c.Set("user_id", userID)
			c.Set("role", role)
			c.Set("user_group", group)
			c.Set("auth_type", "jwt")
			c.Next()
			return
		}

		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
	}
}

// APIKeyOnly rejects requests that are not authenticated via API Key.
func APIKeyOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		if authType, _ := c.Get("auth_type"); authType != "apikey" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "此接口仅支持 API Key 认证"})
			return
		}
		c.Next()
	}
}
