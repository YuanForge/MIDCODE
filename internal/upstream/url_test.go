package upstream

import (
	"context"
	"errors"
	"net/netip"
	"testing"
)

func TestValidatePoolKeyBaseURLAcceptsPublicHTTPS(t *testing.T) {
	got, err := validatePoolKeyBaseURL(context.Background(), " https://API.Example.com/v1/images ", fakeResolver("api.example.com", "104.26.11.94"))
	if err != nil {
		t.Fatalf("expected valid URL, got error: %v", err)
	}
	if got != "https://api.example.com/v1/images" {
		t.Fatalf("unexpected normalized URL: %q", got)
	}
}

func TestValidatePoolKeyBaseURLRejectsHTTP(t *testing.T) {
	_, err := validatePoolKeyBaseURL(context.Background(), "http://api.example.com/v1", fakeResolver("api.example.com", "104.26.11.94"))
	if err == nil {
		t.Fatal("expected http URL to be rejected")
	}
}

func TestValidatePoolKeyBaseURLRejectsLocalhost(t *testing.T) {
	_, err := validatePoolKeyBaseURL(context.Background(), "https://localhost/v1", fakeResolver("localhost", "127.0.0.1"))
	if err == nil {
		t.Fatal("expected localhost to be rejected")
	}
}

func TestValidatePoolKeyBaseURLRejectsPrivateIPLiteral(t *testing.T) {
	_, err := validatePoolKeyBaseURL(context.Background(), "https://10.1.2.3/v1", fakeResolver())
	if err == nil {
		t.Fatal("expected private IP literal to be rejected")
	}
}

func TestValidatePoolKeyBaseURLRejectsPrivateDNSResult(t *testing.T) {
	_, err := validatePoolKeyBaseURL(context.Background(), "https://api.example.com/v1", fakeResolver("api.example.com", "192.168.1.10"))
	if err == nil {
		t.Fatal("expected private DNS result to be rejected")
	}
}

func TestRewriteURLWithBaseOverrideReplacesPathPrefix(t *testing.T) {
	got := RewriteURLWithBaseOverride(
		"https://api.old.com/v1/images/generations/{id}?a=1",
		"https://api.old.com/v1/images/generations",
		"https://api.new.com/v1/images/generations",
	)
	want := "https://api.new.com/v1/images/generations/{id}?a=1"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestRewriteURLWithBaseOverrideKeepsUnrelatedExternalURL(t *testing.T) {
	got := RewriteURLWithBaseOverride(
		"https://storage.old.com/file",
		"https://api.old.com/v1/images/generations",
		"https://api.new.com/v1/images/generations",
	)
	want := "https://storage.old.com/file"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func fakeResolver(values ...string) ipResolver {
	table := map[string][]netip.Addr{}
	for i := 0; i+1 < len(values); i += 2 {
		table[values[i]] = append(table[values[i]], netip.MustParseAddr(values[i+1]))
	}
	return func(_ context.Context, host string) ([]netip.Addr, error) {
		if addrs, ok := table[host]; ok {
			return addrs, nil
		}
		return nil, errors.New("not found")
	}
}
