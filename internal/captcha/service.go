package captcha

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/netip"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

var ErrInvalid = errors.New("captcha invalid or expired")
var ErrLimited = errors.New("captcha rate limit")

const challengeTTL = 2 * time.Minute
const grantTTL = 2 * time.Minute
const familiarTTL = 30 * 24 * time.Hour
const prefix = "auth:captcha:v1:"

type Service struct {
	redis   redis.UniversalClient
	secret  []byte
	Trusted []netip.Prefix
	slots   chan struct{}
}
type challenge struct {
	Kind     string
	Binding  string
	Solution json.RawMessage
}

func New(client redis.UniversalClient, secret, proxyList string) (*Service, error) {
	s := &Service{redis: client, secret: []byte(secret), slots: make(chan struct{}, 2)}
	for _, v := range strings.Split(proxyList, ",") {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		p, e := netip.ParsePrefix(v)
		if e != nil {
			return nil, e
		}
		s.Trusted = append(s.Trusted, p)
	}
	return s, nil
}
func (s *Service) digest(parts ...string) string {
	m := hmac.New(sha256.New, s.secret)
	for _, p := range parts {
		m.Write([]byte(p))
		m.Write([]byte{0})
	}
	return hex.EncodeToString(m.Sum(nil))
}
func id() (string, error) {
	var b [32]byte
	if _, e := rand.Read(b[:]); e != nil {
		return "", e
	}
	return hex.EncodeToString(b[:]), nil
}
func validID(v string) bool {
	if len(v) != 64 {
		return false
	}
	_, e := hex.DecodeString(v)
	return e == nil
}
func (s *Service) binding(ip, purpose, subject string) string {
	return s.digest("binding", ip, purpose, strings.TrimSpace(subject))
}

var rateScript = redis.NewScript(`local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n`)

func (s *Service) limit(ctx context.Context, key string, max int64) error {
	n, e := rateScript.Run(ctx, s.redis, []string{prefix + "rate:" + key}, 600).Int64()
	if e != nil {
		return e
	}
	if n > max {
		return ErrLimited
	}
	return nil
}
func (s *Service) Issue(ctx context.Context, ip, purpose, subject string) (PublicData, error) {
	if e := s.limit(ctx, s.digest("ip", ip), 40); e != nil {
		return PublicData{}, e
	}
	if e := s.limit(ctx, s.digest("subject", purpose, subject), 20); e != nil {
		return PublicData{}, e
	}
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		return PublicData{}, ErrLimited
	}
	out, solution, e := generate()
	if e != nil {
		return out, e
	}
	out.ID, e = id()
	if e != nil {
		return out, e
	}
	raw, e := json.Marshal(challenge{Kind: out.Kind, Binding: s.binding(ip, purpose, subject), Solution: solution})
	if e != nil {
		return out, e
	}
	e = issueScript.Run(ctx, s.redis, []string{prefix + "active:" + s.binding(ip, purpose, subject), prefix + "challenge:" + out.ID}, out.ID, raw, int(challengeTTL.Seconds()), prefix+"challenge:").Err()
	return out, e
}
func (s *Service) Verify(ctx context.Context, ip, purpose, subject, key string, answer Answer) (string, error) {
	if !validID(key) {
		return "", ErrInvalid
	}
	// One attempt, even when the solution or binding is wrong. GetDel is atomic.
	value, e := verifyScript.Run(ctx, s.redis, []string{prefix + "active:" + s.binding(ip, purpose, subject), prefix + "challenge:" + key}, key).Text()
	raw := []byte(value)
	if errors.Is(e, redis.Nil) {
		return "", ErrInvalid
	}
	if e != nil {
		return "", e
	}
	var c challenge
	if json.Unmarshal(raw, &c) != nil || c.Binding != s.binding(ip, purpose, subject) || !validate(c.Kind, c.Solution, answer) {
		return "", ErrInvalid
	}
	token, e := id()
	if e != nil {
		return "", e
	}
	e = s.redis.Set(ctx, prefix+"grant:"+token, c.Binding, grantTTL).Err()
	return token, e
}
func (s *Service) Consume(ctx context.Context, ip, purpose, subject, token string) error {
	if !validID(token) {
		return ErrInvalid
	}
	value, e := s.redis.GetDel(ctx, prefix+"grant:"+token).Result()
	if errors.Is(e, redis.Nil) {
		return ErrInvalid
	}
	if e != nil {
		return e
	}
	if !hmac.Equal([]byte(value), []byte(s.binding(ip, purpose, subject))) {
		return ErrInvalid
	}
	return nil
}
func (s *Service) Familiar(ctx context.Context, ip, account, passwordVersion string) (bool, error) {
	if !PublicIP(ip) {
		return false, nil
	}
	n, e := s.redis.Exists(ctx, prefix+"familiar:"+s.digest(ip, account, passwordVersion)).Result()
	return n > 0, e
}

// Called only after successful authentication, never on challenge verification alone.
func (s *Service) Remember(ctx context.Context, ip, account, passwordVersion string) error {
	if !PublicIP(ip) {
		return nil
	}
	return s.redis.Set(ctx, prefix+"familiar:"+s.digest(ip, account, passwordVersion), "1", familiarTTL).Err()
}

var issueScript = redis.NewScript(`local old=redis.call('GET',KEYS[1]); if old then redis.call('DEL',ARGV[4]..old) end; redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]); redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]); return 1`)
var verifyScript = redis.NewScript(`local raw=redis.call('GET',KEYS[2]); redis.call('DEL',KEYS[2]); if redis.call('GET',KEYS[1])~=ARGV[1] then return false end; redis.call('DEL',KEYS[1]); return raw`)
