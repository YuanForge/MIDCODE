package billing

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"time"

	"fanapi/internal/cache"
	"fanapi/internal/db"
	"fanapi/internal/model"

	"github.com/redis/go-redis/v9"
	"xorm.io/xorm"
)

// Quota leases are the bridge between durable DB balance and fast per-request
// charging:
//
//   - users.balance is the durable free balance that has not been moved into a
//     short-lived spending bucket yet.
//   - billing_quota_leases records the DB-side mirror of credits moved out of
//     users.balance. Multiple active rows for one user are valid; they are
//     summed when rebuilding Redis and debited by earliest expiry first.
//   - billing:quota:<userID> is the hot Redis bucket. Request charging decrements
//     it first so high-concurrency requests fail fast and atomically.
//
// The normal flow is Charge -> Redis decrement -> service.WriteTx ->
// ApplyQuotaLeaseTx. Reclaims move unused expired lease credits back to
// users.balance.
const quotaKeyFmt = "billing:quota:%d"
const quotaVersionKeyFmt = "billing:quota_version:%d"
const quotaLeaseLockNamespace int64 = 20260618

// Bump this when Redis quota semantics change. Old or unversioned keys are
// rebuilt from billing_quota_leases before being trusted.
const quotaCacheVersion = "2"

var quotaLeaseTTL = 30 * time.Minute
var quotaLeaseReclaimGrace = 2 * time.Minute
var quotaChargeRetryDelay = 25 * time.Millisecond

func quotaKey(userID int64) string {
	return fmt.Sprintf(quotaKeyFmt, userID)
}

func quotaVersionKey(userID int64) string {
	return fmt.Sprintf(quotaVersionKeyFmt, userID)
}

func markQuotaCacheVersion(ctx context.Context, userID int64) {
	key := quotaVersionKey(userID)
	_ = cache.Client.Set(ctx, key, quotaCacheVersion, quotaLeaseTTL).Err()
}

func expireQuotaCache(ctx context.Context, userID int64) {
	_ = cache.Client.Expire(ctx, quotaKey(userID), quotaLeaseTTL).Err()
	_ = cache.Client.Expire(ctx, quotaVersionKey(userID), quotaLeaseTTL).Err()
}

func clearQuotaCache(ctx context.Context, userID int64) {
	_ = cache.Client.Del(ctx, quotaKey(userID), quotaVersionKey(userID)).Err()
}

func quotaCacheIsCurrent(ctx context.Context, userID int64) bool {
	val, err := cache.Client.Get(ctx, quotaVersionKey(userID)).Result()
	return err == nil && val == quotaCacheVersion
}

