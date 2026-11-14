package captcha

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/wenlng/go-captcha/v2/click"
	"github.com/wenlng/go-captcha/v2/rotate"
	"github.com/wenlng/go-captcha/v2/slide"
)

func testService(t *testing.T) (*Service, *miniredis.Miniredis) {
	t.Helper()
	r := miniredis.RunT(t)
	c := redis.NewClient(&redis.Options{Addr: r.Addr()})
	t.Cleanup(func() { c.Close() })
	s, e := New(c, "test-secret", "")
	if e != nil {
		t.Fatal(e)
	}
	return s, r
}
func solutionAnswer(t *testing.T, c challenge) Answer {
	t.Helper()
	a := Answer{}
	switch c.Kind {
	case "slide", "drag":
		var d slide.Block
		json.Unmarshal(c.Solution, &d)
		a.X = d.X
		a.Y = d.Y
	case "rotate":
		var d rotate.Block
		json.Unmarshal(c.Solution, &d)
		a.Angle = 360 - d.Angle
	default:
		var d map[int]*click.Dot
		json.Unmarshal(c.Solution, &d)
		for i := 0; i < len(d); i++ {
			a.Points = append(a.Points, Point{d[i].X + d[i].Width/2, d[i].Y + d[i].Height/2})
		}
	}
	return a
}
func issueAnswer(t *testing.T, s *Service) (PublicData, Answer) {
	t.Helper()
	p, e := s.Issue(context.Background(), "8.8.4.4", "login", "alice")
	if e != nil {
		t.Fatal(e)
	}
	raw, _ := s.redis.Get(context.Background(), prefix+"challenge:"+p.ID).Bytes()
	var c challenge
	if json.Unmarshal(raw, &c) != nil {
		t.Fatal("invalid server challenge")
	}
	return p, solutionAnswer(t, c)
}
func TestAllGeneratorsAndAnswers(t *testing.T) {
	for i, k := range kinds {
		t.Run(k, func(t *testing.T) {
			out, raw, e := generateKind(i)
			if e != nil {
				t.Fatal(e)
			}
			if !strings.HasPrefix(out.Image, "data:image/") || !strings.HasPrefix(out.Thumb, "data:image/") {
				t.Fatal("invalid image")
			}
			c := challenge{Kind: k, Solution: raw}
			if !validate(k, raw, solutionAnswer(t, c)) {
				t.Fatal("correct answer rejected")
			}
			if validate(k, raw, Answer{X: -100, Y: -100, Angle: -100}) {
				t.Fatal("invalid answer accepted")
			}
			pub, _ := json.Marshal(out)
			if strings.Contains(string(pub), "Solution") || strings.Contains(string(pub), `"angle"`) {
				t.Fatal("solution exposed")
			}
		})
	}
}
func TestChallengeAndGrantSingleUse(t *testing.T) {
	s, _ := testService(t)
	p, a := issueAnswer(t, s)
	ctx := context.Background()
	grant, e := s.Verify(ctx, "8.8.4.4", "login", "alice", p.ID, a)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Verify(ctx, "8.8.4.4", "login", "alice", p.ID, a); !errors.Is(e, ErrInvalid) {
		t.Fatal("replayed challenge", e)
	}
	var ok atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if s.Consume(ctx, "8.8.4.4", "login", "alice", grant) == nil {
				ok.Add(1)
			}
		}()
	}
	wg.Wait()
	if ok.Load() != 1 {
		t.Fatal("grant accepted more than once", ok.Load())
	}
}
func TestBindingAndExpiry(t *testing.T) {
	for _, field := range []string{"ip", "purpose", "subject", "expiry", "answer"} {
		t.Run(field, func(t *testing.T) {
			s, r := testService(t)
			p, a := issueAnswer(t, s)
			ip, purpose, subject := "8.8.4.4", "login", "alice"
			switch field {
			case "ip":
				ip = "1.1.1.1"
			case "purpose":
				purpose = "send_code"
			case "subject":
				subject = "bob"
			case "expiry":
				r.FastForward(3 * time.Minute)
			case "answer":
				a = Answer{X: -100, Y: -100, Angle: -100}
			}
			if _, e := s.Verify(context.Background(), ip, purpose, subject, p.ID, a); !errors.Is(e, ErrInvalid) {
				t.Fatal("bad binding accepted", e)
			}
			if _, e := s.Verify(context.Background(), "8.8.4.4", "login", "alice", p.ID, a); !errors.Is(e, ErrInvalid) {
				t.Fatal("failed attempt not consumed")
			}
		})
	}
}
func TestGrantBoundAndExpired(t *testing.T) {
	for _, field := range []string{"ip", "purpose", "subject", "expiry"} {
		t.Run(field, func(t *testing.T) {
			s, r := testService(t)
			p, a := issueAnswer(t, s)
			ctx := context.Background()
			grant, e := s.Verify(ctx, "8.8.4.4", "login", "alice", p.ID, a)
			if e != nil {
				t.Fatal(e)
			}
			ip, purpose, subject := "8.8.4.4", "login", "alice"
			switch field {
			case "ip":
				ip = "1.1.1.1"
			case "purpose":
				purpose = "send_code"
			case "subject":
				subject = "bob"
			case "expiry":
				r.FastForward(3 * time.Minute)
			}
			if e = s.Consume(ctx, ip, purpose, subject, grant); !errors.Is(e, ErrInvalid) {
				t.Fatal("invalid grant accepted", e)
			}
		})
	}
}
func TestFamiliarAccountAndPasswordVersion(t *testing.T) {
	s, r := testService(t)
	ctx := context.Background()
	if ok, _ := s.Familiar(ctx, "8.8.4.4", "1", "v1"); ok {
		t.Fatal("new IP familiar")
	}
	s.Remember(ctx, "8.8.4.4", "1", "v1")
	if ok, e := s.Familiar(ctx, "8.8.4.4", "1", "v1"); !ok || e != nil {
		t.Fatal(e)
	}
	for _, v := range [][3]string{{"8.8.8.8", "1", "v1"}, {"8.8.4.4", "2", "v1"}, {"8.8.4.4", "1", "v2"}} {
		if ok, _ := s.Familiar(ctx, v[0], v[1], v[2]); ok {
			t.Fatal("cross identity trust")
		}
	}
	s.Remember(ctx, "127.0.0.1", "1", "v1")
	if ok, _ := s.Familiar(ctx, "127.0.0.1", "1", "v1"); ok {
		t.Fatal("proxy identity trusted")
	}
	r.FastForward(31 * 24 * time.Hour)
	if ok, _ := s.Familiar(ctx, "8.8.4.4", "1", "v1"); ok {
		t.Fatal("expired trust")
	}
}
func TestLimitsAndRedisFailure(t *testing.T) {
	s, r := testService(t)
	ctx := context.Background()
	for i := 0; i < 20; i++ {
		if e := s.limit(ctx, "shared", 20); e != nil {
			t.Fatal(e)
		}
	}
	if !errors.Is(s.limit(ctx, "shared", 20), ErrLimited) {
		t.Fatal("missing rate limit")
	}
	r.FastForward(11 * time.Minute)
	if e := s.limit(ctx, "shared", 20); e != nil {
		t.Fatal(e)
	}
	r.Close()
	if _, e := s.Familiar(ctx, "8.8.4.4", "1", "v1"); e == nil {
		t.Fatal("redis failure allowed familiarity")
	}
}
func TestProxySpoofingAndIPv6(t *testing.T) {
	trusted := []netip.Prefix{netip.MustParsePrefix("127.0.0.1/32"), netip.MustParsePrefix("192.168.0.1/32"), netip.MustParsePrefix("173.245.48.0/20")}
	for _, tt := range []struct{ remote, xff, want string }{{"8.8.8.8:443", "1.1.1.1", "8.8.8.8"}, {"127.0.0.1:1234", "9.9.9.9, 8.8.8.8, 192.168.0.1", "8.8.8.8"}, {"127.0.0.1:1234", "2606:4700:4700::1111, 173.245.48.1, 192.168.0.1", "2606:4700:4700::1111"}, {"127.0.0.1:1234", "spoof, bad", "127.0.0.1"}, {"127.0.0.1:1234", "192.168.0.1", "127.0.0.1"}} {
		r := httptest.NewRequest("POST", "http://test/auth/login", nil)
		r.RemoteAddr = tt.remote
		r.Header.Set("X-Forwarded-For", tt.xff)
		r.Header.Set("CF-Connecting-IP", "1.0.0.1")
		r.Header.Set("X-Real-IP", "1.0.0.1")
		if got := ResolveIP(r, trusted); got != tt.want {
			t.Fatalf("%+v got %s", tt, got)
		}
	}
}
func TestRefreshInvalidatesPreviousChallenge(t *testing.T) {
	s, _ := testService(t)
	p, a := issueAnswer(t, s)
	_, _ = issueAnswer(t, s)
	if _, e := s.Verify(context.Background(), "8.8.4.4", "login", "alice", p.ID, a); !errors.Is(e, ErrInvalid) {
		t.Fatal("old challenge survived refresh", e)
	}
}
