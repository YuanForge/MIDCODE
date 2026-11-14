package middleware

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"testing"
)

func TestPrivilegedRoutesCannotBeDelegated(t *testing.T) {
	for _, tc := range []struct{ method, path string }{
		{"POST", "/admin/users"}, {"PUT", "/admin/users/:id/role"},
		{"POST", "/admin/users/batch"}, {"PUT", "/admin/admins/:id/roles"},
		{"PUT", "/admin/roles/:id"}, {"POST", "/admin/unknown"},
	} {
		if got := adminRoutePermission(tc.method, tc.path); got != "root" {
			t.Errorf("%s %s: %s", tc.method, tc.path, got)
		}
	}
}

func TestDepartmentRouteSeparation(t *testing.T) {
	for _, tc := range []struct{ method, path, want string }{
		{"POST", "/admin/channels", "channels:write"},
		{"GET", "/admin/channels", "channels:read"},
		{"POST", "/admin/cards/generate", "cards:write"},
		{"GET", "/admin/transactions", "billing:read"},
		{"POST", "/admin/withdrawals/:id/cs-approve", "withdraw:review"},
		{"POST", "/admin/withdrawals/:id/approve", "withdraw:approve"},
	} {
		if got := adminRoutePermission(tc.method, tc.path); got != tc.want {
			t.Errorf("%s: %s", tc.path, got)
		}
	}
}

func TestRootCannotManuallyRecharge(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/admin/users/:id/recharge", func(c *gin.Context) {
		if enforceAdminPermission(c, 1) {
			c.Status(200)
		}
	})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/admin/users/414/recharge", nil))
	if w.Code != 403 {
		t.Fatalf("manual recharge allowed: %d", w.Code)
	}
}

func TestStaffCannotCreateAdminEvenWithAdminIdentity(t *testing.T) {
	r := gin.New()
	r.POST("/admin/users", func(c *gin.Context) {
		c.Set("role", "admin")
		if enforceAdminPermission(c, 36) {
			c.Status(201)
		}
	})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/admin/users", nil))
	if w.Code != 403 {
		t.Fatalf("staff creation allowed: %d", w.Code)
	}
}
