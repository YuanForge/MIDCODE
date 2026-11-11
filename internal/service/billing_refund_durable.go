package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"fanapi/internal/billing"
	"fanapi/internal/db"
	"fanapi/internal/model"
)

const durableRefundMode = "db_refund_v1"

// Old binaries only claim pending/running. Separate states prevent them from
// applying a new database-first intent using legacy pre-applied semantics.
func refundPendingStatus(metrics model.JSON) string {
	if metrics["refund_mode"] == durableRefundMode {
		return "pending_db"
	}
	return "pending"
}

// Refund events are identified by request and phase, not mutable usage or
// error text. Each request settles once, or aborts once; retries use a new corr.
func durableRefundDedupeKey(userID int64, corrID string, metrics model.JSON) string {
	if key, _ := metrics["refund_dedupe_key"].(string); key != "" {
		return key
	}
	phase := "abort"
	if _, ok := metrics["actual_cost"]; ok {
		phase = "settlement"
	}
	if metrics["reason"] == "image_count_adjust" {
		phase = "settlement"
	}
	payload, _ := json.Marshal([]interface{}{userID, corrID, phase})
	sum := sha256.Sum256(payload)
	key := "db-refund:" + hex.EncodeToString(sum[:])
	metrics["refund_dedupe_key"] = key
	return key
}

// RefundTx durably accepts a refund before changing any money. A nil return
// means the refund is committed or its intent is queued for retry. Redis is
// never credited: general refunds return to users.balance, and model credits,
// the ledger and reward attribution commit in the same database transaction.
func RefundTx(ctx context.Context, userID, channelID, apiKeyID, poolKeyID int64, corrID string, credits, cost, modelCredits int64, metrics model.JSON) error {
	if credits == 0 {
		return nil
	}
	if userID <= 0 || corrID == "" || credits < 0 || modelCredits < 0 || modelCredits > credits {
		return fmt.Errorf("invalid refund intent")
	}
	metrics = cloneMetrics(metrics)
	if modelCredits > 0 {
		if key, _ := metrics["routing_key"].(string); key == "" {
			return fmt.Errorf("model credit refund requires routing_key")
		}
	}
	metrics["refund_mode"] = durableRefundMode
	key := durableRefundDedupeKey(userID, corrID, metrics)
	if err := enqueueRefundJob(ctx, userID, channelID, apiKeyID, poolKeyID, corrID, credits, cost, modelCredits, metrics, key, nil); err != nil {
		return fmt.Errorf("persist refund intent: %w", err)
	}
	var job model.BillingRefundJob
	found, err := db.Engine.Context(ctx).Where("dedupe_key = ?", key).Get(&job)
	if err != nil {
		// The intent is durable even if this immediate read fails.
		log.Printf("[billing-refund] accepted intent lookup deferred user=%d corr_id=%s err=%v", userID, corrID, err)
		return nil
	}
	if !found || job.UserID != userID || job.CorrID != corrID || job.Credits != credits || job.ModelCreditRefunded != modelCredits || job.Cost != cost || job.ChannelID != channelID || job.APIKeyID != apiKeyID || job.PoolKeyID != poolKeyID || job.Metrics["routing_key"] != metrics["routing_key"] || job.Metrics["refund_mode"] != durableRefundMode {
		return fmt.Errorf("refund dedupe key conflicts with existing intent")
	}
	if job.Status == "done" {
		return nil
	}
	claimed, err := claimBillingRefundJob(ctx, job.ID)
	if err != nil || !claimed {
		return nil // An existing worker or the durable queue owns the intent.
	}
	if err := processBillingRefundJob(ctx, job); err != nil {
		// A crash here is also safe: stale running jobs are reclaimed by the worker.
		retryCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = releaseBillingRefundJob(retryCtx, job.ID, err)
		log.Printf("[billing-refund] accepted intent processing deferred user=%d corr_id=%s err=%v", userID, corrID, err)
	}
	return nil
}