// currentCachedQuota returns only versioned Redis quota. If the version key is
// missing or stale, callers must rebuild from DB before showing or spending it.
func currentCachedQuota(ctx context.Context, userID int64) (int64, bool, error) {
	if !quotaCacheIsCurrent(ctx, userID) {
		return 0, false, nil
	}
	val, err := cache.Client.Get(ctx, quotaKey(userID)).Int64()
	if err == redis.Nil {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return val, true, nil
}

func quotaLeaseExpiresAt() time.Time {
	return time.Now().Add(quotaLeaseTTL)
}

// quotaReserveNeeded returns the extra DB balance that must be moved into the
// hot quota bucket. The "available" value must be Redis-visible quota, not a DB
// lease sum, otherwise a stale Redis bucket can still fail during Charge.
func quotaReserveNeeded(required, activeRemaining int64) int64 {
	if required <= activeRemaining {
		return 0
	}
	return required - activeRemaining
}

type quotaLeaseDebit struct {
	ID     int64
	Amount int64
}

// quotaLeaseDebitPlan spreads one persisted charge across all active lease rows.
// This intentionally supports multiple active leases for the same user.
func quotaLeaseDebitPlan(leases []model.BillingQuotaLease, credits int64) ([]quotaLeaseDebit, bool) {
	if credits <= 0 {
		return nil, true
	}
	remaining := credits
	plan := make([]quotaLeaseDebit, 0, len(leases))
	for _, lease := range leases {
		if remaining <= 0 {
			break
		}
		if lease.ID <= 0 || lease.RemainingCredits <= 0 {
			continue
		}
		amount := lease.RemainingCredits
		if amount > remaining {
			amount = remaining
		}
		plan = append(plan, quotaLeaseDebit{ID: lease.ID, Amount: amount})
		remaining -= amount
	}
	return plan, remaining == 0
}

// reserveQuota moves only the missing amount from users.balance into both the DB
// lease mirror and the Redis quota bucket. The DB part commits first; if Redis
// fails, releaseReservedQuota puts the reserve back.
func reserveQuota(ctx context.Context, userID, required, available int64, reason string) error {
	if required <= 0 {
		return nil
	}
	if available < 0 {
		available = 0
	}
	needed := quotaReserveNeeded(required, available)
	if needed <= 0 {
		return nil
	}

	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		return err
	}
	if _, err := sess.Exec("SELECT pg_advisory_xact_lock($1, $2)", quotaLeaseLockNamespace, userID); err != nil {
		_ = sess.Rollback()
		return err
	}

	rows, err := sess.QueryString("SELECT balance FROM users WHERE id = $1 FOR UPDATE", userID)
	if err != nil {
		_ = sess.Rollback()
		return err
	}
	if len(rows) == 0 {
		_ = sess.Rollback()
		return fmt.Errorf("用户不存在")
	}
	balance, _ := strconv.ParseInt(rows[0]["balance"], 10, 64)
	if balance < needed {
		_ = sess.Rollback()
		return fmt.Errorf("余额不足")
	}

	reserve := needed

	if _, err := sess.Exec("UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1", reserve, userID); err != nil {
		_ = sess.Rollback()
		return err
	}

	expiresAt := quotaLeaseExpiresAt()
	var lease model.BillingQuotaLease
	found, err := sess.Where("user_id = ? AND status = ? AND expires_at > ?", userID, "active", time.Now()).Desc("id").Get(&lease)
	if err != nil {
		_ = sess.Rollback()
		return err
	}
	if found {
		lease.ReservedCredits += reserve
		lease.RemainingCredits += reserve
		lease.ExpiresAt = expiresAt
		if _, err := sess.ID(lease.ID).Cols("reserved_credits", "remaining_credits", "expires_at", "updated_at").Update(&lease); err != nil {
			_ = sess.Rollback()
			return err
		}
	} else {
		lease = model.BillingQuotaLease{
			UserID:           userID,
			ReservedCredits:  reserve,
			RemainingCredits: reserve,
			Status:           "active",
			Reason:           reason,
			ExpiresAt:        expiresAt,
		}
		if _, err := sess.Insert(&lease); err != nil {
			_ = sess.Rollback()
			return err
		}
	}

	if err := sess.Commit(); err != nil {
		return err
	}

	key := quotaKey(userID)
	if err := cache.Client.IncrBy(ctx, key, reserve).Err(); err != nil {
		if releaseErr := releaseReservedQuota(ctx, userID, reserve, "redis_reserve_failed"); releaseErr != nil {
			log.Printf("[quota] release reserve after redis failure failed user=%d reserve=%d err=%v", userID, reserve, releaseErr)
		}
		return err
	}
	markQuotaCacheVersion(ctx, userID)
	expireQuotaCache(ctx, userID)
	InvalidateBalanceCache(ctx, userID)
	return nil
}

// releaseReservedQuota undoes a reserve that was written to DB but never made it
// into Redis. It is deliberately limited to reserve rollback, not normal refund.
func releaseReservedQuota(ctx context.Context, userID, credits int64, reason string) error {
	if credits <= 0 {
		return nil
	}
	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		return err
	}
	if _, err := sess.Exec("SELECT pg_advisory_xact_lock($1, $2)", quotaLeaseLockNamespace, userID); err != nil {
		_ = sess.Rollback()
		return err
	}
	rows, err := sess.QueryString(`
WITH target AS (
    SELECT id, LEAST(remaining_credits, $1)::bigint AS release_amount
    FROM billing_quota_leases
    WHERE user_id = $2 AND status = 'active'
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
),
updated_lease AS (
    UPDATE billing_quota_leases l
    SET reserved_credits = GREATEST(0, reserved_credits - target.release_amount),
        remaining_credits = remaining_credits - target.release_amount,
        updated_at = NOW()
    FROM target
    WHERE l.id = target.id AND target.release_amount > 0
    RETURNING target.release_amount
),
updated_user AS (
    UPDATE users
    SET balance = balance + (SELECT release_amount FROM updated_lease)
    WHERE id = $2 AND EXISTS (SELECT 1 FROM updated_lease)
    RETURNING balance
)
SELECT release_amount FROM updated_lease`, credits, userID)
	if err != nil {
		_ = sess.Rollback()
		return err
	}
	released := int64(0)
	if len(rows) > 0 {
		released, _ = strconv.ParseInt(rows[0]["release_amount"], 10, 64)
	}
	if err := sess.Commit(); err != nil {
		return err
	}
	InvalidateBalanceCache(ctx, userID)
	if reason != "" && released > 0 {
		log.Printf("[quota] released reserve user=%d credits=%d requested=%d reason=%s", userID, released, credits, reason)
	}
	return nil
}

