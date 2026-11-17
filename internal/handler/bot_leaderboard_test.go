package handler

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestBotLeaderboardDay(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-11-16T16:01:00Z")
	for _, tc := range []struct{ input, want string }{
		{"", "2026-11-17"}, {"2026-11-16", "2026-11-16"}, {"2024-02-29", "2024-02-29"},
	} {
		start, end, err := botLeaderboardDay(tc.input, now)
		if err != nil || start.Format("2006-01-02") != tc.want || end.Sub(start) != 24*time.Hour || start.Format("15:04:05Z07:00") != "00:00:00+08:00" {
			t.Fatalf("%q: %v %v %v", tc.input, start, end, err)
		}
	}
	for _, raw := range []string{"2026-11-18", "2026-02-29", "2026-1-01", "2026-11-17T00:00:00Z", " 2026-11-17", "0000-01-01", "garbage"} {
		if _, _, err := botLeaderboardDay(raw, now); err == nil {
			t.Fatalf("accepted invalid date %q", raw)
		}
	}
}

func TestBotLeaderboardRejectsOrdinaryCredentials(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, header := range []string{"Authorization", "X-API-Key"} {
		for _, key := range []string{"", "sk-ordinary", "eyJhbGciOiJIUzI1NiJ9.fake.jwt", "bot_short"} {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("GET", "/v1/bot/leaderboard/daily", nil)
			if header == "Authorization" {
				c.Request.Header.Set(header, "Bearer "+key)
			} else {
				c.Request.Header.Set(header, key)
			}
			BotDailyLeaderboard(c)
			if w.Code != 401 || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal(header, key, w.Code)
			}
		}
	}
}
