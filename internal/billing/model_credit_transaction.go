package billing

import (
	"context"
	"fmt"
	"time"

	"fanapi/internal/cache"
	"xorm.io/xorm"
)

// RefundModelCreditTx belongs to the caller's ledger transaction. It never
// changes Redis and therefore remains safe when a refund job is replayed.
func RefundModelCreditTx(sess *xorm.Session, userID int64, modelName string, credits int64) error {
	if modelName == "" || credits <= 0 {
		return fmt.Errorf("invalid model credit refund")
	}
	if _, err := sess.Exec("SELECT pg_advisory_xact_lock($1)", modelCreditLockID(userID, modelName)); err != nil {
		return err
	}
	rows, err := sess.QueryString("SELECT id FROM user_model_credits WHERE user_id=$1 AND model_name=$2 ORDER BY id LIMIT 1 FOR UPDATE", userID, modelName)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		_, err = sess.Exec("INSERT INTO user_model_credits (user_id,model_name,credits,created_at,updated_at) VALUES ($1,$2,$3,NOW(),NOW())", userID, modelName, credits)
	} else {
		_, err = sess.Exec("UPDATE user_model_credits SET credits=credits+$1,updated_at=NOW() WHERE id=$2", credits, rows[0]["id"])
	}
	return err
}

// InvalidateModelCreditCache invalidates both the general-balance display and
// the affected model balance. It never changes the quota used by requests.
func InvalidateModelCreditCache(userID int64, modelName string) {
	if cache.Client == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	keys := []string{balanceKey(userID)}
	if modelName != "" {
		keys = append(keys, modelCreditKey(userID, modelName))
	}
	_ = cache.Client.WithTimeout(250*time.Millisecond).Del(ctx, keys...).Err()
}
