package middleware

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateBucket struct {
	count     int
	resetTime time.Time
}

type rateLimitRule struct {
	prefix string
	limit  int
	window time.Duration
}

// RateLimit applies a small in-memory fixed-window limiter per client IP and path.
func RateLimit() gin.HandlerFunc {
	var mu sync.Mutex
	buckets := make(map[string]rateBucket)
	lastSweep := time.Now()
	defaultRule := rateLimitRule{limit: 240, window: time.Minute}
	rules := []rateLimitRule{
		{prefix: "/auth/", limit: 30, window: time.Minute},
		{prefix: "/vendor/auth/", limit: 30, window: time.Minute},
		{prefix: "/pay/", limit: 60, window: time.Minute},
		{prefix: "/cards/", limit: 60, window: time.Minute},
		{prefix: "/user/exchange", limit: 60, window: time.Minute},
	}

	return func(c *gin.Context) {
		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}
		if path == "/health" || strings.HasPrefix(path, "/swagger/") || path == "/openapi.json" || strings.HasPrefix(path, "/uploads/") {
			c.Next()
			return
		}
		rule := defaultRule
		for _, candidate := range rules {
			if strings.HasPrefix(path, candidate.prefix) || strings.HasPrefix(c.Request.URL.Path, candidate.prefix) {
				rule = candidate
				break
			}
		}

		now := time.Now()
		key := c.ClientIP() + "|" + path
		mu.Lock()
		if now.Sub(lastSweep) > time.Minute {
			for k, bucket := range buckets {
				if now.After(bucket.resetTime) {
					delete(buckets, k)
				}
			}
			lastSweep = now
		}
		bucket := buckets[key]
		if bucket.resetTime.IsZero() || now.After(bucket.resetTime) {
			bucket = rateBucket{resetTime: now.Add(rule.window)}
		}
		bucket.count++
		buckets[key] = bucket
		limited := bucket.count > rule.limit
		retryAfter := int(time.Until(bucket.resetTime).Seconds())
		mu.Unlock()

		if limited {
			if retryAfter < 1 {
				retryAfter = 1
			}
			c.Header("Retry-After", strconv.Itoa(retryAfter))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "请求过于频繁，请稍后再试"})
			return
		}
		c.Next()
	}
}
