package billing

import (
	"context"
	"sync"

	"fanapi/internal/db"
	"xorm.io/xorm/core"
)

// Queue locally before taking a database connection so a single busy user
// cannot occupy the entire lock pool. Collisions only serialize short charges.
var chargeQueues [4096]chan struct{}

func init() {
	for i := range chargeQueues {
		chargeQueues[i] = make(chan struct{}, 1)
	}
}

// Charge also needs a regular connection for its lease transactions. Keeping
// advisory locks on a separate bounded pool avoids nested pool starvation.
var chargeLockPool = sync.OnceValues(func() (*core.DB, error) {
	pool, err := db.Engine.NewDB()
	if err == nil {
		pool.SetMaxOpenConns(16)
		pool.SetMaxIdleConns(4)
	}
	return pool, err
})

func withChargeLock(ctx context.Context, userID int64, charge func() error) error {
	queue := chargeQueues[uint64(userID)%uint64(len(chargeQueues))]
	select {
	case queue <- struct{}{}:
		defer func() { <-queue }()
	case <-ctx.Done():
		return ctx.Err()
	}
	pool, err := chargeLockPool()
	if err != nil {
		return err
	}
	// Keep the lock until the charge finishes, including compensation after a
	// caller cancellation. Rollback releases the transaction-scoped lock.
	conn, err := pool.DB.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	tx, err := conn.BeginTx(context.WithoutCancel(ctx), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Single-bigint advisory locks are disjoint from the two-int lease locks.
	if _, err = tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock($1::bigint)", userID); err != nil {
		return err
	}
	return charge()
}
