package service

import (
	"context"
	"fmt"
	"math"
	"strconv"

	"fanapi/internal/db"
	"fanapi/internal/model"
	"xorm.io/xorm"
)

// Called in the billing transaction: quota movement, source attribution and
// request net consumption either all commit or all roll back.
func trackInviteFundsTx(sess *xorm.Session, tx *model.BillingTransaction) error {
	if !isPostBillingTx(tx.Type) && !(tx.Type == "adjust" && tx.Credits < 0) {
		return nil
	}
	var user model.User
	found, err := sess.SQL("SELECT * FROM users WHERE id = ? FOR UPDATE", tx.UserID).Get(&user)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("invite funds: user not found")
	}
	if tx.Type == "adjust" {
		_, err = sess.Exec("UPDATE users SET reward_balance = GREATEST(0, reward_balance + ?) WHERE id = ?", tx.Credits, tx.UserID)
		return err
	}
	if tx.CorrID == "" {
		return fmt.Errorf("consumption requires corr_id for reward attribution")
	}
	var row model.InviteRebate
	found, err = sess.SQL("SELECT * FROM invite_rebates WHERE user_id = ? AND corr_id = ? FOR UPDATE", tx.UserID, tx.CorrID).Get(&row)
	if err != nil {
		return err
	}
	if !found {
		// A refund for a pre-upgrade request has no attributable reward funds.
		if tx.Type == "refund" {
			return nil
		}
		row.UserID, row.CorrID = tx.UserID, tx.CorrID
		if user.InviterID != nil && *user.InviterID != user.ID {
			row.InviterID = *user.InviterID
		}
		if user.RebateRatio != nil {
			row.Ratio = *user.RebateRatio
		} else {
			var setting model.SystemSetting
			if _, err := sess.Where("key = ?", "default_rebate_ratio").Get(&setting); err != nil {
				return err
			}
			row.Ratio, _ = strconv.ParseFloat(setting.Value, 64)
		}
		if math.IsNaN(row.Ratio) || math.IsInf(row.Ratio, 0) || row.Ratio < 0 || row.Ratio > 1 {
			row.Ratio = 0
		}
	}
	rewardBalance := applyInviteFunds(&row, user.RewardBalance, tx.Type, tx.Credits, tx.ModelCreditCharged)
	row.Pending = true
	if _, err := sess.Exec("UPDATE users SET reward_balance = ? WHERE id = ?", rewardBalance, user.ID); err != nil {
		return err
	}
	if found {
		_, err = sess.ID(row.ID).AllCols().Update(&row)
	} else {
		_, err = sess.Insert(&row)
	}
	return err
}

func applyInviteFunds(row *model.InviteRebate, available int64, kind string, credits, modelCredits int64) int64 {
	general := max(int64(0), credits-modelCredits)
	if kind == "refund" {
		// Reverse consumption order: return paid funds first, then reward funds.
		reward := min(row.RewardCredits, max(int64(0), general-(row.GeneralCredits-row.RewardCredits)))
		row.GeneralCredits = max(int64(0), row.GeneralCredits-general)
		row.RewardCredits -= reward
		row.EligibleCredits = max(int64(0), row.EligibleCredits-(credits-reward))
		return available + reward
	}
	reward := min(available, general)
	row.GeneralCredits += general
	row.RewardCredits += reward
	row.EligibleCredits += credits - reward
	return available - reward
}

// Success is taken from durable request completion records, not from a hold or
// a timer. Refund jobs must finish first. Failed/pending requests cannot pay out.
const inviteRebateReadySQL = `r.pending = TRUE AND (
 r.paid_credits > 0 OR r.eligible_credits = 0 OR
 EXISTS (SELECT 1 FROM llm_logs l WHERE l.corr_id = r.corr_id AND l.user_id = r.user_id AND l.status = 'ok') OR
 EXISTS (SELECT 1 FROM tasks t WHERE t.corr_id = r.corr_id AND t.user_id = r.user_id AND t.status = 'done')
) AND NOT EXISTS (
 SELECT 1 FROM billing_refund_jobs f WHERE f.corr_id = r.corr_id AND f.user_id = r.user_id AND f.status <> 'done'
)`

func ProcessInviteRebates(ctx context.Context, limit int) error {
	if limit <= 0 {
		limit = 100
	}
	var rows []model.InviteRebate
	if err := db.Engine.Context(ctx).SQL("SELECT r.* FROM invite_rebates r WHERE "+inviteRebateReadySQL+" ORDER BY r.id LIMIT ?", limit).Find(&rows); err != nil {
		return err
	}
	for _, row := range rows {
		if err := settleInviteRebate(ctx, row.ID); err != nil {
			return err
		}
	}
	return nil
}

func settleInviteRebate(ctx context.Context, id int64) error {
	sess := db.Engine.NewSession()
	defer sess.Close()
	sess = sess.Context(ctx)
	if err := sess.Begin(); err != nil {
		return err
	}
	defer sess.Rollback()
	var row model.InviteRebate
	found, err := sess.SQL("SELECT r.* FROM invite_rebates r WHERE r.id = ? AND "+inviteRebateReadySQL+" FOR UPDATE OF r", id).Get(&row)
	if err != nil || !found {
		return err
	}
	target := int64(float64(row.EligibleCredits) * row.Ratio)
	delta := target - row.PaidCredits
	if row.InviterID > 0 && delta != 0 {
		// Debt preserves clawbacks even if the recipient already converted or
		// withdrew the reward. Subsequent rewards repay it before becoming usable.
		err = changeInviteRewardTx(sess, row.InviterID, delta)
		if err != nil {
			return err
		}
	}
	if _, err := sess.Exec("UPDATE invite_rebates SET paid_credits = ?, pending = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?", target, row.ID); err != nil {
		return err
	}
	return sess.Commit()
}

func changeInviteRewardTx(sess *xorm.Session, inviterID, delta int64) error {
	_, err := sess.Exec(`UPDATE users SET
 frozen_balance = GREATEST(0, frozen_balance + ? - rebate_debt),
 rebate_debt = GREATEST(0, rebate_debt - frozen_balance - ?)
 WHERE id = ?`, delta, delta, inviterID)
	return err
}
