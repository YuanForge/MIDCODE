package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"fanapi/internal/cache"
	"fanapi/internal/db"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/redis/go-redis/v9"
	"xorm.io/xorm"
	"xorm.io/xorm/core"
)

// Emulates an old exhausted marker alongside a sticky assignment. Tests fail if
// selection reads or writes that marker, without needing a live Redis instance.
type poolRuntimeRedisHook struct {
	recordingRedisHook
	assignment string
	t          *testing.T
}

func (h *poolRuntimeRedisHook) ProcessHook(_ redis.ProcessHook) redis.ProcessHook {
	return func(_ context.Context, cmd redis.Cmder) error {
		args := cmd.Args()
		key := fmt.Sprint(args[1])
		if strings.HasPrefix(key, "pool:exhausted:") {
			h.t.Errorf("selection must not consult or change legacy exhausted state: %v", args)
			if c, ok := cmd.(*redis.IntCmd); ok {
				c.SetVal(1)
			}
			return nil
		}
		switch cmd.Name() {
		case "get":
			c := cmd.(*redis.StringCmd)
			if h.assignment == "" {
				c.SetErr(redis.Nil)
				return redis.Nil
			}
			c.SetVal(h.assignment)
		case "set":
			h.assignment = fmt.Sprint(args[2])
			cmd.(*redis.StatusCmd).SetVal("OK")
		default:
			h.t.Errorf("unexpected Redis command: %v", args)
		}
		return nil
	}
}

func setupPoolRuntimeTest(t *testing.T, assignment string) sqlmock.Sqlmock {
	t.Helper()
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	engine, err := xorm.NewEngineWithDB("postgres", "host=localhost dbname=unit_test sslmode=disable", core.FromDB(sqlDB))
	if err != nil {
		t.Fatal(err)
	}
	previousEngine, previousCache := db.Engine, cache.Client
	db.Engine = engine
	client := redis.NewClient(&redis.Options{Addr: "unused:6379"})
	client.AddHook(&poolRuntimeRedisHook{assignment: assignment, t: t})
	cache.Client = client
	t.Cleanup(func() {
		db.Engine, cache.Client = previousEngine, previousCache
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Error(err)
		}
		_ = client.Close()
		_ = engine.Close()
	})
	return mock
}

func expectRuntimePool(mock sqlmock.Sqlmock, active bool) {
	mock.ExpectQuery(`SELECT .* FROM "key_pools" WHERE .*`).WithArgs(int64(121)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "is_active"}).AddRow(121, active))
}

func expectRuntimeKeys(mock sqlmock.Sqlmock, ids ...int64) {
	rows := sqlmock.NewRows([]string{"id", "pool_id", "is_active", "priority"})
	for _, id := range ids {
		rows.AddRow(id, 121, true, 0)
	}
	mock.ExpectQuery(`SELECT .* FROM "pool_keys" WHERE .*pool_id.*is_active = true.*ORDER BY priority ASC, id ASC`).
		WithArgs(int64(121)).WillReturnRows(rows)
}

func expectRuntimeSticky(mock sqlmock.Sqlmock, id int64, available bool) {
	rows := sqlmock.NewRows([]string{"id", "pool_id", "is_active"})
	if available {
		rows.AddRow(id, 121, true)
	}
	mock.ExpectQuery(`SELECT .* FROM "pool_keys" WHERE .*id.*pool_id.*is_active = true`).
		WithArgs(id, int64(121)).WillReturnRows(rows)
}

func TestSinglePoolKeyFailureDoesNotBlockNextRequest(t *testing.T) {
	mock := setupPoolRuntimeTest(t, "203")
	ctx := context.Background()
	// Current request cannot retry the same key, even after repeated failures.
	for i := 0; i < 3; i++ {
		expectRuntimeKeys(mock, 203)
		key, err := RotatePoolKeySkipping(ctx, 121, 132, []int64{203})
		if key != nil || !errors.Is(err, ErrPoolAllKeysTried) {
			t.Fatalf("retry key=%v err=%v", key, err)
		}
		// A new request may use the enabled key immediately, despite old markers.
		expectRuntimePool(mock, true)
		expectRuntimeSticky(mock, 203, true)
		key, err = GetOrAssignPoolKey(ctx, 121, 132)
		if err != nil || key.ID != 203 {
			t.Fatalf("new request key=%v err=%v", key, err)
		}
	}
}

func TestPoolRotationSkipsAllKeysTriedOnlyForCurrentRequest(t *testing.T) {
	mock := setupPoolRuntimeTest(t, "203")
	ctx := context.Background()
	expectRuntimeKeys(mock, 203, 204)
	key, err := RotatePoolKeySkipping(ctx, 121, 132, []int64{203})
	if err != nil || key.ID != 204 {
		t.Fatalf("rotation key=%v err=%v", key, err)
	}
	expectRuntimeKeys(mock, 203, 204)
	key, err = RotatePoolKeySkipping(ctx, 121, 132, []int64{203, 204})
	if key != nil || !errors.Is(err, ErrPoolAllKeysTried) {
		t.Fatalf("keys must not cycle: key=%v err=%v", key, err)
	}
	expectRuntimePool(mock, true)
	expectRuntimeSticky(mock, 204, true)
	key, err = GetOrAssignPoolKey(ctx, 121, 132)
	if err != nil || key.ID != 204 {
		t.Fatalf("new request key=%v err=%v", key, err)
	}
}

func TestPoolAssignmentIgnoresLegacyExhaustionWithoutStickyKey(t *testing.T) {
	mock := setupPoolRuntimeTest(t, "")
	expectRuntimePool(mock, true)
	expectRuntimeKeys(mock, 203)
	key, err := GetOrAssignPoolKey(context.Background(), 121, 132)
	if err != nil || key.ID != 203 {
		t.Fatalf("assignment key=%v err=%v", key, err)
	}
}

func TestPoolManualDisableStillBlocksAssignment(t *testing.T) {
	mock := setupPoolRuntimeTest(t, "203")
	expectRuntimePool(mock, false)
	key, err := GetOrAssignPoolKey(context.Background(), 121, 132)
	if key != nil || err == nil || !strings.Contains(err.Error(), "已停用") {
		t.Fatalf("disabled pool key=%v err=%v", key, err)
	}
}

func TestDisabledOrMovedStickyKeyIsNotReused(t *testing.T) {
	mock := setupPoolRuntimeTest(t, "203")
	expectRuntimePool(mock, true)
	expectRuntimeSticky(mock, 203, false)
	expectRuntimeKeys(mock, 204)
	key, err := GetOrAssignPoolKey(context.Background(), 121, 132)
	if err != nil || key.ID != 204 {
		t.Fatalf("replacement key=%v err=%v", key, err)
	}
}

func TestPoolWithoutEnabledKeysRemainsUnavailable(t *testing.T) {
	mock := setupPoolRuntimeTest(t, "")
	expectRuntimePool(mock, true)
	expectRuntimeKeys(mock)
	key, err := GetOrAssignPoolKey(context.Background(), 121, 132)
	if key != nil || !errors.Is(err, ErrPoolNoAvailableKeys) {
		t.Fatalf("empty pool key=%v err=%v", key, err)
	}
}
