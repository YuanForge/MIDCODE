package middleware

import (
	"net/http"
	"strconv"
	"strings"

	"fanapi/internal/db"
	"fanapi/internal/model"

	"github.com/gin-gonic/gin"
)

// Admin validates the current database role and assigned permissions on every request.
func Admin() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetInt64("user_id")
		var user model.User
		found, err := db.Engine.ID(id).Cols("role", "is_active").Get(&user)
		if err != nil || !found || !user.IsActive || user.Role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "需要有效的管理员权限"})
			return
		}
		c.Set("role", user.Role)
		if !enforceAdminPermission(c, id) {
			return
		}
		// Staff must not reset passwords, freeze, delete or otherwise mutate admins.
		if !IsRootAdmin(id) && c.Request.Method != "GET" && strings.Contains(c.FullPath(), "/users/:id") {
			target, parseErr := strconv.ParseInt(c.Param("id"), 10, 64)
			var u model.User
			found, err := db.Engine.ID(target).Cols("role").Get(&u)
			if parseErr != nil || err != nil || !found || u.Role == "admin" || u.Role == "operator" {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "仅主管理员可以管理管理员账户"})
				return
			}
		}
		c.Next()
	}
}

// AdminOrOperator allows both "admin" and "operator" roles.
func AdminOrOperator() gin.HandlerFunc {
	return func(c *gin.Context) {
		if role, exists := c.Get("role"); exists {
			if role == "admin" || role == "operator" {
				c.Next()
				return
			}
		}

		userID, exists := c.Get("user_id")
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "无访问权限"})
			return
		}

		user := &model.User{}
		found, err := db.Engine.Where("id = ?", userID).Cols("role").Get(user)
		if err != nil || !found || (user.Role != "admin" && user.Role != "operator") {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "需要管理员或运营权限"})
			return
		}
		c.Set("role", user.Role)
		c.Next()
	}
}
