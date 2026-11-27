-- Run outside a transaction. Covers the net-charge lookup, including refunds,
-- for each request in the usage report.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_usage_user_corr_cover
    ON billing_transactions (user_id, corr_id)
    INCLUDE (type, credits)
    WHERE corr_id <> '';