// quotaRemaining is the authoritative read for spendable hot quota. A missing or
// stale Redis key is rebuilt from every active DB lease before use.
func quotaRemaining(ctx context.Context, userID int64) (int64, error) {
	val, err := cache.Client.Get(ctx, quotaKey(userID)).Int64()
	if err == nil {
		if !quotaCacheIsCurrent(ctx, userID) {
			return SyncQuotaToRedis(ctx, userID)
		}
		return val, nil
	}
	if err != redis.Nil {
		return 0, err
	}
	return SyncQuotaToRedis(ctx, userID)
}

// SyncQuotaToRedis rebuilds the hot quota key from all active DB leases. The TTL
// follows the earliest expiring lease so Redis never outlives the DB authority.
func SyncQuotaToRedis(ctx context.Context, userID int64) (int64, error) {
	var rows []struct {
		RemainingCredits int64     `xorm:"remaining_credits"`
		ExpiresAt        time.Time `xorm:"expires_at"`
	}
	if err := db.Engine.Context(ctx).SQL(`
SELECT remaining_credits, expires_at
FROM billing_quota_leases
WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
ORDER BY expires_at ASC, id ASC`, userID).Find(&rows); err != nil {
		return 0, err
	}
	key := quotaKey(userID)
	total := int64(0)
	var earliest time.Time
	for _, row := range rows {
		if row.RemainingCredits <= 0 {
			continue
		}
		total += row.RemainingCredits
		if earliest.IsZero() || row.ExpiresAt.Before(earliest) {
			earliest = row.ExpiresAt
		}
	}
	if total <= 0 || earliest.IsZero() {
		clearQuotaCache(ctx, userID)
		return 0, nil
	}
	now := time.Now()
	reclaimAt := earliest.Add(quotaLeaseReclaimGrace)
	if !reclaimAt.After(now) {
		clearQuotaCache(ctx, userID)
		return 0, nil
	}
	ttl := time.Until(earliest)
	if ttl <= 0 {
		ttl = time.Until(reclaimAt)
	}
	if err := cache.Client.Set(ctx, key, total, ttl).Err(); err != nil {
		return 0, err
	}
	if err := cache.Client.Set(ctx, quotaVersionKey(userID), quotaCacheVersion, ttl).Err(); err != nil {
		return 0, err
	}
	return total, nil
}

// ensureQuota guarantees that the next Redis charge can see at least credits.
// It reserves only the gap, which prevents DB lease sums from hiding a short
// Redis bucket.
func ensureQuota(ctx context.Context, userID, credits int64) error {
	if credits <= 0 {
		return nil
	}
	if reclaimed, amount, err := ReclaimExpiredQuotaLeasesForUser(ctx, userID); err != nil {
		log.Printf("[quota] reclaim expired quota before charge failed user=%d err=%v", userID, err)
	} else if reclaimed > 0 && amount > 0 {
		log.Printf("[quota] reclaimed expired quota before charge user=%d leases=%d credits=%d", userID, reclaimed, amount)
	}
	remaining, err := quotaRemaining(ctx, userID)
	if err != nil {
		return err
	}
	if remaining >= credits {
		return nil
	}
	return reserveQuota(ctx, userID, credits, remaining, "charge")
}

