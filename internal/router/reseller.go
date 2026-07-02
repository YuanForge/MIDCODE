package router

import (
	"fanapi/internal/middleware"

	"github.com/gin-gonic/gin"
)

func registerResellerRoutes(r *gin.Engine, deps Dependencies) {
	auth := r.Group("/reseller/auth")
	{
		auth.POST("/login", deps.Reseller.Login)
	}

	portal := r.Group("/reseller")
	portal.Use(middleware.ResellerAuth(&deps.Config.Server))
	{
		portal.GET("/profile", deps.Reseller.GetProfile)
		portal.GET("/keys", deps.Reseller.ListKeys)
		portal.POST("/keys", deps.Reseller.CreateKey)
		portal.GET("/sites", deps.Reseller.ListSites)
		portal.POST("/sites", deps.Reseller.CreateSite)
		portal.GET("/sites/:id/build-progress", deps.Reseller.GetBuildProgress)
	}
}
