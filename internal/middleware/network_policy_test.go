package middleware

import (
	"fanapi/internal/networkpolicy"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWebsiteNetworkScope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	deny, _ := networkpolicy.Parse(strings.NewReader("3.8.0.0/16\n2600:1f00::/24"))
	allow, _ := networkpolicy.Parse(strings.NewReader("3.8.1.9/32"))
	guard, err := WebsiteNetwork(&networkpolicy.Policy{Deny: deny, Allow: allow}, []string{"127.0.0.1/32"})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, path, peer, xff, auth string
		want                        int
	}{
		{"login", "/auth/login", "3.8.1.1:123", "", "", 403},
		{"registration", "/auth/register", "3.8.1.1:123", "", "", 403},
		{"captcha", "/auth/captcha/new", "3.8.1.1:123", "", "", 403},
		{"email", "/auth/send-code", "3.8.1.1:123", "", "", 403},
		{"reset", "/auth/reset-password", "3.8.1.1:123", "", "", 403},
		{"apikey no console bypass", "/user/apikeys", "3.8.1.1:123", "", "apikey", 403},
		{"jwt model route", "/v1/chat/completions", "3.8.1.1:123", "", "jwt", 403},
		{"jwt with selected key", "/v1/responses", "3.8.1.1:123", "", "jwt_with_key", 403},
		{"api models", "/v1/models", "3.8.1.1:123", "", "apikey", 200},
		{"api responses", "/v1/responses", "3.8.1.1:123", "", "apikey", 200},
		{"native gemini", "/v1beta/models/gemini", "3.8.1.1:123", "", "apikey", 200},
		{"api task results", "/v1/tasks/123", "3.8.1.1:123", "", "apikey", 200},
		{"anonymous public", "/public/channels", "3.8.1.1:123", "", "", 200},
		{"payment callback", "/pay/epay/callback", "3.8.1.1:123", "", "", 200},
		{"purchase", "/pay/epay/create", "3.8.1.1:123", "", "", 403},
		{"upload", "/upload/image", "3.8.1.1:123", "", "", 403},
		{"handoff redemption", "/public/image-studio/redeem", "3.8.1.1:123", "", "", 403},
		{"spoofed untrusted proxy", "/auth/login", "3.8.1.1:123", "1.2.3.4", "", 403},
		{"trusted proxy", "/auth/login", "127.0.0.1:123", "3.8.1.1", "", 403},
		{"spoofed prefix", "/auth/login", "127.0.0.1:123", "1.2.3.4, 3.8.1.1", "", 403},
		{"normal IP", "/auth/login", "1.2.3.4:123", "", "", 200},
		{"exception", "/auth/login", "3.8.1.9:123", "", "", 200},
		{"ipv6", "/auth/login", "[2600:1fff::1]:123", "", "", 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			r.Use(guard)
			r.POST(tc.path, func(c *gin.Context) {
				// Simulates the credential kind AFTER cryptographic authentication.
				if strings.HasPrefix(tc.auth, "jwt") && !CheckWebsiteNetwork(c) {
					return
				}
				c.Status(200)
			})
			req := httptest.NewRequest(http.MethodPost, tc.path, nil)
			req.RemoteAddr = tc.peer
			req.Header.Set("X-Forwarded-For", tc.xff)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("got %d want %d: %s", w.Code, tc.want, w.Body)
			}
			if tc.want == 403 && !strings.Contains(w.Body.String(), "DATACENTER_IP_BLOCKED") {
				t.Fatal(w.Body.String())
			}
		})
	}
}
