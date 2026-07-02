package app

import (
	"context"
	"fmt"
	"log"

	_ "fanapi/docs"
	"fanapi/internal/cache"
	"fanapi/internal/config"
	"fanapi/internal/db"
	"fanapi/internal/handler"
	"fanapi/internal/mq"
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

	if err := db.Init(&cfg.DB, true); err != nil {
		return nil, fmt.Errorf("db: %w", err)
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
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
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
