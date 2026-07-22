package service

import (
	"context"
	"errors"
	"net"
	"reflect"
	"testing"

	"fanapi/internal/cache"

	"github.com/redis/go-redis/v9"
)

type recordingRedisHook struct {
	commands [][]interface{}
}

func (hook *recordingRedisHook) DialHook(next redis.DialHook) redis.DialHook {
	return next
}

func (hook *recordingRedisHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(_ context.Context, cmd redis.Cmder) error {
		hook.commands = append(hook.commands, cmd.Args())
		if intCmd, ok := cmd.(*redis.IntCmd); ok {
			intCmd.SetVal(1)
		}
		return nil
	}
}

func (hook *recordingRedisHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}

func TestDeleteAPIKeyCacheDeletesExactHash(t *testing.T) {
	previous := cache.Client
	client := redis.NewClient(&redis.Options{
		Addr: "unused:6379",
		Dialer: func(context.Context, string, string) (net.Conn, error) {
			return nil, errors.New("unexpected redis dial")
		},
	})
	hook := &recordingRedisHook{}
	client.AddHook(hook)
	cache.Client = client
	t.Cleanup(func() {
		cache.Client = previous
		_ = client.Close()
	})

	if err := deleteAPIKeyCache(context.Background(), "deadbeef"); err != nil {
		t.Fatalf("deleteAPIKeyCache() error = %v", err)
	}
	want := [][]interface{}{{"del", "apikey2:deadbeef"}}
	if !reflect.DeepEqual(hook.commands, want) {
		t.Fatalf("Redis commands = %#v, want %#v", hook.commands, want)
	}
}

func TestCachedAPIKeyActive(t *testing.T) {
	dbErr := errors.New("database unavailable")
	tests := []struct {
		name     string
		affected int64
		err      error
		wantErr  bool
	}{
		{name: "active row", affected: 1},
		{name: "deleted or revoked row", affected: 0, wantErr: true},
		{name: "database error", affected: 0, err: dbErr, wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := cachedAPIKeyActive(test.affected, test.err)
			if (err != nil) != test.wantErr {
				t.Fatalf("cachedAPIKeyActive() error = %v, wantErr %v", err, test.wantErr)
			}
			if test.err != nil && !errors.Is(err, test.err) {
				t.Fatalf("cachedAPIKeyActive() error = %v, want wrapped %v", err, test.err)
			}
		})
	}
}

func TestFinishAPIKeyMutation(t *testing.T) {
	dbErr := errors.New("database unavailable")
	cacheErr := errors.New("redis unavailable")

	t.Run("database error", func(t *testing.T) {
		called := false
		err := finishAPIKeyMutation(context.Background(), "hash", 0, dbErr, func(context.Context, string) error {
			called = true
			return nil
		})
		if !errors.Is(err, dbErr) || called {
			t.Fatalf("finishAPIKeyMutation() = %v, invalidator called = %v", err, called)
		}
	})

	t.Run("missing key", func(t *testing.T) {
		called := false
		err := finishAPIKeyMutation(context.Background(), "hash", 0, nil, func(context.Context, string) error {
			called = true
			return nil
		})
		if !errors.Is(err, ErrAPIKeyNotFound) || called {
			t.Fatalf("finishAPIKeyMutation() = %v, invalidator called = %v", err, called)
		}
	})

	t.Run("successful mutation", func(t *testing.T) {
		var invalidated string
		err := finishAPIKeyMutation(context.Background(), "deadbeef", 1, nil, func(_ context.Context, hash string) error {
			invalidated = hash
			return nil
		})
		if err != nil || invalidated != "deadbeef" {
			t.Fatalf("finishAPIKeyMutation() = %v, invalidated = %q", err, invalidated)
		}
	})

	t.Run("cache error", func(t *testing.T) {
		err := finishAPIKeyMutation(context.Background(), "hash", 1, nil, func(context.Context, string) error {
			return cacheErr
		})
		if !errors.Is(err, cacheErr) {
			t.Fatalf("finishAPIKeyMutation() = %v, want wrapped %v", err, cacheErr)
		}
	})
}