// ensureRefundQuotaLease gives refunds a DB lease row to mirror into even when
// the original active lease already expired.
func ensureRefundQuotaLease(ctx context.Context, userID int64) error {
	var lease model.BillingQuotaLease
	found, err := db.Engine.Where("user_id = ? AND status = ? AND expires_at > ?", userID, "active", time.Now()).Desc("id").Get(&lease)
	if err != nil {
		return err
	}
	if found {
		return nil
	}

	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		return err
	}
	if _, err := sess.Exec("SELECT pg_advisory_xact_lock($1, $2)", quotaLeaseLockNamespace, userID); err != nil {
		_ = sess.Rollback()
		return err
	}
	found, err = sess.Where("user_id = ? AND status = ? AND expires_at > ?", userID, "active", time.Now()).Desc("id").Get(&lease)
	if err != nil {
		_ = sess.Rollback()
		return err
	}
	if !found {
		lease = model.BillingQuotaLease{
			UserID:           userID,
			ReservedCredits:  0,
			RemainingCredits: 0,
			Status:           "active",
			Reason:           "refund",
			ExpiresAt:        quotaLeaseExpiresAt(),
		}
		if _, err := sess.Insert(&lease); err != nil {
			_ = sess.Rollback()
			return err
		}
	}
	return sess.Commit()
}

// ApplyQuotaDelta compensates Redis quota after a pre-applied charge/refund
// transaction fails to persist. It only touches Redis; the failed DB transaction
// already rolled back the lease mirror.
func ApplyQuotaDelta(ctx context.Context, userID, delta int64) error {
	if delta == 0 {
		return nil
	}
	key := quotaKey(userID)
	if delta > 0 {
		exists, err := cache.Client.Exists(ctx, key).Result()
		if err != nil {
			return err
		}
		if exists == 0 {
			_, err = SyncQuotaToRedis(ctx, userID)
			return err
		}
		if !quotaCacheIsCurrent(ctx, userID) {
			_, err = SyncQuotaToRedis(ctx, userID)
			return err
		}
		if err := cache.Client.IncrBy(ctx, key, delta).Err(); err != nil {
			return err
		}
		markQuotaCacheVersion(ctx, userID)
		expireQuotaCache(ctx, userID)
		return nil
	}

	amount := -delta
	exists, err := cache.Client.Exists(ctx, key).Result()
	if err != nil {
		return err
	}
	if exists == 0 {
		_, err = SyncQuotaToRedis(ctx, userID)
		return err
	}
	if !quotaCacheIsCurrent(ctx, userID) {
		_, err = SyncQuotaToRedis(ctx, userID)
		return err
	}
	result, err := luaCharge.Run(ctx, cache.Client, []string{key}, amount).Int64()
	if err != nil {
		return err
	}
	if result < 0 {
		return fmt.Errorf("授权额度补偿失败")
	}
	markQuotaCacheVersion(ctx, userID)
	expireQuotaCache(ctx, userID)
	return nil
}

// ReleasePreAppliedQuota reverts a Redis-only charge before its billing
// transaction has been persisted. It must not update the DB lease because the
// matching charge was never mirrored into billing_quota_leases.
func ReleasePreAppliedQuota(ctx context.Context, userID, credits int64) error {
	if credits <= 0 {
		return nil
	}
	return ApplyQuotaDelta(ctx, userID, credits)
}

// ApplyQuotaLeaseTx mirrors a persisted billing transaction into the DB lease.
// Charges/holds/settles debit all active lease rows by expiry order; refunds add
// back to the newest active row or create a refund row when needed.
func ApplyQuotaLeaseTx(sess *xorm.Session, userID int64, txType string, generalCredits int64) error {
	if userID <= 0 || generalCredits <= 0 {
		return nil
	}
	if _, err := sess.Exec("SELECT pg_advisory_xact_lock($1, $2)", quotaLeaseLockNamespace, userID); err != nil {
		return err
	}
	expiresAt := quotaLeaseExpiresAt()
	switch txType {
	case "charge", "settle", "hold":
		var leases []model.BillingQuotaLease
		if err := sess.SQL(`
SELECT id, remaining_credits
FROM billing_quota_leases
WHERE user_id = $1 AND status = 'active' AND expires_at > NOW() AND remaining_credits > 0
ORDER BY expires_at ASC, id ASC
FOR UPDATE`, userID).Find(&leases); err != nil {
			return err
		}
		plan, ok := quotaLeaseDebitPlan(leases, generalCredits)
		if !ok {
			return fmt.Errorf("授权额度不足或不存在")
		}
		for _, debit := range plan {
			rows, err := sess.QueryString(`
UPDATE billing_quota_leases
SET remaining_credits = remaining_credits - $1,
    expires_at = $2,
    updated_at = NOW()
WHERE id = $3 AND remaining_credits >= $1
RETURNING remaining_credits`, debit.Amount, expiresAt, debit.ID)
			if err != nil {
				return err
			}
			if len(rows) == 0 {
				return fmt.Errorf("授权额度不足或不存在")
			}
		}
	case "refund":
		rows, err := sess.QueryString(`
UPDATE billing_quota_leases
SET remaining_credits = remaining_credits + $1,
    expires_at = $2,
    updated_at = NOW()
WHERE id = (
    SELECT id FROM billing_quota_leases
    WHERE user_id = $3 AND status = 'active' AND expires_at > NOW()
    ORDER BY id DESC
    LIMIT 1
)
RETURNING remaining_credits`, generalCredits, expiresAt, userID)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			lease := model.BillingQuotaLease{
				UserID:           userID,
				ReservedCredits:  0,
				RemainingCredits: generalCredits,
				Status:           "active",
				Reason:           "refund",
				ExpiresAt:        expiresAt,
			}
			if _, err := sess.Insert(&lease); err != nil {
				return err
			}
		}
	}
	return nil
}

