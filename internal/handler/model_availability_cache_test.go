package handler

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestHealthCacheCoalescesAndScopesVisibility(t *testing.T) {
	c := healthResponseCache{ttl: time.Minute, limit: 2}
	var calls atomic.Int32
	start := make(chan struct{})
	done := make(chan struct{})
	var wg sync.WaitGroup
	loader := func() ([]byte, error) {
		if calls.Add(1) == 1 {
			close(start)
		}
		<-done
		return []byte("one"), nil
	}
	wg.Add(1)
	go func() { defer wg.Done(); c.get(context.Background(), "visible-a", loader) }()
	<-start
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b, e := c.get(context.Background(), "visible-a", loader)
			if e != nil || string(b) != "one" {
				t.Error("bad shared response")
			}
		}()
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := c.get(ctx, "visible-a", loader); e == nil {
		t.Fatal("waiter cancellation ignored")
	}
	close(done)
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatal("duplicate load", calls.Load())
	}
	b, _ := c.get(context.Background(), "visible-b", func() ([]byte, error) { return []byte("two"), nil })
	if string(b) != "two" {
		t.Fatal("visibility leak")
	}
	c.mu.Lock()
	c.entries["visible-a"].expires = time.Now().Add(-time.Second)
	c.mu.Unlock()
	c.get(context.Background(), "visible-a", func() ([]byte, error) { calls.Add(1); return []byte("fresh"), nil })
	if calls.Load() != 2 {
		t.Fatal("expired result reused")
	}
}
func TestHealthCacheDoesNotStoreFailures(t *testing.T) {
	c := healthResponseCache{ttl: time.Minute, limit: 1}
	c.get(context.Background(), "a", func() ([]byte, error) { return nil, errors.New("db") })
	b, e := c.get(context.Background(), "a", func() ([]byte, error) { return []byte("recovered"), nil })
	if e != nil || string(b) != "recovered" {
		t.Fatal("cached failure")
	}
	c.get(context.Background(), "b", func() ([]byte, error) { return []byte("bounded"), nil })
	if len(c.entries) != 1 {
		t.Fatal("unbounded cache")
	}
}
