package service

import (
	"context"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"
	"xorm.io/xorm"
)

func TestCreditTransferPostgres(t *testing.T) {
	dsn := os.Getenv("FANAPI_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("FANAPI_TEST_DATABASE_URL is not set")
	}
	admin, err := xorm.NewEngine("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("gift_test_%d", time.Now().UnixNano())
	if _, err = admin.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
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
	if err = engine.Sync2(new(model.User), new(model.BillingTransaction), new(model.BalanceSyncJob), new(model.BillingQuotaLease)); err != nil {
		t.Fatal(err)
	}
	for id := int64(1); id <= 3; id++ {
		u := model.User{ID: id, Username: fmt.Sprint("gift", id), PasswordHash: "test", IsActive: true}
		if id == 1 {
			u.Balance = 1000
			u.RewardBalance = 100
		}
		if _, err = engine.Insert(&u); err != nil {
			t.Fatal(err)
		}
	}
	ctx := context.Background()
	key := "gift-request-123456"
	if err = TransferCredits(ctx, 1, 2, 300, key); err != nil {
		t.Fatal(err)
	}
	if err = TransferCredits(ctx, 1, 2, 300, key); err != nil {
		t.Fatal(err)
	}
	if err = TransferCredits(ctx, 1, 3, 300, key); err == nil {
		t.Fatal("idempotency conflict accepted")
	}
	if err = TransferCredits(ctx, 1, 2, 701, "insufficient-123456"); err == nil {
		t.Fatal("overspend accepted")
	}
	if err = TransferCredits(ctx, 1, 999, 1, "missing-user-123456"); err == nil {
		t.Fatal("missing recipient accepted")
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := 0
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if TransferCredits(ctx, 1, 2, 100, fmt.Sprintf("parallel-gift-%016d", i)) == nil {
				mu.Lock()
				success++
				mu.Unlock()
			}
		}(i)
	}
	wg.Wait()
	if success != 7 {
		t.Fatalf("concurrent successes=%d want 7", success)
	}
	var sender, recipient model.User
	if _, err = engine.ID(1).Get(&sender); err != nil {
		t.Fatal(err)
	}
	if _, err = engine.ID(2).Get(&recipient); err != nil {
		t.Fatal(err)
	}
	if sender.Balance != 0 || recipient.Balance != 1000 || sender.RewardBalance != 0 || recipient.RewardBalance != 100 {
		t.Fatalf("incorrect balances: sender=%+v recipient=%+v", sender, recipient)
	}
	count, err := engine.Count(new(model.BillingTransaction))
	if err != nil || count != 16 {
		t.Fatalf("ledger count=%d err=%v", count, err)
	}
	jobs, err := engine.Count(new(model.BalanceSyncJob))
	if err != nil || jobs != 16 {
		t.Fatalf("sync jobs=%d err=%v", jobs, err)
	}
	// A failure on the recipient ledger must roll the sender debit back too.
	if _, err = engine.Exec(`CREATE FUNCTION reject_gift() RETURNS trigger AS $$ BEGIN IF NEW.type = 'transfer_in' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`); err != nil {
		t.Fatal(err)
	}
	if _, err = engine.Exec(`CREATE TRIGGER reject_gift BEFORE INSERT ON billing_transactions FOR EACH ROW EXECUTE FUNCTION reject_gift()`); err != nil {
		t.Fatal(err)
	}
	if TransferCredits(ctx, 2, 1, 50, "rollback-gift-123456") == nil {
		t.Fatal("expected injected failure")
	}
	var after model.User
	if _, err = engine.ID(2).Get(&after); err != nil || after.Balance != 1000 {
		t.Fatalf("rollback failed: balance=%d err=%v", after.Balance, err)
	}
}
