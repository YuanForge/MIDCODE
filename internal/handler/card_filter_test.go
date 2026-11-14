package handler

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"testing"
)

func TestListCardsRejectsInvalidRedeemerBeforeDatabaseAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, value := range []string{"0", "-1", "abc", "1.5", "9223372036854775808"} {
		t.Run(value, func(t *testing.T) {
			r := gin.New()
			r.GET("/cards", ListCards)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest("GET", "/cards?used_by="+value, nil))
			if w.Code != 400 {
				t.Fatalf("invalid redeemer must return 400, got %d", w.Code)
			}
		})
	}
}
