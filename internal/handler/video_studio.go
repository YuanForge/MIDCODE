package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"fanapi/internal/cache"
	"fanapi/internal/db"
	"fanapi/internal/middleware"
	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
)

type videoStudioSession struct {
	UserID  int64  `json:"user_id"`
	Version string `json:"version"`
}

func videoStudioVersion(user model.User) string {
	sum := sha256.Sum256([]byte(os.Getenv("TOONFLOW_HANDOFF_SECRET") + ":" + user.PasswordHash))
	return hex.EncodeToString(sum[:])
}

func videoStudioToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func videoStudioCacheKey(kind, token string) string {
	sum := sha256.Sum256([]byte(token))
	return "video-studio:" + kind + ":" + hex.EncodeToString(sum[:])
}

// The browser receives only a short-lived, one-use ticket, never API credentials.
func (h *AuthHandler) CreateVideoStudioHandoff(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if c.GetString("auth_type") != "jwt" || c.GetString("role") != "user" {
		c.Status(http.StatusForbidden)
		return
	}
	target, err := imageStudioURL(os.Getenv("TOONFLOW_URL"))
	if err != nil || len(os.Getenv("TOONFLOW_HANDOFF_SECRET")) < 32 || cache.Client == nil {
		c.JSON(503, gin.H{"error": "视频工作台暂未就绪"})
		return
	}
	uid := c.MustGet("user_id").(int64)
	var user model.User
	found, err := db.Engine.Where("id = ? AND is_active = true", uid).Get(&user)
	if err != nil || !found {
		c.Status(403)
		return
	}
	profiles, err := h.imageStudioProfiles(uid, nil)
	if err != nil || len(profiles) == 0 {
		c.JSON(400, gin.H{"error": "请先创建可用的 API 密钥"})
		return
	}
	token, err := videoStudioToken()
	if err != nil {
		c.Status(500)
		return
	}
	data, _ := json.Marshal(videoStudioSession{uid, videoStudioVersion(user)})
	if cache.Client.Set(c.Request.Context(), videoStudioCacheKey("ticket", token), data, time.Minute).Err() != nil {
		c.Status(503)
		return
	}
	target.Fragment = "midcode_code=" + token
	c.JSON(200, gin.H{"url": target.String()})
}

// Shared-secret endpoints are only for the isolated video gateway. Network
// policy also checks the original client IP forwarded by the trusted gateway.
func videoStudioGatewayRequest(c *gin.Context) bool {
	c.Header("Cache-Control", "no-store")
	if !imageStudioSecretMatches(c.GetHeader("X-Toonflow-Handoff-Secret"), os.Getenv("TOONFLOW_HANDOFF_SECRET")) {
		c.Status(403)
		return false
	}
	if !middleware.CheckWebsiteNetwork(c) {
		return false
	}
	if cache.Client == nil {
		c.Status(503)
		return false
	}
	return true
}

func videoStudioReadSession(c *gin.Context, kind string, consume bool) (videoStudioSession, bool) {
	var input struct {
		Token string `json:"token"`
	}
	var session videoStudioSession
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	if c.ShouldBindJSON(&input) != nil || len(input.Token) != 64 {
		c.Status(400)
		return session, false
	}
	if _, err := hex.DecodeString(input.Token); err != nil {
		c.Status(400)
		return session, false
	}
	var data []byte
	var err error
	key := videoStudioCacheKey(kind, input.Token)
	if consume {
		data, err = cache.Client.GetDel(c.Request.Context(), key).Bytes()
	} else {
		data, err = cache.Client.Get(c.Request.Context(), key).Bytes()
	}
	if err != nil || json.Unmarshal(data, &session) != nil {
		c.Status(401)
		return session, false
	}
	var user model.User
	found, err := db.Engine.Where("id = ? AND is_active = true", session.UserID).Get(&user)
	if err != nil {
		c.Status(503)
		return session, false
	}
	if !found || session.Version != videoStudioVersion(user) {
		c.Status(403)
		return session, false
	}
	return session, true
}

func (h *AuthHandler) RedeemVideoStudioHandoff(c *gin.Context) {
	if !videoStudioGatewayRequest(c) {
		return
	}
	session, ok := videoStudioReadSession(c, "ticket", true)
	if !ok {
		return
	}
	profiles, err := h.imageStudioProfiles(session.UserID, nil)
	if err != nil || len(profiles) == 0 {
		c.Status(403)
		return
	}
	grouped, err := listGroupedModelChannels()
	if err != nil {
		c.Status(503)
		return
	}
	entries := make([]gin.H, 0, len(profiles))
	for _, p := range profiles {
		var bindings []model.APIKeyModelGroup
		if db.Engine.Where("api_key_id = ?", p.KeyID).OrderBy("priority ASC, id ASC").Find(&bindings) != nil {
			c.Status(503)
			return
		}
		models := []gin.H{}
		seen := map[string]bool{}
		for _, b := range bindings {
			for _, item := range grouped {
				if item.Group.ID != b.GroupID || seen[item.RoutingModel] {
					continue
				}
				seen[item.RoutingModel] = true
				models = append(models, gin.H{"id": item.RoutingModel, "type": item.Channel.Type})
			}
		}
		entries = append(entries, gin.H{"keyId": p.KeyID, "name": p.Name, "apiKey": p.APIKey, "models": models})
	}
	token, err := videoStudioToken()
	if err != nil {
		c.Status(500)
		return
	}
	data, _ := json.Marshal(session)
	if cache.Client.Set(c.Request.Context(), videoStudioCacheKey("session", token), data, 12*time.Hour).Err() != nil {
		c.Status(503)
		return
	}
	c.JSON(200, gin.H{"userId": session.UserID, "session": token, "profiles": entries})
}

func (h *AuthHandler) ValidateVideoStudioSession(c *gin.Context) {
	if !videoStudioGatewayRequest(c) {
		return
	}
	session, ok := videoStudioReadSession(c, "session", false)
	if !ok {
		return
	}
	c.JSON(200, gin.H{"userId": session.UserID})
}
