package captcha

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// ResolveIP only walks X-Forwarded-For through explicitly trusted hops, from right
// to left. X-Real-IP and CF-Connecting-IP supplied by arbitrary clients are ignored.
func ResolveIP(r *http.Request, trusted []netip.Prefix) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return ""
	}
	peer = peer.Unmap()
	isTrusted := func(ip netip.Addr) bool {
		for _, p := range trusted {
			if p.Contains(ip) {
				return true
			}
		}
		return false
	}
	if !isTrusted(peer) {
		return peer.String()
	}
	parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(parts) - 1; i >= 0; i-- {
		ip, e := netip.ParseAddr(strings.TrimSpace(parts[i]))
		if e != nil {
			return peer.String()
		}
		ip = ip.Unmap()
		if !isTrusted(ip) {
			return ip.String()
		}
	}
	// All-trusted or missing chains cannot establish a public end-user identity.
	return peer.String()
}
func PublicIP(ip string) bool {
	a, e := netip.ParseAddr(ip)
	return e == nil && a.IsGlobalUnicast() && !a.IsPrivate() && !a.IsLoopback()
}
