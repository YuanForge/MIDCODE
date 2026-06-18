package billing

import (
	"context"
	"log"
	"time"

	"fanapi/internal/db"
)

const billingReconcileInterval = 10 * time.Minute

type BalanceReconciliationMismatch struct {
	UserID           int64 `xorm:"user_id"`
	DBBalance        int64 `xorm:"db_balance"`
	ActiveLease      int64 `xorm:"active_lease"`
	SpendableBalance int64 `xorm:"spendable_balance"`
	LedgerBalance    int64 `xorm:"ledger_balance"`
	Diff             int64 `xorm:"diff"`
	MismatchCount    int64 `xorm:"mismatch_count"`
}

func AuditBalanceReconciliation(ctx context.Context, limit int) ([]BalanceReconciliationMismatch, int64, error) {
	if limit <= 0 {
		limit = 20
	}
	var rows []BalanceReconciliationMismatch
	err := db.Engine.Context(ctx).SQL(`
WITH ledger AS (
    SELECT
        user_id,
        COALESCE(SUM(CASE
            WHEN type IN ('charge', 'hold', 'settle') THEN -GREATEST(credits - model_credit_charged, 0)
            WHEN type IN ('refund', 'recharge') THEN GREATEST(credits - model_credit_charged, 0)
            WHEN type = 'adjust' THEN credits
            ELSE 0
        END), 0)::bigint AS ledger_balance
    FROM billing_transactions
    GROUP BY user_id
),
active_lease AS (
    SELECT user_id, COALESCE(SUM(remaining_credits), 0)::bigint AS active_lease
    FROM billing_quota_leases
    WHERE status = 'active' AND expires_at > NOW()
    GROUP BY user_id
),
compared AS (
    SELECT
        u.id AS user_id,
        u.balance AS db_balance,
        COALESCE(a.active_lease, 0)::bigint AS active_lease,
        (u.balance + COALESCE(a.active_lease, 0))::bigint AS spendable_balance,
        l.ledger_balance,
        (u.balance + COALESCE(a.active_lease, 0) - l.ledger_balance)::bigint AS diff
    FROM ledger l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN active_lease a ON a.user_id = u.id
)
SELECT *, COUNT(*) OVER() AS mismatch_count
FROM compared
WHERE diff != 0
ORDER BY ABS(diff) DESC, user_id
LIMIT $1`, limit).Find(&rows)
	if err != nil {
		return nil, 0, err
	}
	if len(rows) == 0 {
		return rows, 0, nil
	}
	return rows, rows[0].MismatchCount, nil
}

func StartBillingReconciler(ctx context.Context) {
	go func() {
		log.Println("[billing-reconcile] balance reconciliation monitor started")
		timer := time.NewTimer(30 * time.Second)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				runBalanceReconciliation(ctx)
				timer.Reset(billingReconcileInterval)
			}
		}
	}()
}

func runBalanceReconciliation(ctx context.Context) {
	rows, total, err := AuditBalanceReconciliation(ctx, 20)
	if err != nil {
		log.Printf("[billing-reconcile] audit failed: %v", err)
		return
	}
	if total == 0 {
		return
	}
	log.Printf("[billing-reconcile] detected %d balance mismatches; showing up to %d", total, len(rows))
	for _, row := range rows {
		log.Printf("[billing-reconcile] user=%d db_balance=%d active_lease=%d spendable=%d ledger=%d diff=%d",
			row.UserID, row.DBBalance, row.ActiveLease, row.SpendableBalance, row.LedgerBalance, row.Diff)
	}
}
