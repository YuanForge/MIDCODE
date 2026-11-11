package service

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"fanapi/internal/billing"
	"fanapi/internal/cache"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"github.com/redis/go-redis/v9"
	"xorm.io/xorm"
)

type refundTimeoutHook struct {
	commands []string
	timeout  bool
}

func (h *refundTimeoutHook) DialHook(next redis.DialHook) redis.DialHook { return next }
func (h *refundTimeoutHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}
func (h *refundTimeoutHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		h.commands = append(h.commands, cmd.Name())
		err := next(ctx, cmd)
		if e, ok := err.(net.Error); ok && e.Timeout() {
			h.timeout = true
		}
		return err
	}
}

func TestDurableRefundPostgres(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("FANAPI_TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("FANAPI_TEST_DATABASE_URL is not set")
	}
	admin, err := xorm.NewEngine("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("refund_test_%d", time.Now().UnixNano())
	if _, err := admin.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
	testDSN, err := postgresDSNWithSearchPath(dsn, schema)
	if err != nil {
		t.Fatal(err)
	}
	engine, err := xorm.NewEngine("postgres", testDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { engine.Close() }()
	engine.SetSchema(schema)
	oldDB, oldRedis := db.Engine, cache.Client
	db.Engine = engine
	// Refund success must not depend on a reachable Redis endpoint.
	cache.Client = redis.NewClient(&redis.Options{Addr: "127.0.0.1:1", MaxRetries: -1, DialTimeout: time.Millisecond, ReadTimeout: time.Millisecond, WriteTimeout: time.Millisecond})
	defer func() { cache.Client.Close(); db.Engine, cache.Client = oldDB, oldRedis }()
	if err := engine.Sync2(new(model.User), new(model.UserModelCredit), new(model.BillingTransaction), new(model.BillingRefundJob), new(model.BillingQuotaLease), new(model.InviteRebate), new(model.SystemSetting), new(model.BillingPostBillingJob), new(model.BalanceSyncJob), new(model.LLMLog), new(model.Task)); err != nil {
		t.Fatal(err)
	}
	exec := func(sql string, args ...interface{}) {
		t.Helper()
		if _, err := engine.Exec(append([]interface{}{sql}, args...)...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`CREATE UNIQUE INDEX refund_job_dedupe ON billing_refund_jobs(dedupe_key) WHERE dedupe_key<>''`)
	exec(`CREATE UNIQUE INDEX refund_ledger_dedupe ON billing_transactions((metrics->>'refund_dedupe_key')) WHERE type='refund'`)
	seed := func(id, credits, mc int64, corr string) {
		t.Helper()
		if _, err := engine.Insert(&model.User{ID: id, Username: fmt.Sprint("refund-user-", id), PasswordHash: "test", Balance: 1000, IsActive: true}); err != nil {
			t.Fatal(err)
		}
		if _, err := engine.Insert(&model.BillingTransaction{UserID: id, CorrID: corr, Type: "hold", Credits: credits, ModelCreditCharged: mc, Metrics: model.JSON{}}); err != nil {
			t.Fatal(err)
		}
		if mc > 0 {
			if _, err := engine.Insert(&model.UserModelCredit{UserID: id, ModelName: "test-model", Credits: 10}); err != nil {
				t.Fatal(err)
			}
		}
	}
	check := func(id, balance, modelBalance, refunds int64) {
		t.Helper()
		var u model.User
		if ok, err := engine.ID(id).Get(&u); err != nil || !ok {
			t.Fatalf("user: %v", err)
		}
		if u.Balance != balance {
			t.Fatalf("user %d balance %d want %d", id, u.Balance, balance)
		}
		rows, err := engine.QueryString("SELECT COALESCE(SUM(credits),0) AS n FROM user_model_credits WHERE user_id=$1", id)
		if err != nil {
			t.Fatal(err)
		}
		if rows[0]["n"] != fmt.Sprint(modelBalance) {
			t.Fatalf("model balance %v want %d", rows, modelBalance)
		}
		n, err := engine.Where("user_id=? AND type='refund'", id).Count(new(model.BillingTransaction))
		if err != nil || n != refunds {
			t.Fatalf("refund count %d want %d err=%v", n, refunds, err)
		}
	}
	ctx := context.Background()
	t.Run("redis unavailable and concurrent duplicate refund", func(t *testing.T) {
		seed(1, 1000, 200, "concurrent")
		var wg sync.WaitGroup
		errs := make(chan error, 16)
		for i := 0; i < 16; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				errs <- RefundTx(ctx, 1, 0, 0, 0, "concurrent", 700, 0, 200, model.JSON{"routing_key": "test-model", "refund_dedupe_key": "same"})
			}()
		}
		wg.Wait()
		close(errs)
		for err := range errs {
			if err != nil {
				t.Fatal(err)
			}
		}
		check(1, 1500, 210, 1)
		// Crash after money commits but before the worker acknowledges completion.
		exec("UPDATE billing_refund_jobs SET status='running_db',updated_at=NOW()-INTERVAL '11 minutes' WHERE user_id=1")
		if _, err := ProcessBillingRefundJobs(ctx, 100); err != nil {
			t.Fatal(err)
		}
		check(1, 1500, 210, 1)
	})
	t.Run("transaction failure then restart recovery", func(t *testing.T) {
		seed(2, 1000, 200, "restart")
		exec(`CREATE FUNCTION reject_refund() RETURNS trigger AS $$ BEGIN IF NEW.type='refund' AND NEW.user_id=2 THEN RAISE EXCEPTION 'injected write timeout'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`)
		exec(`CREATE TRIGGER refund_failure BEFORE INSERT ON billing_transactions FOR EACH ROW EXECUTE FUNCTION reject_refund()`)
		if err := RefundTx(ctx, 2, 0, 0, 0, "restart", 700, 0, 200, model.JSON{"routing_key": "test-model", "refund_dedupe_key": "restart"}); err != nil {
			t.Fatal(err)
		}
		check(2, 1000, 10, 0)
		var job model.BillingRefundJob
		if _, err := engine.Where("user_id=2").Get(&job); err != nil {
			t.Fatal(err)
		}
		if job.Status != "pending_db" || !strings.Contains(job.LastError, "injected write timeout") {
			t.Fatalf("intent not retryable: %+v", job)
		}
		// Old binaries cannot see the new protocol's pending state.
		if n, _ := engine.Where("user_id=2 AND status='pending'").Count(new(model.BillingRefundJob)); n != 0 {
			t.Fatal("legacy worker can claim new intent")
		}
		exec(`DROP TRIGGER refund_failure ON billing_transactions`)
		exec("UPDATE billing_refund_jobs SET next_run_at=NOW() WHERE user_id=2")
		engine.Close()
		engine, err = xorm.NewEngine("postgres", testDSN)
		if err != nil {
			t.Fatal(err)
		}
		engine.SetSchema(schema)
		db.Engine = engine
		if _, err := ProcessBillingRefundJobs(ctx, 100); err != nil {
			t.Fatal(err)
		}
		check(2, 1500, 210, 1)
	})
	t.Run("legacy preapplied refund job", func(t *testing.T) {
		seed(3, 1000, 200, "legacy")
		// Model credits were already returned before this legacy intent was queued.
		exec("UPDATE user_model_credits SET credits=210 WHERE user_id=3")
		job := &model.BillingRefundJob{UserID: 3, CorrID: "legacy", Credits: 700, ModelCreditRefunded: 200, Status: "pending", NextRunAt: time.Now(), DedupeKey: "legacy", Metrics: model.JSON{"refund_dedupe_key": "legacy", "skip_redis_sync": true}}
		if _, err := engine.Insert(job); err != nil {
			t.Fatal(err)
		}
		if _, err := ProcessBillingRefundJobs(ctx, 100); err != nil {
			t.Fatal(err)
		}
		check(3, 1000, 210, 1)
		var lease model.BillingQuotaLease
		if ok, err := engine.Where("user_id=3").Get(&lease); err != nil || !ok || lease.RemainingCredits != 500 {
			t.Fatalf("legacy lease %+v err=%v", lease, err)
		}
	})
	t.Run("recovery snapshot guard and overrefund", func(t *testing.T) {
		seed(4, 1000, 0, "guard")
		if err := RefundTx(ctx, 4, 0, 0, 0, "guard", 300, 0, 0, model.JSON{"refund_dedupe_key": "guard", "recovery_expected_net": float64(900)}); err != nil {
			t.Fatal(err)
		}
		check(4, 1000, 0, 0)
		var job model.BillingRefundJob
		if _, err := engine.Where("user_id=4").Get(&job); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(job.LastError, "net changed") {
			t.Fatalf("snapshot mismatch accepted: %+v", job)
		}
		if err := RefundTx(ctx, 4, 0, 0, 0, "guard", 1001, 0, 0, model.JSON{"refund_dedupe_key": "over"}); err != nil {
			t.Fatal(err)
		}
		check(4, 1000, 0, 0)
		if err := RefundTx(ctx, 4, 0, 0, 0, "guard", -1, 0, 0, nil); err == nil {
			t.Fatal("negative refund accepted")
		}
	})
	t.Run("partial refund replay ignores mutable metrics", func(t *testing.T) {
		seed(6, 1000, 0, "partial")
		for i := 0; i < 2; i++ {
			metrics := model.JSON{"actual_cost": 900, "reason": fmt.Sprint("settlement-attempt-", i), "usage": model.JSON{"detail": i}}
			if err := RefundTx(ctx, 6, 20, 30, 40, "partial", 100, 10, 0, metrics); err != nil {
				t.Fatal(err)
			}
		}
		check(6, 1100, 0, 1)
		for _, conflict := range []struct{ amount, cost, channel int64 }{{101, 10, 20}, {100, 11, 20}, {100, 10, 21}} {
			if err := RefundTx(ctx, 6, conflict.channel, 30, 40, "partial", conflict.amount, conflict.cost, 0, model.JSON{"actual_cost": 900}); err == nil {
				t.Fatal("conflicting replay accepted")
			}
		}
		check(6, 1100, 0, 1)
	})
	t.Run("redis reply timeout cannot lose or replay refund", func(t *testing.T) {
		seed(7, 1000, 0, "timeout")
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer listener.Close()
		go func() {
			for {
				conn, err := listener.Accept()
				if err != nil {
					return
				}
				go func() {
					defer conn.Close()
					conn.SetDeadline(time.Now().Add(2 * time.Second))
					io.Copy(io.Discard, conn)
				}()
			}
		}()
		old := cache.Client
		cache.Client = redis.NewClient(&redis.Options{Addr: listener.Addr().String(), MaxRetries: -1, ReadTimeout: 20 * time.Millisecond, WriteTimeout: 20 * time.Millisecond})
		defer func() { cache.Client.Close(); cache.Client = old }()
		hook := &refundTimeoutHook{}
		cache.Client.AddHook(hook)
		if err := RefundTx(ctx, 7, 0, 0, 0, "timeout", 100, 0, 0, model.JSON{"actual_cost": 900}); err != nil {
			t.Fatal(err)
		}
		check(7, 1100, 0, 1)
		if !hook.timeout {
			t.Fatal("fault did not produce a socket timeout")
		}
		for _, cmd := range hook.commands {
			if cmd != "del" {
				t.Fatalf("refund unexpectedly used Redis money command %s", cmd)
			}
		}
		if err := RefundTx(ctx, 7, 0, 0, 0, "timeout", 100, 0, 0, model.JSON{"actual_cost": 900, "usage": "changed"}); err != nil {
			t.Fatal(err)
		}
		check(7, 1100, 0, 1)
	})
	t.Run("bad hot quota does not persist a 500 loop", func(t *testing.T) {
		addr := os.Getenv("FANAPI_TEST_REDIS_ADDR")
		if addr == "" {
			t.Skip("FANAPI_TEST_REDIS_ADDR is not set")
		}
		old := cache.Client
		cache.Client = redis.NewClient(&redis.Options{Addr: addr, MaxRetries: -1})
		defer func() { cache.Client.Close(); cache.Client = old }()
		seed(5, 0, 0, "empty")
		keys := []string{"billing:quota:5", "billing:quota_version:5", "user:balance:5"}
		defer cache.Client.Del(ctx, keys...)
		cache.Client.Set(ctx, keys[0], int64(49062), time.Minute)
		cache.Client.Set(ctx, keys[1], "2", time.Minute)
		// Multiple pre-charges can be in flight when the first DB mirror fails.
		// Every failure must discard the bad bucket instead of replenishing it.
		for i := 0; i < 8; i++ {
			if err := billing.Charge(ctx, 5, 100); err != nil {
				t.Fatal(err)
			}
		}
		var wg sync.WaitGroup
		errs := make(chan error, 8)
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				errs <- WriteTx(ctx, 5, 0, 0, 0, fmt.Sprint("bad-", i), "hold", 100, 0, 0, nil)
			}(i)
		}
		wg.Wait()
		close(errs)
		for err := range errs {
			if err == nil {
				t.Fatal("unbacked hold accepted")
			}
		}
		if n, _ := cache.Client.Exists(ctx, keys[0], keys[1]).Result(); n != 0 {
			t.Fatal("corrupt quota survived")
		}
		if err := billing.Charge(ctx, 5, 100); err != nil {
			t.Fatal(err)
		}
		if err := WriteTx(ctx, 5, 0, 0, 0, "good", "hold", 100, 0, 0, nil); err != nil {
			t.Fatal(err)
		}
		var u model.User
		engine.ID(5).Get(&u)
		if u.Balance != 900 {
			t.Fatalf("real reserve %d want 900", u.Balance)
		}
	})
}
