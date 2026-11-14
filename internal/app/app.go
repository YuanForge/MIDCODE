package app

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	_ "fanapi/docs"
	"fanapi/internal/cache"
	"fanapi/internal/config"
	"fanapi/internal/db"
	"fanapi/internal/handler"
	"fanapi/internal/middleware"
	"fanapi/internal/mq"
	"fanapi/internal/networkpolicy"
	"fanapi/internal/router"
	"fanapi/pkg/mailer"

	"github.com/gin-gonic/gin"
)

type App struct {
	cfg    *config.Config
	engine *gin.Engine
}

func Run() error {
	app, err := New()
	if err != nil {
		return err
	}
	return app.Run()
}

func New() (*App, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}

	// Rolling code-only deployments can reuse an already migrated schema.
	// Sync2 may otherwise rebuild custom indexes while the old API is serving.
	if err := db.Init(&cfg.DB, os.Getenv("FANAPI_SKIP_MIGRATIONS") != "1"); err != nil {
		return nil, fmt.Errorf("db: %w", err)
	}
	if _, err := db.Engine.Exec("DELETE FROM api_key_model_groups WHERE group_id IN (SELECT id FROM model_groups WHERE is_active = false)"); err != nil {
		return nil, fmt.Errorf("remove disabled model group bindings: %w", err)
	}
	log.Println("db connected")

	if err := cache.Init(&cfg.Redis); err != nil {
		return nil, fmt.Errorf("redis: %w", err)
	}
	log.Println("redis connected")

	clearChannelCache()

	if err := mq.Init(&cfg.NATS); err != nil {
		return nil, fmt.Errorf("nats: %w", err)
	}
	log.Println("nats connected")
	if err := mq.EnsureStream(); err != nil {
		return nil, fmt.Errorf("nats ensure stream: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer func() {
		if err != nil {
			cancel()
		}
	}()
	if err := startJobs(ctx, cfg); err != nil {
		cancel()
		return nil, err
	}

	m := mailer.New(&cfg.SMTP)
	deps := router.Dependencies{
		Config:   cfg,
		Auth:     handler.NewAuthHandler(&cfg.Server, m),
		Vendor:   handler.NewVendorHandler(&cfg.Server),
		Reseller: handler.NewResellerHandler(cfg),
	}

	r := gin.New()
	// Exact deployment proxy/CDN hops; never trust arbitrary forwarded headers.
	if proxies := os.Getenv("FANAPI_CAPTCHA_TRUSTED_PROXIES"); proxies != "" {
		cfg.Server.TrustedProxies = strings.Split(proxies, ",")
	}
	r.RemoteIPHeaders = []string{"X-Forwarded-For"}
	if len(cfg.Server.TrustedProxies) > 0 {
		if err := r.SetTrustedProxies(cfg.Server.TrustedProxies); err != nil {
			return nil, fmt.Errorf("invalid trusted proxies: %w", err)
		}
	} else if err := r.SetTrustedProxies(nil); err != nil {
		return nil, fmt.Errorf("disable trusted proxies failed: %w", err)
	}
	r.Use(gin.Logger())
	r.Use(middleware.SecurityAudit())
	r.Use(gin.Recovery())
	r.Use(middleware.RateLimit())
	networkPolicy, err := networkpolicy.FromEnv()
	if err != nil {
		return nil, fmt.Errorf("website network policy: %w", err)
	}
	networkGuard, err := middleware.WebsiteNetwork(networkPolicy, cfg.Server.TrustedProxies)
	if err != nil {
		return nil, fmt.Errorf("website proxy configuration: %w", err)
	}
	r.Use(networkGuard)
	if networkPolicy != nil {
		log.Printf("website datacenter policy enabled: %d ranges, %d exceptions", networkPolicy.Deny.Count(), networkPolicy.Allow.Count())
	}
	r.Use(func(c *gin.Context) {
		c.Set("app_config", cfg)
		c.Next()
	})
	r.Static("/uploads", "uploads")
	router.Register(r, deps)

	return &App{cfg: cfg, engine: r}, nil
}

func (a *App) Run() error {
	addr := fmt.Sprintf(":%d", a.cfg.Server.Port)
	log.Printf("server starting on %s", addr)
	return a.engine.Run(addr)
}

func clearChannelCache() {
	keys, err := cache.Client.Keys(context.Background(), "channel:*").Result()
	if err != nil || len(keys) == 0 {
		return
	}
	cache.Client.Del(context.Background(), keys...)
	log.Printf("cleared %d channel cache keys on startup", len(keys))
}
