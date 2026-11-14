// Package networkpolicy performs offline hosting-network classification.
package networkpolicy

import (
	"bufio"
	"fmt"
	"io"
	"net/netip"
	"os"
	"sort"
	"strings"
)

type Ranges struct {
	entries map[netip.Prefix]struct{}
	sizes   []int
}

func Parse(r io.Reader) (*Ranges, error) {
	out := &Ranges{entries: map[netip.Prefix]struct{}{}}
	sizes := map[int]bool{}
	scanner := bufio.NewScanner(io.LimitReader(r, 32<<20))
	line := 0
	for scanner.Scan() {
		line++
		text := strings.TrimSpace(strings.SplitN(scanner.Text(), "#", 2)[0])
		if text == "" {
			continue
		}
		p, err := netip.ParsePrefix(text)
		if err != nil {
			if ip, ipErr := netip.ParseAddr(text); ipErr == nil {
				p, err = netip.PrefixFrom(ip, ip.BitLen()), nil
			}
		}
		if err != nil || p.Bits() == 0 || p.Addr().Is4In6() {
			return nil, fmt.Errorf("invalid network at line %d", line)
		}
		p = p.Masked()
		out.entries[p] = struct{}{}
		sizes[p.Bits()] = true
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	for bits := range sizes {
		out.sizes = append(out.sizes, bits)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(out.sizes)))
	return out, nil
}
func (r *Ranges) Contains(ip netip.Addr) bool {
	if r == nil || !ip.IsValid() {
		return false
	}
	ip = ip.Unmap()
	for _, bits := range r.sizes {
		if bits > ip.BitLen() {
			continue
		}
		if _, ok := r.entries[netip.PrefixFrom(ip, bits).Masked()]; ok {
			return true
		}
	}
	return false
}
func (r *Ranges) Count() int {
	if r == nil {
		return 0
	}
	return len(r.entries)
}

type Policy struct{ Deny, Allow *Ranges }

func (p *Policy) Blocked(ip string) bool {
	if p == nil {
		return false
	}
	addr, err := netip.ParseAddr(ip)
	return err == nil && !p.Allow.Contains(addr) && p.Deny.Contains(addr)
}

// Disabled unless explicitly configured. An enabled but missing/invalid list
// fails startup so a broken candidate cannot silently remove enforcement.
func FromEnv() (*Policy, error) {
	if os.Getenv("FANAPI_DATACENTER_GUARD") != "1" {
		return nil, nil
	}
	f, err := os.Open(os.Getenv("FANAPI_DATACENTER_RANGES"))
	if err != nil {
		return nil, fmt.Errorf("datacenter list: %w", err)
	}
	defer f.Close()
	deny, err := Parse(f)
	if err != nil {
		return nil, err
	}
	if deny.Count() == 0 {
		return nil, fmt.Errorf("empty datacenter list")
	}
	allow, err := Parse(strings.NewReader(strings.ReplaceAll(os.Getenv("FANAPI_DATACENTER_ALLOW"), ",", "\n")))
	if err != nil {
		return nil, fmt.Errorf("datacenter exceptions: %w", err)
	}
	return &Policy{Deny: deny, Allow: allow}, nil
}
