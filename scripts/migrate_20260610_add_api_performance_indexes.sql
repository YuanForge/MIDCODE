-- API performance indexes for user/admin list, log, billing, order, and task endpoints.
-- Run with psql directly. Do not wrap this file in a transaction because of CONCURRENTLY.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_tx_created_id
    ON billing_transactions (created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_tx_type_created
    ON billing_transactions (type, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_tx_user_corr_id
    ON billing_transactions (user_id, corr_id)
    WHERE corr_id != '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_tx_user_api_key_created
    ON billing_transactions (user_id, api_key_id, created_at DESC)
    WHERE api_key_id > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_tx_user_task_metric
    ON billing_transactions (user_id, task_id, created_at DESC)
    WHERE task_id != 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_tx_pool_key_type
    ON billing_transactions (pool_key_id, type)
    WHERE pool_key_id != 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_logs_user_id_desc
    ON llm_logs (user_id, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_logs_user_created
    ON llm_logs (user_id, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_logs_channel_created
    ON llm_logs (channel_id, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_logs_channel_status_created
    ON llm_logs (channel_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_logs_status_created
    ON llm_logs (status, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_logs_model_created
    ON llm_logs (model, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_logs_created_model
    ON llm_logs (created_at DESC, model);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_logs_corr_id_lookup
    ON llm_logs (corr_id)
    WHERE corr_id != '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_user_visible_id
    ON tasks (user_id, id DESC)
    WHERE user_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_user_visible_status_id
    ON tasks (user_id, status, id DESC)
    WHERE user_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_user_visible_type_id
    ON tasks (user_id, type, id DESC)
    WHERE user_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_created_id
    ON tasks (created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_status_id
    ON tasks (status, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_orders_user_created
    ON payment_orders (user_id, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_orders_status_created
    ON payment_orders (status, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_orders_created
    ON payment_orders (created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_orders_channel_created
    ON payment_orders (pay_channel, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_orders_flat_created
    ON payment_orders (pay_flat, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_orders_pending_reuse
    ON payment_orders (user_id, amount, pro_name, pay_flat, created_at DESC)
    WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_status_id
    ON cards (status, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_used_by_used_at
    ON cards (used_by, used_at DESC)
    WHERE status = 'used';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_batch_status
    ON cards (batch_id, status)
    WHERE batch_id != '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_card_batch_status
    ON cards (card_batch_id, status)
    WHERE card_batch_id != 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_inviter_created
    ON users (inviter_id, created_at DESC, id DESC)
    WHERE inviter_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_invite_code_lookup
    ON users (invite_code)
    WHERE invite_code != '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_wechat_openid_lookup
    ON users (wechat_openid)
    WHERE wechat_openid != '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role_id
    ON users (role, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_group_id
    ON users ("group", id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_id
    ON users (is_active, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_id
    ON users (created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_user_id_desc
    ON api_keys (user_id, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_created_at
    ON api_keys (created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_active_created
    ON api_keys (is_active, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_conversations_user_updated
    ON chat_conversations (user_id, updated_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_withdraw_requests_user_created
    ON withdraw_requests (user_id, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_withdraw_requests_status_created
    ON withdraw_requests (status, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_withdraw_requests_pending_user
    ON withdraw_requests (user_id)
    WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pool_keys_pool_active_priority
    ON pool_keys (pool_id, is_active, priority ASC, id ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pool_keys_vendor_id
    ON pool_keys (vendor_id, id DESC)
    WHERE vendor_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_key_pools_channel_active
    ON key_pools (channel_id, is_active, id DESC);
