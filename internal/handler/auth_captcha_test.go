package handler

import (
	"bytes"
	"encoding/json"
	"fanapi/internal/captcha"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"net/http/httptest"
	"testing"
)

func TestEmailEndpointsRequireCaptchaBeforeSideEffects(t *testing.T) {
	r := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: r.Addr()})
	defer client.Close()
	security, _ := captcha.New(client, "test", "")
	h := &AuthHandler{captcha: security}
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.POST("/send", h.SendCode)
	engine.POST("/reset", h.ForgotPassword)
	engine.POST("/new", h.CaptchaNew)
	engine.POST("/verify", h.CaptchaVerify)
	for _, path := range []string{"/send", "/reset"} {
		req := httptest.NewRequest("POST", path, bytes.NewBufferString(`{"email":"test@example.invalid"}`))
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		engine.ServeHTTP(res, req)
		if res.Code != 403 {
			t.Fatalf("%s status %d", path, res.Code)
		}
		var body map[string]any
		json.Unmarshal(res.Body.Bytes(), &body)
		if body["code"] != "CAPTCHA_REQUIRED" {
			t.Fatal(body)
		}
	}
	req := httptest.NewRequest("POST", "/new", bytes.NewBufferString(`{"purpose":"send_code","subject":"test@example.invalid"}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	engine.ServeHTTP(res, req)
	if res.Code != 200 {
		t.Fatal(res.Code, res.Body.String())
	}
	var body map[string]any
	json.Unmarshal(res.Body.Bytes(), &body)
	if body["id"] == nil || body["kind"] == nil || body["image"] == nil {
		t.Fatal("incomplete public challenge")
	}
	req = httptest.NewRequest("POST", "/verify", bytes.NewBufferString(`{"purpose":"send_code","subject":"test@example.invalid","id":"`+body["id"].(string)+`","answer":{"x":-100,"y":-100,"angle":-100}}`))
	req.Header.Set("Content-Type", "application/json")
	res = httptest.NewRecorder()
	engine.ServeHTTP(res, req)
	if res.Code != 403 {
		t.Fatal("bad answer accepted", res.Code, res.Body.String())
	}
}
