package handler

import (
	"fanapi/internal/cache"
	"fanapi/internal/captcha"
	"fanapi/internal/config"
	"fanapi/pkg/mailer"
	"os"
)

type AuthHandler struct {
	captcha *captcha.Service
	cfg     *config.ServerConfig
	mailer  *mailer.Mailer
}

func NewAuthHandler(cfg *config.ServerConfig, m *mailer.Mailer) *AuthHandler {
	security, err := captcha.New(cache.Client, cfg.JWTSecret, os.Getenv("FANAPI_CAPTCHA_TRUSTED_PROXIES"))
	if err != nil {
		panic("invalid captcha trusted proxies configuration")
	}
	return &AuthHandler{cfg: cfg, mailer: m, captcha: security}
}
