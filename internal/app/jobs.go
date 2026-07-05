package app

import (
	"context"
	"fmt"

	"fanapi/internal/billing"
	"fanapi/internal/config"
	"fanapi/internal/handler"
	"fanapi/internal/service"
	"fanapi/internal/taskresult"
)

func startJobs(ctx context.Context, cfg *config.Config) error {
	_ = billing.SyncBalanceToRedis

	if err := taskresult.StartResultProcessor(cfg.Worker); err != nil {
		return fmt.Errorf("result processor: %w", err)
	}

	billing.StartBalanceSyncer(ctx)
	billing.StartBillingReconciler(ctx)
	service.StartBillingRefundJobWorker(ctx)
	service.StartBillingPostBillingJobWorker(ctx)
	handler.StartLLMLogBatchWriter(ctx)
	taskresult.StartBatchWriter(ctx)
	taskresult.StartPoller(ctx)
	handler.StartUpstreamBalanceMonitor(ctx)
	handler.StartUpstreamCostMonitor(ctx)

	return nil
}
