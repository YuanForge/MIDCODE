package router

import (
	"fanapi/internal/config"
	"fanapi/internal/handler"
	"fanapi/internal/middleware"

	"github.com/gin-gonic/gin"
)

type Dependencies struct {
	Config   *config.Config
	Auth     *handler.AuthHandler
	Vendor   *handler.VendorHandler
	Reseller *handler.ResellerHandler
}

func Register(r *gin.Engine, deps Dependencies) {
	r.GET("/v1/bot/users/:id/financial-summary", handler.BotUserFinancialSummary)
	r.GET("/v1/bot/qq/:qq/financial-summary", handler.BotUserFinancialSummary)
	r.POST("/v1/bot/qq/confirm-binding", handler.ConfirmQQBinding)
	r.GET("/v1/bot/leaderboard/daily", handler.BotDailyLeaderboard)
	registerPublicRoutes(r, deps)
	registerAuthRoutes(r, deps)
	registerVendorRoutes(r, deps)
	registerResellerRoutes(r, deps)

	authed := r.Group("/")
	authed.Use(middleware.Auth(&deps.Config.Server))
	{
		registerUserRoutes(authed, deps)
		registerAdminRoutes(authed, deps)
		registerV1Routes(authed, deps)
	}
}
