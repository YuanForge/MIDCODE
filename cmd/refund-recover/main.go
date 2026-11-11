// refund-recover applies reviewed, request-specific refund plans through the
// same durable refund service as the API. It defaults to a read-only preview.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"fanapi/internal/cache"
	"fanapi/internal/config"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"
)

type recoveryPlan struct {
	Incident string          `json:"incident"`
	Entries  []recoveryEntry `json:"entries"`
}

type recoveryEntry struct {
	UserID           int64  `json:"user_id"`
	ChannelID        int64  `json:"channel_id"`
	APIKeyID         int64  `json:"api_key_id"`
	PoolKeyID        int64  `json:"pool_key_id"`
	CorrID           string `json:"corr_id"`
	Credits          int64  `json:"credits"`
	ModelCredits     int64  `json:"model_credits"`
	Cost             int64  `json:"cost"`
	ExpectedNet      int64  `json:"expected_net"`
	ExpectedModelNet int64  `json:"expected_model_net"`
	RoutingKey       string `json:"routing_key"`
	Evidence         string `json:"evidence"`
}

type recoveryResult struct {
	UserID  int64  `json:"user_id"`
	CorrID  string `json:"corr_id"`
	Credits int64  `json:"credits"`
	Status  string `json:"status"`
	Error   string `json:"error,omitempty"`
}

func validatePlan(p recoveryPlan) error {
	if strings.TrimSpace(p.Incident) == "" || len(p.Incident) > 100 || len(p.Entries) == 0 {
		return errors.New("incident and a nonempty reviewed plan are required")
	}
	seen := make(map[string]bool)
	for _, e := range p.Entries {
		key := fmt.Sprintf("%d:%s", e.UserID, e.CorrID)
		if e.UserID <= 0 || strings.TrimSpace(e.CorrID) == "" || len(e.CorrID) > 128 || seen[key] {
			return fmt.Errorf("invalid or duplicate request: %s", key)
		}
		seen[key] = true
		if e.Credits <= 0 || e.ModelCredits < 0 || e.ModelCredits > e.Credits || e.Cost < 0 ||
			e.ExpectedNet < e.Credits || e.ExpectedModelNet < e.ModelCredits || e.ExpectedModelNet > e.ExpectedNet ||
			e.Credits-e.ModelCredits > e.ExpectedNet-e.ExpectedModelNet || strings.TrimSpace(e.Evidence) == "" ||
			(e.ModelCredits > 0 && strings.TrimSpace(e.RoutingKey) == "") {
			return fmt.Errorf("invalid amount or missing evidence: %s", key)
		}
	}
	return nil
}

func recoveryKey(incident string, e recoveryEntry) string {
	return fmt.Sprintf("recovery:%s:%d:%s", incident, e.UserID, e.CorrID)
}

func inspectEntry(ctx context.Context, incident string, e recoveryEntry) (string, error) {
	var original model.BillingTransaction
	found, err := db.Engine.Context(ctx).Where("user_id = ? AND corr_id = ? AND type IN ('hold','charge')", e.UserID, e.CorrID).Asc("id").Get(&original)
	if err != nil {
		return "", err
	}
	if !found || original.ChannelID != e.ChannelID || original.APIKeyID != e.APIKeyID || original.PoolKeyID != e.PoolKeyID {
		return "", errors.New("plan channel, API key or pool key does not match the original charge")
	}
	var existing model.BillingTransaction
	ok, err := db.Engine.Context(ctx).Where("user_id = ? AND corr_id = ? AND type = 'refund' AND metrics->>'refund_dedupe_key' = ?", e.UserID, e.CorrID, recoveryKey(incident, e)).Get(&existing)
	if err != nil {
		return "", err
	}
	if ok {
		if existing.Credits != e.Credits || existing.ModelCreditCharged != e.ModelCredits || existing.Cost != e.Cost {
			return "", errors.New("existing recovery transaction differs from reviewed plan")
		}
		return "already_refunded", nil
	}
	var sums struct {
		Net      int64 `xorm:"net"`
		ModelNet int64 `xorm:"model_net"`
		Holds    int64 `xorm:"holds"`
	}
	_, err = db.Engine.Context(ctx).SQL(`SELECT
COALESCE(SUM(CASE WHEN type IN ('hold','charge','settle') THEN credits WHEN type='refund' THEN -credits ELSE 0 END),0) AS net,
COALESCE(SUM(CASE WHEN type IN ('hold','charge','settle') THEN model_credit_charged WHEN type='refund' THEN -model_credit_charged ELSE 0 END),0) AS model_net,
COUNT(*) FILTER (WHERE type IN ('hold','charge')) AS holds
FROM billing_transactions WHERE user_id=? AND corr_id=?`, e.UserID, e.CorrID).Get(&sums)
	if err != nil {
		return "", err
	}
	if sums.Holds == 0 || sums.Net != e.ExpectedNet || sums.ModelNet != e.ExpectedModelNet {
		return "", fmt.Errorf("billing changed: net=%d model_net=%d; reviewed net=%d model_net=%d", sums.Net, sums.ModelNet, e.ExpectedNet, e.ExpectedModelNet)
	}
	var pending model.BillingRefundJob
	ok, err = db.Engine.Context(ctx).Where("user_id=? AND corr_id=? AND status <> 'done' AND dedupe_key <> ?", e.UserID, e.CorrID, recoveryKey(incident, e)).Get(&pending)
	if err != nil {
		return "", err
	}
	if ok {
		return "", errors.New("another refund job is unfinished for this request")
	}
	return "ready", nil
}

