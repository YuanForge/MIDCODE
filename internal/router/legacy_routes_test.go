package router

import (
	"testing"

	"fanapi/internal/config"
	"fanapi/internal/handler"

	"github.com/gin-gonic/gin"
)

func TestRegisterOmitsRetiredResellerRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{}
	engine := gin.New()
	Register(engine, Dependencies{
		Config: cfg,
		Auth:   handler.NewAuthHandler(&cfg.Server, nil),
		Vendor: handler.NewVendorHandler(&cfg.Server),
	})

	retired := map[string]struct{}{
		"POST /reseller/auth/login":                      {},
		"GET /reseller/profile":                          {},
		"GET /reseller/keys":                             {},
		"POST /reseller/keys":                            {},
		"GET /reseller/sites":                            {},
		"POST /reseller/sites":                           {},
		"GET /reseller/sites/:id/build-progress":         {},
		"GET /reseller/platform/channels":                {},
		"GET /admin/resellers":                           {},
		"POST /admin/resellers":                          {},
		"PATCH /admin/resellers/:id":                     {},
		"GET /admin/reseller-sites":                      {},
		"GET /admin/reseller-site-build-jobs":            {},
		"POST /admin/reseller-site-build-jobs/:id/retry": {},
	}

	for _, route := range engine.Routes() {
		key := route.Method + " " + route.Path
		if _, found := retired[key]; found {
			t.Errorf("retired route is still registered: %s", key)
		}
	}
}
