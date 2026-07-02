package router

import (
	"fanapi/internal/middleware"

	"github.com/gin-gonic/gin"
)

func registerVendorRoutes(r *gin.Engine, deps Dependencies) {
	auth := r.Group("/vendor/auth")
	{
		auth.POST("/register", deps.Vendor.Register)
		auth.POST("/login", deps.Vendor.Login)
	}

	portal := r.Group("/vendor")
	portal.Use(middleware.VendorAuth(&deps.Config.Server))
	{
		portal.GET("/profile", deps.Vendor.GetProfile)
		portal.GET("/keys", deps.Vendor.GetPoolKeys)
		portal.POST("/keys", deps.Vendor.SubmitKey)
		portal.GET("/pools", deps.Vendor.GetSubmittablePools)
	}
}
