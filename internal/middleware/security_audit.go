package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net"
	"strconv"
	"strings"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
)

// SecurityAudit records an allowlist of metadata, never bodies, query strings,
// cookies, authorization headers, passwords, verification codes or tokens.
// Install before authentication so denied requests are recorded as well.
func SecurityAudit() gin.HandlerFunc { return securityAudit(persistSecurityAudit) }

func securityAudit(write func(*model.AdminAuditLog)) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		route := c.FullPath()
		action := ""
		switch route {
		case "/auth/login":
			action = "security.login"
		case "/auth/forgot-password":
			action = "security.password_reset_request"
		case "/auth/reset-password":
			action = "security.password_reset"
		case "/user/password":
			action = "security.password_change"
		case "/admin/users/:id/password":
			action = "security.admin_password_reset"
		default:
			if strings.HasPrefix(route, "/admin/") {
				action = "security.admin_access"
			}
		}
		if action == "" {
			if c.GetString("security_network_policy") != "" {
				action = "security.website_network_denied"
			}
		}
		if action == "" {
			return
		}
		actor, _ := c.Get("user_id")
		actorID, _ := actor.(int64)
		targetID := int64(0)
		if strings.HasPrefix(route, "/admin/users/:id") {
			targetID, _ = strconv.ParseInt(c.Param("id"), 10, 64)
		} else if route == "/user/password" || route == "/auth/login" {
			targetID = actorID
		}
		peer, _, err := net.SplitHostPort(c.Request.RemoteAddr)
		if err != nil {
			peer = c.Request.RemoteAddr
		}
		var nonce [16]byte
		_, _ = rand.Read(nonce[:])
		status := c.Writer.Status()
		result := "failure"
		if status >= 200 && status < 300 {
			result = "success"
		}
		detail := model.JSON{
			"request_id": hex.EncodeToString(nonce[:]), "method": c.Request.Method,
			"route": route, "status": status, "result": result,
			"auth_type": c.GetString("auth_type"), "actor_role": c.GetString("role"),
			"account_input": auditText(c.GetString("security_account"), 254),
			"peer_ip":       auditText(peer, 128),
			// Forwarded values are evidence, not proof of the originating IP.
			"forwarded_for_unverified":    auditText(c.GetHeader("X-Forwarded-For"), 512),
			"cf_connecting_ip_unverified": auditText(c.GetHeader("CF-Connecting-IP"), 128),
		}
		if keyID, exists := c.Get("api_key_id"); exists {
			detail["api_key_id"] = keyID
		}
		if policy := c.GetString("security_network_policy"); policy != "" {
			detail["network_policy"] = policy
		}
		write(&model.AdminAuditLog{AdminID: actorID, Action: action,
			ResourceType: "security", ResourceID: targetID,
			Summary: c.Request.Method + " " + route + " " + result,
			Detail:  detail, IP: auditText(c.ClientIP(), 128),
			UA: auditText(c.Request.UserAgent(), 512), CreatedAt: time.Now()})
	}
}

func auditText(s string, limit int) string {
	r := []rune(strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, s))
	if len(r) > limit {
		r = r[:limit]
	}
	return string(r)
}

func persistSecurityAudit(event *model.AdminAuditLog) {
	if db.Engine != nil {
		if event.AdminID > 0 {
			var actor model.User
			if found, err := db.Engine.ID(event.AdminID).Cols("username", "email").Get(&actor); err == nil && found {
				event.Detail["actor_username"] = actor.Username
				if actor.Email != nil {
					event.AdminEmail = *actor.Email
				}
			}
		}
		if event.Action == "security.password_reset" && event.Detail["result"] == "success" {
			var target model.User
			if found, err := db.Engine.Where("email = ?", event.Detail["account_input"]).Cols("id").Get(&target); err == nil && found {
				event.ResourceID = target.ID
			}
		}
	}
	// Independent structured application log remains available if the DB insert fails.
	encoded, _ := json.Marshal(event)
	log.Printf("[security_audit] %s", encoded)
	if db.Engine == nil {
		log.Print("[security_audit_write_failed] database unavailable")
		return
	}
	if _, err := db.Engine.Insert(event); err != nil {
		// Do not print driver errors: they may include SQL or sensitive values.
		log.Printf("[security_audit_write_failed] request_id=%v", event.Detail["request_id"])
	}
}