// writeDurableRefund is called by the existing persistent job worker. Old jobs
// without refund_mode retain their pre-applied Redis/model-credit semantics.
func writeDurableRefund(ctx context.Context, userID, channelID, apiKeyID, poolKeyID int64, corrID string, credits, cost, modelCredits int64, metrics model.JSON) error {
	if credits <= 0 || modelCredits < 0 || modelCredits > credits || corrID == "" {
		return fmt.Errorf("invalid durable refund")
	}
	key := durableRefundDedupeKey(userID, corrID, metrics)
	sess := db.Engine.NewSession().Context(ctx)
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		return err
	}
	defer sess.Rollback()
	// Same order as quota/hold operations, serializing refunds with charges and
	// other refunds for this account before inspecting the refundable amount.
	if _, err := sess.Exec("SELECT pg_advisory_xact_lock($1, $2)", int64(20260618), userID); err != nil {
		return err
	}
	if exists, err := refundTxExists(sess, key); err != nil {
		return err
	} else if exists {
		return sess.Commit()
	}
	var net struct {
		General int64 `xorm:"general"`
		Model   int64 `xorm:"model"`
	}
	_, err := sess.SQL(`SELECT
 COALESCE(SUM(CASE WHEN type IN ('hold','charge','settle') THEN credits-model_credit_charged WHEN type='refund' THEN -(credits-model_credit_charged) ELSE 0 END),0)::bigint AS general,
 COALESCE(SUM(CASE WHEN type IN ('hold','charge','settle') THEN model_credit_charged WHEN type='refund' THEN -model_credit_charged ELSE 0 END),0)::bigint AS model
 FROM billing_transactions WHERE user_id=$1 AND corr_id=$2`, userID, corrID).Get(&net)
	if err != nil {
		return err
	}
	if _, ok := metrics["recovery_expected_net"]; ok && net.General+net.Model != metricInt64(metrics, "recovery_expected_net") {
		return fmt.Errorf("refund recovery net changed: actual=%d expected=%d", net.General+net.Model, metricInt64(metrics, "recovery_expected_net"))
	}
	if _, ok := metrics["recovery_expected_model_net"]; ok && net.Model != metricInt64(metrics, "recovery_expected_model_net") {
		return fmt.Errorf("refund recovery model net changed: actual=%d expected=%d", net.Model, metricInt64(metrics, "recovery_expected_model_net"))
	}
	general := credits - modelCredits
	if general > net.General || modelCredits > net.Model {
		return fmt.Errorf("refund exceeds remaining charge: requested_general=%d available_general=%d requested_model=%d available_model=%d", general, net.General, modelCredits, net.Model)
	}
	if general > 0 {
		result, err := sess.Exec("UPDATE users SET balance=balance+$1 WHERE id=$2", general, userID)
		if err != nil {
			return err
		}
		if n, err := result.RowsAffected(); err != nil || n != 1 {
			return fmt.Errorf("refund user missing: %d", userID)
		}
	}
	routingKey, _ := metrics["routing_key"].(string)
	if modelCredits > 0 {
		if err := billing.RefundModelCreditTx(sess, userID, routingKey, modelCredits); err != nil {
			return err
		}
	}
	tx := &model.BillingTransaction{UserID: userID, ChannelID: channelID, APIKeyID: apiKeyID, PoolKeyID: poolKeyID,
		CorrID: corrID, Type: "refund", Credits: credits, Cost: cost, ModelCreditCharged: modelCredits,
		Metrics: metrics, TaskID: metricInt64(metrics, "task_id"), LLMLogID: metricInt64(metrics, "llm_log_id")}
	if tx.BalanceAfter, err = billing.SpendableBalanceTx(sess, userID); err != nil {
		return err
	}
	if _, err := sess.Insert(tx); err != nil {
		return err
	}
	if err := trackInviteFundsTx(sess, tx); err != nil {
		return err
	}
	tracked, err := sess.Where("user_id = ? AND corr_id = ?", userID, corrID).Exist(new(model.InviteRebate))
	if err != nil {
		return err
	}
	legacyRebateCredits := int64(0)
	if !tracked {
		legacyRebateCredits = credits
	}
	if job := postBillingJobForTx(userID, poolKeyID, "refund", legacyRebateCredits, cost); job != nil {
		job.RebateDone = legacyRebateCredits == 0
		if _, err := sess.Insert(job); err != nil {
			return err
		}
	}
	if err := sess.Commit(); err != nil {
		// An ambiguous commit is retried using the same unique ledger key.
		return err
	}
	// Cache invalidation is best effort after commit, never part of refund
	// success. These reads always have a database authority to fall back to.
	billing.InvalidateModelCreditCache(userID, routingKey)
	return nil
}
