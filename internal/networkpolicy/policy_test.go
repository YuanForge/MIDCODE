package networkpolicy

import (
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRanges(t *testing.T) {
	r, err := Parse(strings.NewReader("# snapshot\n3.8.7.9/16\n2600:1f00::/24\n3.8.0.0/16\n216.12.193.9\n"))
	if err != nil || r.Count() != 3 {
		t.Fatalf("parse: %v %v", r, err)
	}
	for ip, want := range map[string]bool{"3.8.0.0": true, "3.8.255.255": true, "3.9.0.0": false, "::ffff:3.8.1.1": true, "2600:1fff::1": true, "2601::1": false, "192.168.1.1": false} {
		if got := r.Contains(netip.MustParseAddr(ip)); got != want {
			t.Errorf("%s got %v", ip, got)
		}
	}
	allow, _ := Parse(strings.NewReader("3.8.1.1/32"))
	if !r.Contains(netip.MustParseAddr("216.12.193.9")) || r.Contains(netip.MustParseAddr("216.12.193.10")) {
		t.Fatal("single address not scoped to host")
	}
	p := &Policy{Deny: r, Allow: allow}
	if p.Blocked("3.8.1.1") || !p.Blocked("3.8.1.2") || p.Blocked("invalid") {
		t.Fatal("exception mismatch")
	}
	for _, bad := range []string{"garbage", "0.0.0.0/0", "::/0", "::ffff:3.8.1.1/128"} {
		if _, err := Parse(strings.NewReader(bad)); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
}
func TestEnabledRequiresValidList(t *testing.T) {
	t.Setenv("FANAPI_DATACENTER_GUARD", "1")
	t.Setenv("FANAPI_DATACENTER_RANGES", filepath.Join(t.TempDir(), "missing"))
	if _, err := FromEnv(); err == nil {
		t.Fatal("missing list accepted")
	}
	path := filepath.Join(t.TempDir(), "list")
	if err := os.WriteFile(path, []byte("# empty\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("FANAPI_DATACENTER_RANGES", path)
	if _, err := FromEnv(); err == nil {
		t.Fatal("empty list accepted")
	}
	t.Setenv("FANAPI_DATACENTER_GUARD", "0")
	if p, err := FromEnv(); p != nil || err != nil {
		t.Fatal("disabled policy loaded")
	}
}

func TestBundledSnapshot(t *testing.T) {
	f, err := os.Open("../../data/datacenter/ranges.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	r, err := Parse(f)
	if err != nil {
		t.Fatal(err)
	}
	if r.Count() < 1000 {
		t.Fatalf("unexpectedly small snapshot: %d", r.Count())
	}
	if !r.Contains(netip.MustParseAddr("3.5.140.1")) || !r.Contains(netip.MustParseAddr("216.12.193.9")) {
		t.Fatal("known hosting ranges missing")
	}
	if r.Contains(netip.MustParseAddr("203.0.113.72")) {
		t.Fatal("documentation range classified as hosting")
	}
	t.Logf("validated snapshot: %d unique ranges", r.Count())
}
