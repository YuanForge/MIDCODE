package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
)

func TestSecurityAuditRecordsActorTargetAndExcludesSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var events []*model.AdminAuditLog
	r := gin.New()
	r.SetTrustedProxies(nil)
	r.Use(securityAudit(func(e *model.AdminAuditLog) { events = append(events, e) }))
	r.PUT("/admin/users/:id/password", func(c *gin.Context) {
		c.Set("user_id", int64(36))
		c.Set("role", "admin")
		c.Set("auth_type", "apikey")
		c.Set("api_key_id", int64(123))
		c.JSON(200, gin.H{"message": "ok"})
	})
	req := httptest.NewRequest("PUT", "/admin/users/1/password?code=query-secret", strings.NewReader(`{"password":"password-secret","code":"code-secret"}`))
	req.RemoteAddr = "192.0.2.1:1234"
	req.Header.Set("Authorization", "Bearer token-secret")
	req.Header.Set("Cookie", "session=cookie-secret")
	req.Header.Set("X-API-Key", "key-secret")
	req.Header.Set("X-Forwarded-For", "198.51.100.1")
	r.ServeHTTP(httptest.NewRecorder(), req)
	if len(events) != 1 {
		t.Fatalf("events=%d", len(events))
	}
	e := events[0]
	if e.AdminID != 36 || e.ResourceID != 1 || e.Action != "security.admin_password_reset" || e.Detail["api_key_id"] != int64(123) || e.Detail["result"] != "success" {
		t.Fatalf("bad event: %+v", e)
	}
	if e.IP != "192.0.2.1" || e.Detail["forwarded_for_unverified"] != "198.51.100.1" {
		t.Fatalf("proxy identity lost: %+v", e)
	}
	encoded, _ := json.Marshal(e)
	for _, secret := range []string{"query-secret", "password-secret", "code-secret", "token-secret", "cookie-secret", "key-secret"} {
		if bytes.Contains(encoded, []byte(secret)) {
			t.Fatalf("audit leaked %s", secret)
		}
	}
}

func TestSecurityAuditIncludesDeniedRequestsAndLoginOutcomes(t *testing.T) {
	for _, status := range []int{200, 400, 401, 403, 429, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			var event *model.AdminAuditLog
			r := gin.New()
			r.Use(securityAudit(func(e *model.AdminAuditLog) { event = e }))
			r.POST("/auth/login", func(c *gin.Context) {
				c.Set("security_account", "admin")
				if status == 200 {
					c.Set("user_id", int64(1))
				}
				c.AbortWithStatus(status)
			})
			r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/auth/login", nil))
			if event == nil || event.Detail["status"] != status || event.Detail["account_input"] != "admin" {
				t.Fatalf("missing event: %+v", event)
			}
			if status != 200 && (event.AdminID != 0 || event.Detail["result"] != "failure") {
				t.Fatal("failed attempt incorrectly attributed")
			}
			if status == 200 && (event.AdminID != 1 || event.ResourceID != 1) {
				t.Fatal("login actor missing")
			}
		})
	}
}

func TestSecurityAuditEarlyDenialAndUnrelatedTraffic(t *testing.T) {
	var events []*model.AdminAuditLog
	r := gin.New()
	r.Use(securityAudit(func(e *model.AdminAuditLog) { events = append(events, e) }))
	r.Use(func(c *gin.Context) { c.AbortWithStatus(429) })
	r.PUT("/admin/users/:id/password", func(c *gin.Context) { t.Fatal("denied handler ran") })
	r.POST("/v1/chat/completions", func(c *gin.Context) {})
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("PUT", "/admin/users/1/password", nil))
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/v1/chat/completions", nil))
	if len(events) != 1 || events[0].ResourceID != 1 || events[0].Detail["status"] != 429 {
		t.Fatalf("events=%+v", events)
	}
}

func TestSecurityAuditPasswordRoutes(t *testing.T) {
	for _, route := range []string{"/user/password", "/auth/reset-password", "/auth/forgot-password", "/admin/channels"} {
		t.Run(route, func(t *testing.T) {
			var event *model.AdminAuditLog
			r := gin.New()
			r.Use(securityAudit(func(e *model.AdminAuditLog) { event = e }))
			r.POST(route, func(c *gin.Context) { c.Set("user_id", int64(1)); c.Status(200) })
			r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", route, nil))
			if event == nil {
				t.Fatal("missing audit")
			}
			if route == "/user/password" && event.ResourceID != 1 {
				t.Fatal("missing password target")
			}
		})
	}
}