func run() error {
	planPath := flag.String("plan", "", "reviewed recovery plan JSON file")
	apply := flag.Bool("apply", false, "persist refunds; omitted means read-only preview")
	flag.Parse()
	if *planPath == "" {
		return errors.New("-plan is required")
	}
	f, err := os.Open(*planPath)
	if err != nil {
		return err
	}
	defer f.Close()
	var plan recoveryPlan
	d := json.NewDecoder(f)
	d.DisallowUnknownFields()
	if err := d.Decode(&plan); err != nil {
		return err
	}
	if err := validatePlan(plan); err != nil {
		return err
	}
	cfg, err := config.Load()
	if err != nil {
		return errors.New("could not load application configuration")
	}
	if err := db.Init(&cfg.DB, false); err != nil {
		return errors.New("could not connect to database")
	}
	defer db.Engine.Close()
	if *apply {
		// Refunds are durable even if Redis is unavailable. The client is needed
		// only for best-effort invalidation of the displayed balance cache.
		_ = cache.Init(&cfg.Redis)
		if cache.Client != nil {
			defer cache.Client.Close()
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	results := make([]recoveryResult, 0, len(plan.Entries))
	// Validate every entry before submitting the first refund.
	for _, e := range plan.Entries {
		status, err := inspectEntry(ctx, plan.Incident, e)
		if err != nil {
			return fmt.Errorf("preflight user=%d corr=%s: %w", e.UserID, e.CorrID, err)
		}
		results = append(results, recoveryResult{UserID: e.UserID, CorrID: e.CorrID, Credits: e.Credits, Status: status})
	}
	failed := false
	if *apply {
		for i, e := range plan.Entries {
			if results[i].Status == "already_refunded" {
				continue
			}
			metrics := model.JSON{"refund_dedupe_key": recoveryKey(plan.Incident, e), "reason": "refund_timeout_recovery", "incident": plan.Incident, "evidence": e.Evidence, "routing_key": e.RoutingKey, "recovery_expected_net": e.ExpectedNet, "recovery_expected_model_net": e.ExpectedModelNet}
			if err := service.RefundTx(ctx, e.UserID, e.ChannelID, e.APIKeyID, e.PoolKeyID, e.CorrID, e.Credits, e.Cost, e.ModelCredits, metrics); err != nil {
				results[i].Status = "error"
				results[i].Error = err.Error()
				failed = true
				continue
			}
			status, err := inspectEntry(ctx, plan.Incident, e)
			if err != nil {
				results[i].Status = "verification_error"
				results[i].Error = err.Error()
				failed = true
			} else if status == "already_refunded" {
				results[i].Status = "refunded"
			} else {
				results[i].Status = "queued"
				failed = true
			}
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(map[string]interface{}{"incident": plan.Incident, "apply": *apply, "results": results}); err != nil {
		return err
	}
	if failed {
		return errors.New("some refunds require verification or queue processing")
	}
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
