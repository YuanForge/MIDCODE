package service

import (
	"context"
	"errors"
	"fanapi/internal/billing"
	"fanapi/internal/cache"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"math"
)

var ErrTransfer = errors.New("转赠失败：请检查用户 ID、账户状态和可转赠积分")

// TransferCredits moves only unreserved funds. Active API leases remain spendable
// by their original owner. Both ledgers and reward provenance commit together.
func TransferCredits(ctx context.Context, from, to, amount int64, requestID string) error {
	if from <= 0 || to <= 0 || from == to || amount <= 0 || len(requestID) < 16 || len(requestID) > 64 {
		return ErrTransfer
	}
	sess := db.Engine.NewSession()
	defer sess.Close()
	sess = sess.Context(ctx)
	if err := sess.Begin(); err != nil {
		return err
	}
	defer sess.Rollback()
	// Shared with DB->Redis synchronization to serialize changes and cache rebuilds.
	ids := []int64{min(from, to), max(from, to)}
	for _, id := range ids {
		if _, err := sess.Exec("SELECT pg_advisory_xact_lock($1, $2)", int64(20260617), id); err != nil {
			return err
		}
	}
	corr := "gift:" + requestID
	var previous model.BillingTransaction
	found, err := sess.Where("user_id = ? AND corr_id = ? AND type = ?", from, corr, "transfer_out").Get(&previous)
	if err != nil {
		return err
	}
	if found {
		if previous.Credits != amount || metricInt64(previous.Metrics, "recipient_id") != to {
			return ErrTransfer
		}
		return sess.Commit()
	}
	var users []model.User
	if err := sess.SQL("SELECT * FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE", from, to).Find(&users); err != nil {
		return err
	}
	if len(users) != 2 {
		return ErrTransfer
	}
	sender, recipient := users[0], users[1]
	if sender.ID != from {
		sender, recipient = recipient, sender
	}
	if !sender.IsActive || !recipient.IsActive || sender.Balance < amount || recipient.Balance > math.MaxInt64-amount {
		return ErrTransfer
	}
	reward := min(amount, max(int64(0), sender.RewardBalance))
	if recipient.RewardBalance > math.MaxInt64-reward {
		return ErrTransfer
	}
	for _, change := range []struct {
		id, delta, reward int64
		kind              string
		peer              int64
	}{
		{from, -amount, -reward, "transfer_out", to}, {to, amount, reward, "transfer_in", from},
	} {
		if _, err := sess.Exec("UPDATE users SET balance = balance + ?, reward_balance = reward_balance + ? WHERE id = ?", change.delta, change.reward, change.id); err != nil {
			return err
		}
		balance, err := billing.SpendableBalanceTx(sess, change.id)
		if err != nil {
			return err
		}
		tx := model.BillingTransaction{UserID: change.id, CorrID: corr, Type: change.kind, Credits: amount, BalanceAfter: balance, Metrics: model.JSON{"recipient_id": to, "sender_id": from, "peer_user_id": change.peer, "reward_credits": reward}}
		if _, err := sess.Insert(&tx); err != nil {
			return err
		}
		job := model.BalanceSyncJob{UserID: change.id, Delta: change.delta, Reason: change.kind, CorrID: corr, Status: "pending"}
		if _, err := sess.Insert(&job); err != nil {
			return err
		}
	}
	if err := sess.Commit(); err != nil {
		return err
	}
	if cache.Client != nil {
		billing.InvalidateBalanceCache(context.Background(), from)
		billing.InvalidateBalanceCache(context.Background(), to)
	}
	return nil
}
