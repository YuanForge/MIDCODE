package handler

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"testing"
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
