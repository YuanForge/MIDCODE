package upstream

import (
	"context"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

type ipResolver func(context.Context, string) ([]netip.Addr, error)

// ValidatePoolKeyBaseURL normalizes a vendor/key-level upstream URL and rejects
// targets that could reach local or private networks.
func ValidatePoolKeyBaseURL(ctx context.Context, raw string) (string, error) {
	return validatePoolKeyBaseURL(ctx, raw, defaultResolveHostIPs)
}

func validatePoolKeyBaseURL(ctx context.Context, raw string, resolve ipResolver) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("base_url is required")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("base_url must be a valid absolute URL")
	}
	if strings.ToLower(parsed.Scheme) != "https" {
		return "", fmt.Errorf("base_url must use https")
	}
	if parsed.User != nil {
		return "", fmt.Errorf("base_url must not contain credentials")
	}
	if parsed.Fragment != "" {
		return "", fmt.Errorf("base_url must not contain a fragment")
	}

	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return "", fmt.Errorf("base_url host is required")
	}
	if err := validatePublicHost(ctx, host, resolve); err != nil {
		return "", err
	}

	parsed.Scheme = "https"
	parsed.Host = strings.ToLower(parsed.Host)
	return parsed.String(), nil
}

func validatePublicHost(ctx context.Context, host string, resolve ipResolver) error {
	lowerHost := strings.TrimSuffix(strings.ToLower(host), ".")
	if lowerHost == "localhost" ||
		strings.HasSuffix(lowerHost, ".localhost") ||
		strings.HasSuffix(lowerHost, ".local") ||
		strings.HasSuffix(lowerHost, ".internal") ||
		strings.HasSuffix(lowerHost, ".lan") {
		return fmt.Errorf("base_url must point to a public host")
	}
	if strings.Contains(lowerHost, "%") {
		return fmt.Errorf("base_url host is invalid")
	}

	if addr, err := netip.ParseAddr(lowerHost); err == nil {
		if isBlockedAddr(addr) {
			return fmt.Errorf("base_url must point to a public host")
		}
		return nil
	}

	lookupCtx := ctx
	cancel := func() {}
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		lookupCtx, cancel = context.WithTimeout(ctx, 5*time.Second)
	}
	defer cancel()

	addrs, err := resolve(lookupCtx, lowerHost)
	if err != nil || len(addrs) == 0 {
		return fmt.Errorf("base_url host could not be resolved")
	}
	for _, addr := range addrs {
		if isBlockedAddr(addr) {
			return fmt.Errorf("base_url must point to a public host")
		}
	}
	return nil
}

func defaultResolveHostIPs(ctx context.Context, host string) ([]netip.Addr, error) {
	resolved, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	addrs := make([]netip.Addr, 0, len(resolved))
	for _, item := range resolved {
		if addr, ok := netip.AddrFromSlice(item.IP); ok {
			addrs = append(addrs, addr.Unmap())
		}
	}
	return addrs, nil
}

func isBlockedAddr(addr netip.Addr) bool {
	addr = addr.Unmap()
	if !addr.IsValid() ||
		addr.IsLoopback() ||
		addr.IsPrivate() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsMulticast() ||
		addr.IsUnspecified() {
		return true
	}
	for _, prefix := range blockedPrefixes {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

var blockedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("224.0.0.0/4"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("fe80::/10"),
	netip.MustParsePrefix("ff00::/8"),
}

// BaseURLForPoolKey returns the key-level upstream URL when present.
func BaseURLForPoolKey(channelBaseURL, poolKeyBaseURL string) string {
	if override := strings.TrimSpace(poolKeyBaseURL); override != "" {
		return override
	}
	return channelBaseURL
}

// RewriteURLWithBaseOverride moves a channel-level URL onto the key-level base
// URL when both channel URLs share the same origin. It preserves query strings
// and only rewrites the path prefix when the query URL is based on baseURL.
func RewriteURLWithBaseOverride(rawURL, channelBaseURL, poolKeyBaseURL string) string {
	override := strings.TrimSpace(poolKeyBaseURL)
	if override == "" {
		return rawURL
	}
	raw := strings.TrimSpace(rawURL)
	base := strings.TrimSpace(channelBaseURL)
	if raw == "" {
		return rawURL
	}
	if raw == base {
		return override
	}

	rawParsed, rawErr := url.Parse(raw)
	baseParsed, baseErr := url.Parse(base)
	overrideParsed, overrideErr := url.Parse(override)
	if rawErr != nil || baseErr != nil || overrideErr != nil ||
		rawParsed.Scheme == "" || rawParsed.Host == "" ||
		baseParsed.Scheme == "" || baseParsed.Host == "" ||
		overrideParsed.Scheme == "" || overrideParsed.Host == "" {
		return rawURL
	}

	if !sameOrigin(rawParsed, baseParsed) {
		return rawURL
	}

	rawParsed.Scheme = overrideParsed.Scheme
	rawParsed.Host = overrideParsed.Host
	if suffix, ok := pathSuffixAfterPrefix(rawParsed.Path, baseParsed.Path); ok {
		rawParsed.Path = joinURLPath(overrideParsed.Path, suffix)
	}
	return restoreTemplateBraces(rawParsed.String())
}

func sameOrigin(a, b *url.URL) bool {
	return strings.EqualFold(a.Scheme, b.Scheme) && strings.EqualFold(a.Host, b.Host)
}

func pathSuffixAfterPrefix(path, prefix string) (string, bool) {
	if prefix == "" {
		prefix = "/"
	}
	if path == prefix {
		return "", true
	}
	if prefix != "/" && strings.HasPrefix(path, strings.TrimRight(prefix, "/")+"/") {
		return strings.TrimPrefix(path, strings.TrimRight(prefix, "/")), true
	}
	return "", false
}

func joinURLPath(basePath, suffix string) string {
	if suffix == "" {
		if basePath == "" {
			return "/"
		}
		return basePath
	}
	if basePath == "" || basePath == "/" {
		return suffix
	}
	return strings.TrimRight(basePath, "/") + suffix
}

func restoreTemplateBraces(value string) string {
	value = strings.ReplaceAll(value, "%7B", "{")
	value = strings.ReplaceAll(value, "%7b", "{")
	value = strings.ReplaceAll(value, "%7D", "}")
	value = strings.ReplaceAll(value, "%7d", "}")
	return value
}
