package router

import (
	"fanapi/internal/handler"
	"fanapi/internal/middleware"

	"github.com/gin-gonic/gin"
)

func registerV1Routes(authed *gin.RouterGroup, deps Dependencies) {
	authed.GET("/v1/tasks", handler.ListUserTasks)
	authed.DELETE("/v1/tasks/history", handler.DeleteUserTaskHistory)
	authed.GET("/v1/tasks/:id", handler.GetTask)
	authed.GET("/v1/tasks/:id/billing", handler.GetTaskBilling)
	authed.GET("/v1/llm-logs", handler.UserListLLMLogs)
	authed.GET("/v1/llm-logs/:id", handler.UserGetLLMLog)
	authed.GET("/v1/conversations", handler.ListConversations)
	authed.POST("/v1/conversations", handler.SaveConversation)
	authed.DELETE("/v1/conversations/:id", handler.DeleteConversation)

	v1 := authed.Group("/v1")
	v1.Use(middleware.APIKeyOnly())
	{
		v1.GET("/models", handler.OpenAIModels)
		v1.POST("/chat/completions", handler.LLMProxy)
		v1.POST("/messages", handler.ClaudeProxy)
		v1.POST("/responses", handler.ResponsesProxy)
		v1.POST("/responses/compact", handler.ResponsesCompactProxy)
		v1.GET("/responses", handler.ResponsesWSProxy)
		v1.GET("/realtime", handler.RealtimeWSProxy)
		v1.POST("/gemini", handler.GeminiProxy)
		v1.POST("/estimate", handler.EstimateGenerationCost)
		v1.POST("/image", handler.CreateImageTask)
		v1.POST("/images/generations", handler.CreateOpenAIImageGenerations)
		v1.POST("/images/edits", handler.CreateOpenAIImageEdits)
		v1.POST("/video", handler.CreateVideoTask)
		v1.POST("/audio", handler.CreateAudioTask)
		v1.POST("/music", handler.CreateMusicTask)
	}

	v1beta := authed.Group("/v1beta")
	v1beta.Use(middleware.APIKeyOnly())
	{
		v1beta.POST("/models/*path", handler.GeminiNativeProxy)
	}
}
