package handler

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"testing"
	"time"
)

func TestQQValidation(t *testing.T) {
	for _, s := range []string{"12345", "1234567890", "12345678901234567890"} {
		if !validQQ(s) {
			t.Fatal(s)
		}
	}
	for _, s := range []string{"", "1234", "012345", "123456789012345678901", "123 456", "１２３４５", "1e123", "-12345"} {
		if validQQ(s) {
			t.Fatal(s)
		}
	}
}
func TestQQRejectsAPIKeys(t *testing.T) {
	for _, handler := range []gin.HandlerFunc{GetQQBinding, SaveQQBinding, DeleteQQBinding} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("auth_type", "apikey")
		handler(c)
		if w.Code != 403 {
			t.Fatal(w.Code)
		}
	}
}

func TestQQBindingStates(t *testing.T) {
	now := time.Now()
	for _, tc := range []struct {
		qq       string
		verified bool
		expires  time.Time
		want     string
	}{
		{"", false, time.Time{}, "unbound"}, {"12345", false, now.Add(time.Minute), "pending"}, {"12345", false, now, "expired"}, {"12345", true, time.Time{}, "bound"},
	} {
		if got := qqBindingStatus(tc.qq, tc.verified, tc.expires, now); got != tc.want {
			t.Fatal(got, tc.want)
		}
	}
}
func TestQQConfirmRejectsOrdinaryCredentials(t *testing.T) {
	for _, key := range []string{"", "sk-ordinary", "jwt-token"} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/bot/qq/confirm-binding", nil)
		c.Request.Header.Set("Authorization", "Bearer "+key)
		ConfirmQQBinding(c)
		if w.Code != 401 {
			t.Fatal(w.Code)
		}
	}
}
