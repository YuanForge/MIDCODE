package handler

import (
	"context"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const adminPingTarget = "sub.midaccs.com"

var adminPingSlots = make(chan struct{}, 4)
var pingRTTPattern = regexp.MustCompile(`([=<])\s*([0-9]+(?:[.,][0-9]+)?)\s*ms`)

func parsePingRTT(output string) (float64, bool, bool) {
	m := pingRTTPattern.FindStringSubmatch(output)
	if m == nil {
		return 0, false, false
	}
	ms, err := strconv.ParseFloat(strings.ReplaceAll(m[2], ",", "."), 64)
	return ms, m[1] == "<", err == nil
}

// GetAdminServerPing runs one ICMP probe only while its HTTP request is alive.
// The target is fixed: callers cannot use this endpoint to scan arbitrary hosts.
func GetAdminServerPing(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	select {
	case adminPingSlots <- struct{}{}:
		defer func() { <-adminPingSlots }()
	default:
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "检测繁忙，请稍后重试"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	args := []string{"-n", "-c", "1", "-W", "2", adminPingTarget}
	if runtime.GOOS == "windows" {
		args = []string{"-n", "1", "-w", "2000", adminPingTarget}
	}
	cmd := exec.CommandContext(ctx, "ping", args...)
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	output, err := cmd.CombinedOutput()
	if c.Request.Context().Err() != nil {
		return
	}
	result := gin.H{"target": adminPingTarget, "status": "error", "latency_ms": nil, "less_than": false, "checked_at": time.Now().UTC().Format(time.RFC3339)}
	if ms, less, ok := parsePingRTT(string(output)); err == nil && ok {
		result["status"], result["latency_ms"], result["less_than"] = "ok", ms, less
	} else if ctx.Err() != nil {
		result["status"], result["message"] = "timeout", "检测超时（3 秒）"
	} else if _, ok := err.(*exec.Error); ok {
		result["message"] = "服务器未安装 ping 工具"
	} else {
		result["message"] = "未收到 ICMP 回应或无法执行 ping，请检查网络与 ICMP 权限"
	}
	c.JSON(http.StatusOK, result)
}