// SpendableBalance returns free DB balance plus active authorized quota. If a
// current Redis quota bucket exists, it is used instead of the DB lease sum so
// the balance shown to users tracks what Charge can actually spend.
func SpendableBalance(ctx context.Context, userID int64) (int64, error) {
	if reclaimed, amount, err := ReclaimExpiredQuotaLeasesForUser(ctx, userID); err != nil {
		log.Printf("[quota] reclaim expired quota before balance failed user=%d err=%v", userID, err)
	} else if reclaimed > 0 && amount > 0 {
		log.Printf("[quota] reclaimed expired quota before balance user=%d leases=%d credits=%d", userID, reclaimed, amount)
	}

	var row struct {
		Balance     int64 `xorm:"balance"`
		ActiveLease int64 `xorm:"active_lease"`
	}
	found, err := db.Engine.Context(ctx).SQL(`
SELECT u.balance,
COALESCE((
    SELECT SUM(remaining_credits)
    FROM billing_quota_leases
    WHERE user_id = u.id AND status = 'active' AND expires_at > NOW()
), 0) AS active_lease
FROM users u
WHERE u.id = $1`, userID).Get(&row)
	if err != nil {
		return 0, err
	}
	if !found {
		return 0, fmt.Errorf("用户不存在")
	}
	if quota, ok, err := currentCachedQuota(ctx, userID); err == nil && ok {
		return row.Balance + quota, nil
	}
	return row.Balance + row.ActiveLease, nil
}

// SpendableBalanceTx is the transactional DB-only snapshot used while writing a
// billing transaction. It cannot safely read Redis from inside the DB transaction.
func SpendableBalanceTx(sess *xorm.Session, userID int64) (int64, error) {
	rows, err := sess.QueryString(`
SELECT u.balance + COALESCE((
    SELECT SUM(remaining_credits)
    FROM billing_quota_leases
    WHERE user_id = u.id AND status = 'active' AND expires_at > NOW()
), 0) AS balance
FROM users u
WHERE u.id = $1`, userID)
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, fmt.Errorf("用户不存在")
	}
	balance, _ := strconv.ParseInt(rows[0]["balance"], 10, 64)
	return balance, nil
}

func InvalidateBalanceCache(ctx context.Context, userID int64) {
	if userID <= 0 {
		return
	}
	_ = cache.Client.Del(ctx, balanceKey(userID)).Err()
}

// ReclaimExpiredQuotaLeases returns unused, expired quota from lease rows to
// users.balance after a short grace window.
func ReclaimExpiredQuotaLeases(ctx context.Context, limit int) (int, error) {
	if limit <= 0 {
		limit = 100
	}
	var leases []model.BillingQuotaLease
	if err := db.Engine.Context(ctx).
		Where("status = ? AND expires_at < ?", "active", time.Now().Add(-quotaLeaseReclaimGrace)).
		Asc("expires_at").
		Limit(limit).
		Find(&leases); err != nil {
		return 0, err
	}

	reclaimed := 0
	for _, lease := range leases {
		if err := reclaimQuotaLease(ctx, lease.ID); err != nil {
			return reclaimed, err
		}
		reclaimed++
	}
	return reclaimed, nil
}

