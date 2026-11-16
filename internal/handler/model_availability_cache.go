package handler

import (
	"context"
	"sync"
	"time"
)

// Cache only shared model health, never account data or API keys. Visibility is
// recomputed before lookup and the complete sorted visible-name set is the key.
var availabilityCache = healthResponseCache{ttl: 15 * time.Second, limit: 32}

type healthCacheEntry struct {
	ready   chan struct{}
	body    []byte
	err     error
	expires time.Time
}
type healthResponseCache struct {
	mu      sync.Mutex
	entries map[string]*healthCacheEntry
	ttl     time.Duration
	limit   int
}

func (cache *healthResponseCache) get(ctx context.Context, key string, load func() ([]byte, error)) ([]byte, error) {
	cache.mu.Lock()
	if cache.entries == nil {
		cache.entries = make(map[string]*healthCacheEntry)
	}
	now := time.Now()
	if entry := cache.entries[key]; entry != nil {
		if entry.expires.IsZero() || now.Before(entry.expires) {
			cache.mu.Unlock()
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-entry.ready:
				return entry.body, entry.err
			}
		}
		delete(cache.entries, key)
	}
	for k, e := range cache.entries {
		if !e.expires.IsZero() && !now.Before(e.expires) {
			delete(cache.entries, k)
		}
	}
	if len(cache.entries) >= cache.limit {
		// Bound memory even with many distinct API-key visibility sets.
		cache.mu.Unlock()
		return load()
	}
	entry := &healthCacheEntry{ready: make(chan struct{})}
	cache.entries[key] = entry
	cache.mu.Unlock()
	body, err := load()
	cache.mu.Lock()
	entry.body = body
	entry.err = err
	entry.expires = time.Now().Add(cache.ttl)
	if err != nil {
		delete(cache.entries, key)
	}
	close(entry.ready)
	cache.mu.Unlock()
	return body, err
}
