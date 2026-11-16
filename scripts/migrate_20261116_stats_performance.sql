-- Only legacy refunds without a key require correlation fallback.
-- Run outside a transaction. Do not remove existing indexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_tx_unattributed_refund
ON billing_transactions (user_id, corr_id)
WHERE type = 'refund' AND (api_key_id IS NULL OR api_key_id <= 0) AND corr_id <> '';
