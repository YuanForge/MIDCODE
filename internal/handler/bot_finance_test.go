package handler

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"testing"
	"time"
)

func TestBotDateRangeAndMoney(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-11-16T16:00:00Z")
	start, yesterday, end := botDateRange(now)
	if start.Format(time.RFC3339) != "2026-11-10T00:00:00+08:00" || yesterday.Format("2006-01-02") != "2026-11-16" || end.Sub(start) != 7*24*time.Hour {
		t.Fatal(start, yesterday, end)
	}
	for n, want := range map[int64]string{0: "0.000000", 1: "0.000001", -1: "-0.000001", 1234567: "1.234567", -9223372036854775808: "-9223372036854.775808"} {
		if botCNY(n) != want {
			t.Fatal(n, botCNY(n))
		}
	}
}
func TestBotRejectsOrdinaryKeysAndJWT(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, key := range []string{"", "sk-ordinary", "eyJhbGciOiJIUzI1NiJ9.fake.jwt", "bot_short"} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("GET", "/v1/bot/users/3/financial-summary", nil)
		c.Request.Header.Set("Authorization", "Bearer "+key)
		BotUserFinancialSummary(c)
		if w.Code != 401 {
			t.Fatal(key, w.Code)
		}
	}
	for _, auth := range []string{"apikey", "jwt_with_key", ""} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("auth_type", auth)
		c.Set("user_id", int64(1))
		if botKeyAdmin(c) || w.Code != 403 {
			t.Fatal(auth)
		}
	}
}
