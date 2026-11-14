package middleware

import (
	"net/http"
	"net/netip"
	"strings"

	"fanapi/internal/captcha"
	"fanapi/internal/networkpolicy"
	"github.com/gin-gonic/gin"
)

const websiteNetworkKey = "website_network_policy"

type websiteNetwork struct {
	policy  *networkpolicy.Policy
	proxies []netip.Prefix
}

// WebsiteNetwork protects website-only entry points, regardless of supplied
// credentials. Model API routes are deliberately not selected by path prefix.
func WebsiteNetwork(policy *networkpolicy.Policy, proxyCIDRs []string) (gin.HandlerFunc, error) {
	n := &websiteNetwork{policy: policy}
	for _, cidr := range proxyCIDRs {
		p, err := netip.ParsePrefix(strings.TrimSpace(cidr))
		if err != nil {
			if ip, ipErr := netip.ParseAddr(strings.TrimSpace(cidr)); ipErr == nil {
				p, err = netip.PrefixFrom(ip, ip.BitLen()), nil
			}
		}
		if err != nil {
			return nil, err
		}
		n.proxies = append(n.proxies, p)
	}
	return func(c *gin.Context) {
		c.Set(websiteNetworkKey, n)
		path := c.Request.URL.Path
		website := strings.HasPrefix(path, "/auth/") || strings.HasPrefix(path, "/user/") || strings.HasPrefix(path, "/upload/") || path == "/public/image-studio/redeem" || path == "/pay/order/status" || (strings.HasPrefix(path, "/pay/") && strings.HasSuffix(path, "/create"))
		if website && !CheckWebsiteNetwork(c) {
			return
		}
		c.Next()
	}, nil
}

// Called on verified website JWTs before a selected API key can change their
// auth_type to jwt_with_key. A JWT must not bypass the restriction via /v1.
func CheckWebsiteNetwork(c *gin.Context) bool {
	value, exists := c.Get(websiteNetworkKey)
	if !exists {
		return true
	}
	n := value.(*websiteNetwork)
	if n.policy == nil {
		return true
	}
	ip := captcha.ResolveIP(c.Request, n.proxies)
	if !n.policy.Blocked(ip) {
		return true
	}
	c.Set("security_network_policy", "datacenter_blocked")
	c.Header("Cache-Control", "no-store")
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
		"code":  "DATACENTER_IP_BLOCKED",
		"error": "当前网络属于机房或云服务器网络，暂不支持网站登录和账号操作。请切换家庭宽带或手机网络；模型 API 仍可使用 API Key 正常调用。",
	})
	return false
}
