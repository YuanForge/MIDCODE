package router

import "github.com/gin-gonic/gin"

func registerAuthRoutes(r *gin.Engine, deps Dependencies) {
	auth := r.Group("/auth")
	{
		auth.POST("/send-code", deps.Auth.SendCode)
		auth.POST("/register", deps.Auth.Register)
		auth.POST("/login", deps.Auth.Login)
		auth.POST("/forgot-password", deps.Auth.ForgotPassword)
		auth.POST("/reset-password", deps.Auth.ResetPassword)
	}
}
