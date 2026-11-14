package middleware

import (
	"fanapi/internal/db"
	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
	"net/http"
	"strings"
)

// Root identity is immutable; an unassigned admin is never a superuser.
func IsRootAdmin(id int64) bool { return id == 1 }

func AdminPermissions(id int64) ([]string, error) {
	if IsRootAdmin(id) {
		return []string{"*"}, nil
	}
	var bindings []model.AdminUserRole
	if err := db.Engine.Where("admin_id = ?", id).Find(&bindings); err != nil {
		return nil, err
	}
	permissions := []string{}
	if len(bindings) == 0 {
		return permissions, nil
	}
	ids := make([]interface{}, 0, len(bindings))
	for _, b := range bindings {
		ids = append(ids, b.RoleID)
	}
	var roles []model.AdminRole
	if err := db.Engine.In("id", ids...).Find(&roles); err != nil {
		return nil, err
	}
	for _, r := range roles {
		for _, p := range r.Permissions {
			if p != "*" {
				permissions = append(permissions, p)
			}
		}
	}
	return permissions, nil
}

// Unknown routes fail closed until a deliberate permission mapping is added.
func adminRoutePermission(method, path string) string {
	p := strings.TrimPrefix(path, "/api")
	p = strings.TrimPrefix(p, "/admin/")
	if p == "me" || p == "verify-password" {
		return "authenticated"
	}
	if strings.HasPrefix(p, "roles") || strings.HasPrefix(p, "admins") || p == "users/batch" || strings.HasSuffix(p, "/role") || (p == "users" && method == http.MethodPost) {
		return "root"
	}
	read := method == http.MethodGet
	rw := func(resource string) string {
		if read {
			return resource + ":read"
		}
		return resource + ":write"
	}
	switch strings.Split(p, "/")[0] {
	case "channels", "upstream-platforms":
		return rw("channels")
	case "key-pools", "pool-keys":
		return rw("keypools")
	case "users":
		if strings.HasSuffix(p, "/recharge") || strings.HasSuffix(p, "/model-credits") && !read {
			return "root"
		}
		return rw("users")
	case "api-keys", "risk-labels":
		return rw("users")
	case "transactions":
		if read {
			return "billing:read"
		}
		return "billing:adjust"
	case "payments":
		return "billing:read"
	case "cards", "coupons":
		return rw("cards")
	case "tasks", "cleanup", "alerts":
		return rw("tasks")
	case "llm-logs":
		return "logs:read"
	case "withdrawals":
		if read {
			return "withdraw:read"
		}
		if strings.HasSuffix(p, "/cs-approve") {
			return "withdraw:review"
		}
		return "withdraw:approve"
	case "audit":
		return "audit:all"
	case "notifications":
		return "settings:announce"
	case "vendors":
		return "settings:vendor"
	case "stats":
		if p == "stats/trend" || p == "stats/top" {
			return "dashboard:trend"
		}
		return "dashboard:revenue"
	}
	return "root"
}

func enforceAdminPermission(c *gin.Context, id int64) bool {
	if c.Request.Method == http.MethodPost && strings.HasSuffix(c.FullPath(), "/users/:id/recharge") {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "已禁用人工充值，请使用支付充值或卡密兑换"})
		return false
	}
	if IsRootAdmin(id) {
		return true
	}
	required := adminRoutePermission(c.Request.Method, c.FullPath())
	if required == "authenticated" {
		return true
	}
	if required != "root" {
		permissions, err := AdminPermissions(id)
		if err == nil {
			for _, p := range permissions {
				if p == required {
					return true
				}
			}
		}
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "没有此操作的职责权限"})
	return false
}
