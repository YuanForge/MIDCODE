package service

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"
	"xorm.io/xorm"
)

func TestInviteBillingPostgres(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("FANAPI_TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("FANAPI_TEST_DATABASE_URL is not set")
	}
	admin, err := xorm.NewEngine("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("invite_billing_test_%d", time.Now().UnixNano())
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
	defer engine.Close()
	engine.SetSchema(schema)
	old := db.Engine
	db.Engine = engine
	defer func() { db.Engine = old }()
	if err := engine.Sync2(new(model.User), new(model.InviteRebate), new(model.SystemSetting)); err != nil {
		t.Fatal(err)
	}
	exec := func(sql string, args ...interface{}) {
		t.Helper()
		all := append([]interface{}{sql}, args...)
		if _, err := engine.Exec(all...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`CREATE TABLE llm_logs (user_id BIGINT, corr_id TEXT, status TEXT);
CREATE TABLE tasks (user_id BIGINT, corr_id TEXT, status TEXT);
CREATE TABLE billing_refund_jobs (user_id BIGINT, corr_id TEXT, status TEXT);`)
	for id := int64(1); id <= 3; id++ {
		ratio := 0.05
		user := model.User{ID: id, Username: fmt.Sprint("user", id), PasswordHash: "test", RebateRatio: &ratio}
		if id > 1 {
			parent := id - 1
			user.InviterID = &parent
		}
		if _, err := engine.Insert(&user); err != nil {
			t.Fatal(err)
		}
	}
	track := func(user int64, corr, kind string, credits int64) {
		t.Helper()
		sess := engine.NewSession()
		defer sess.Close()
		if err := sess.Begin(); err != nil {
			t.Fatal(err)
		}
		if err := trackInviteFundsTx(sess, &model.BillingTransaction{UserID: user, CorrID: corr, Type: kind, Credits: credits}); err != nil {
			_ = sess.Rollback()
			t.Fatal(err)
		}
		if err := sess.Commit(); err != nil {
			t.Fatal(err)
		}
	}
	checkUser := func(id, frozen, reward, debt int64) {
		t.Helper()
		var user model.User
		if ok, err := engine.ID(id).Get(&user); err != nil || !ok {
			t.Fatalf("read user: %v", err)
		}
		if user.FrozenBalance != frozen || user.RewardBalance != reward || user.RebateDebt != debt {
			t.Fatalf("user %d frozen=%d reward=%d debt=%d; want %d %d %d", id, user.FrozenBalance, user.RewardBalance, user.RebateDebt, frozen, reward, debt)
		}
	}
	process := func() {
		t.Helper()
		if err := ProcessInviteRebates(context.Background(), 100); err != nil {
			t.Fatal(err)
		}
	}
	// A hold is not income. Net settled amount determines the one-time reward.
	track(3, "request", "hold", 10000)
	exec("UPDATE users SET rebate_ratio = 0.9 WHERE id=3")
	process()
	checkUser(2, 0, 0, 0)
	track(3, "request", "refund", 2000)
	exec("INSERT INTO llm_logs VALUES (3, 'request', 'ok')")
	exec("INSERT INTO billing_refund_jobs VALUES (3, 'request', 'pending')")
	process()
	checkUser(2, 0, 0, 0)
	exec("UPDATE billing_refund_jobs SET status = 'done'")
	// Concurrent workers must pay exactly once.
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := ProcessInviteRebates(context.Background(), 100); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	checkUser(2, 400, 0, 0)
	process()
	checkUser(2, 400, 0, 0)
	exec("UPDATE users SET rebate_ratio = 0.05 WHERE id=3")
	// Converted rewards remain ineligible when spent by the middle user.
	exec("UPDATE users SET frozen_balance=0, balance=balance+400, reward_balance=reward_balance+400 WHERE id=2")
	track(2, "reward-spend", "hold", 400)
	exec("INSERT INTO llm_logs VALUES (2, 'reward-spend', 'ok')")
	process()
	checkUser(1, 0, 0, 0)
	checkUser(2, 0, 0, 0)
	track(2, "reward-spend", "refund", 400)
	process()
	checkUser(2, 0, 400, 0)
	// Even a late refund after conversion cannot erase the clawback.
	track(3, "request", "refund", 8000)
	process()
	checkUser(2, 0, 400, 400)
	track(3, "next-request", "charge", 10000)
	exec("INSERT INTO tasks VALUES (3,'next-request','done')")
	process()
	checkUser(2, 100, 400, 0)
	// Source attribution is part of the transaction and rolls back with it.
	sess := engine.NewSession()
	if err := sess.Begin(); err != nil {
		t.Fatal(err)
	}
	if err := trackInviteFundsTx(sess, &model.BillingTransaction{UserID: 2, CorrID: "rollback", Type: "hold", Credits: 400}); err != nil {
		t.Fatal(err)
	}
	_ = sess.Rollback()
	sess.Close()
	checkUser(2, 100, 400, 0)
	if found, err := engine.Where("corr_id = ?", "rollback").Exist(new(model.InviteRebate)); err != nil || found {
		t.Fatalf("rollback leaked: %v %v", found, err)
	}
	// Concurrent spends cannot both claim the same reward portion.
	for _, corr := range []string{"parallel-a", "parallel-b"} {
		wg.Add(1)
		go func(corr string) { defer wg.Done(); track(2, corr, "hold", 400) }(corr)
	}
	wg.Wait()
	var total struct {
		Eligible int64 `xorm:"eligible"`
	}
	if _, err := engine.SQL("SELECT SUM(eligible_credits) AS eligible FROM invite_rebates WHERE corr_id IN ('parallel-a','parallel-b')").Get(&total); err != nil {
		t.Fatal(err)
	}
	if total.Eligible != 400 {
		t.Fatalf("reward source double spent: eligible=%d", total.Eligible)
	}
	exec("INSERT INTO llm_logs VALUES (2,'parallel-a','error'), (2,'parallel-b','pending')")
	process()
	checkUser(1, 0, 0, 0)
}
