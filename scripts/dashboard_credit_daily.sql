-- Refresh concurrently after initial population. Dates use the same Shanghai
-- attribution as GetUserStats. Keep the request grouping, including refunds.
CREATE MATERIALIZED VIEW dashboard_credit_daily AS
WITH grouped AS (
    SELECT user_id, COALESCE(corr_id, 'tx:' || id::text) AS request_key,
           COALESCE(MIN(created_at) FILTER (WHERE type IN ('charge','hold','settle')), MIN(created_at)) AS usage_at,
           SUM(CASE WHEN type IN ('charge','hold','settle') THEN credits
                    WHEN type='refund' THEN -credits ELSE 0 END) AS credits
    FROM billing_transactions
    GROUP BY user_id, COALESCE(corr_id, 'tx:' || id::text)
)
SELECT user_id, usage_at::date AS day, SUM(credits) AS credits
FROM grouped GROUP BY user_id, usage_at::date;
CREATE UNIQUE INDEX dashboard_credit_daily_uid_day ON dashboard_credit_daily(user_id,day);