func reclaimQuotaLease(ctx context.Context, leaseID int64) error {
	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		return err
	}

	var lease model.BillingQuotaLease
	found, err := sess.ID(leaseID).Get(&lease)
	if err != nil {
		_ = sess.Rollback()
		return err
	}
	if !found || lease.Status != "active" || lease.ExpiresAt.Add(quotaLeaseReclaimGrace).After(time.Now()) {
		return sess.Commit()
	}
	if _, err := sess.Exec("SELECT pg_advisory_xact_lock($1, $2)", quotaLeaseLockNamespace, lease.UserID); err != nil {
		_ = sess.Rollback()
		return err
	}
	found, err = sess.ID(leaseID).Get(&lease)
	if err != nil {
		_ = sess.Rollback()
		return err
	}
	if !found || lease.Status != "active" || lease.ExpiresAt.Add(quotaLeaseReclaimGrace).After(time.Now()) {
		return sess.Commit()
	}

	remaining := lease.RemainingCredits
	if remaining > 0 {
		if _, err := sess.Exec("UPDATE users SET balance = balance + $1 WHERE id = $2", remaining, lease.UserID); err != nil {
			_ = sess.Rollback()
			return err
		}
	}
	lease.RemainingCredits = 0
	lease.Status = "expired"
	if _, err := sess.ID(lease.ID).Cols("remaining_credits", "status", "updated_at").Update(&lease); err != nil {
		_ = sess.Rollback()
		return err
	}
	if err := sess.Commit(); err != nil {
		return err
	}
	clearQuotaCache(ctx, lease.UserID)
	InvalidateBalanceCache(ctx, lease.UserID)
	return nil
}

// ReclaimExpiredQuotaLeasesForUser returns all expired quota leases for a user
// to the durable DB balance. It is intentionally cheap to call on read/charge
// paths so a stalled background syncer cannot strand spendable credits.
func ReclaimExpiredQuotaLeasesForUser(ctx context.Context, userID int64) (int, int64, error) {
	if userID <= 0 {
		return 0, 0, nil
	}
	cutoff := time.Now().Add(-quotaLeaseReclaimGrace)
	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		return 0, 0, err
	}
	if _, err := sess.Exec("SELECT pg_advisory_xact_lock($1, $2)", quotaLeaseLockNamespace, userID); err != nil {
		_ = sess.Rollback()
		return 0, 0, err
	}

	rows, err := sess.QueryString(`
WITH target AS (
    SELECT id, remaining_credits
    FROM billing_quota_leases
    WHERE user_id = $1 AND status = 'active' AND expires_at < $2
    FOR UPDATE
),
summed AS (
    SELECT COUNT(*)::bigint AS lease_count,
           COALESCE(SUM(remaining_credits), 0)::bigint AS reclaim_amount
    FROM target
),
updated_user AS (
    UPDATE users
    SET balance = balance + (SELECT reclaim_amount FROM summed)
    WHERE id = $1 AND (SELECT reclaim_amount FROM summed) > 0
    RETURNING id
),
updated_leases AS (
    UPDATE billing_quota_leases l
    SET remaining_credits = 0,
        status = 'expired',
        updated_at = NOW()
    FROM target t
    WHERE l.id = t.id
    RETURNING l.id
)
SELECT
    (SELECT COUNT(*) FROM updated_leases) AS lease_count,
    (SELECT reclaim_amount FROM summed) AS reclaim_amount,
    (SELECT COUNT(*) FROM updated_user) AS updated_user_count`, userID, cutoff)
	if err != nil {
		_ = sess.Rollback()
		return 0, 0, err
	}
	if len(rows) == 0 {
		_ = sess.Rollback()
		return 0, 0, nil
	}
	reclaimed, _ := strconv.ParseInt(rows[0]["lease_count"], 10, 64)
	amount, _ := strconv.ParseInt(rows[0]["reclaim_amount"], 10, 64)
	updatedUsers, _ := strconv.ParseInt(rows[0]["updated_user_count"], 10, 64)
	if amount > 0 && updatedUsers == 0 {
		_ = sess.Rollback()
		return 0, 0, fmt.Errorf("user %d not found while reclaiming expired quota", userID)
	}
	if err := sess.Commit(); err != nil {
		return 0, 0, err
	}
	if reclaimed > 0 {
		clearQuotaCache(ctx, userID)
		InvalidateBalanceCache(ctx, userID)
	}
	return int(reclaimed), amount, nil
}
