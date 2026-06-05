-- ============================================================
-- 超级管理台功能扩展迁移（2026-05-11）
-- 覆盖：卡密批次、渠道变更日志、审计日志、通知、优惠券、
--        风控标签、上游平台、告警、提现凭证、账单字段扩展
-- ============================================================

-- 1. cards 表新增 batch_id（卡密批次关联）
ALTER TABLE cards ADD COLUMN IF NOT EXISTS batch_id VARCHAR(64) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS cards_batch_id_idx ON cards (batch_id) WHERE batch_id != '';

-- 2. card_batches 批次表
CREATE TABLE IF NOT EXISTS card_batches (
    id          BIGSERIAL PRIMARY KEY,
    batch_id    VARCHAR(64) NOT NULL UNIQUE,
    note        TEXT NOT NULL DEFAULT '',
    credits     BIGINT NOT NULL DEFAULT 0,   -- 批次面值（每张）
    count       INT NOT NULL DEFAULT 0,
    created_by  BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. channel_logs 渠道变更日志
CREATE TABLE IF NOT EXISTS channel_logs (
    id          BIGSERIAL PRIMARY KEY,
    channel_id  BIGINT NOT NULL,
    admin_id    BIGINT NOT NULL DEFAULT 0,
    field       VARCHAR(64) NOT NULL DEFAULT '',
    old_val     TEXT NOT NULL DEFAULT '',
    new_val     TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS channel_logs_channel_id_idx ON channel_logs (channel_id);
CREATE INDEX IF NOT EXISTS channel_logs_created_at_idx ON channel_logs (created_at);

-- 4. admin_audit_logs 全局操作审计
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    admin_id        BIGINT NOT NULL DEFAULT 0,
    admin_email     VARCHAR(255) NOT NULL DEFAULT '',
    action          VARCHAR(64) NOT NULL DEFAULT '',   -- create/update/delete/batch
    resource_type   VARCHAR(64) NOT NULL DEFAULT '',   -- user/channel/card/transaction...
    resource_id     BIGINT NOT NULL DEFAULT 0,
    summary         TEXT NOT NULL DEFAULT '',          -- 人类可读摘要
    detail          JSONB NOT NULL DEFAULT '{}',       -- {before, after}
    ip              VARCHAR(64) NOT NULL DEFAULT '',
    ua              TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_id_idx ON admin_audit_logs (admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_resource_type_idx ON admin_audit_logs (resource_type);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON admin_audit_logs (created_at);

-- 5. notifications 通知中心
CREATE TABLE IF NOT EXISTS notifications (
    id              BIGSERIAL PRIMARY KEY,
    title           VARCHAR(255) NOT NULL DEFAULT '',
    content         TEXT NOT NULL DEFAULT '',
    target_type     VARCHAR(32) NOT NULL DEFAULT 'all',  -- all / group / user
    target_value    VARCHAR(255) NOT NULL DEFAULT '',     -- 分组名 or user_id
    status          VARCHAR(16) NOT NULL DEFAULT 'draft', -- draft / sent / scheduled
    created_by      BIGINT NOT NULL DEFAULT 0,
    send_at         TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications (status);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at);

-- 6. coupons 优惠券批次
CREATE TABLE IF NOT EXISTS coupons (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(64) NOT NULL UNIQUE DEFAULT '',  -- 领取码（空=系统发放）
    type            VARCHAR(32) NOT NULL DEFAULT 'discount', -- discount/rebate/gift
    title           VARCHAR(255) NOT NULL DEFAULT '',
    discount_type   VARCHAR(16) NOT NULL DEFAULT 'amount',  -- amount / percent
    discount_value  BIGINT NOT NULL DEFAULT 0,               -- credits or bps(万分之)
    min_amount      BIGINT NOT NULL DEFAULT 0,               -- 满减最低消费 credits
    max_discount    BIGINT NOT NULL DEFAULT 0,               -- 折扣上限 credits，0=不限
    total_count     INT NOT NULL DEFAULT 0,                  -- 0=不限
    used_count      INT NOT NULL DEFAULT 0,
    per_user_limit  INT NOT NULL DEFAULT 1,
    valid_from      TIMESTAMPTZ,
    valid_until     TIMESTAMPTZ,
    created_by      BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. coupon_uses 优惠券使用记录
CREATE TABLE IF NOT EXISTS coupon_uses (
    id          BIGSERIAL PRIMARY KEY,
    coupon_id   BIGINT NOT NULL,
    user_id     BIGINT NOT NULL,
    discount    BIGINT NOT NULL DEFAULT 0,  -- 实际优惠金额 credits
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS coupon_uses_coupon_id_idx ON coupon_uses (coupon_id);
CREATE INDEX IF NOT EXISTS coupon_uses_user_id_idx   ON coupon_uses (user_id);

-- 8. risk_labels 用户风控标签
CREATE TABLE IF NOT EXISTS risk_labels (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    label       VARCHAR(64) NOT NULL DEFAULT '',  -- same_ip_multi / wool / high_consume / custom:xxx
    reason      TEXT NOT NULL DEFAULT '',
    created_by  BIGINT NOT NULL DEFAULT 0,        -- 0=系统自动
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS risk_labels_user_id_idx ON risk_labels (user_id);

-- 9. upstream_platforms 上游平台
CREATE TABLE IF NOT EXISTS upstream_platforms (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL DEFAULT '',
    platform_type   VARCHAR(32) NOT NULL DEFAULT 'openai',
    base_url        TEXT NOT NULL DEFAULT '',
    api_key_enc     TEXT NOT NULL DEFAULT '',  -- 加密存储
    system_token_enc TEXT NOT NULL DEFAULT '',
    upstream_user_id VARCHAR(128) NOT NULL DEFAULT '',
    upstream_group   VARCHAR(128) NOT NULL DEFAULT '',
    balance         BIGINT NOT NULL DEFAULT 0, -- credits，定时同步
    balance_amount  DOUBLE PRECISION NOT NULL DEFAULT 0,
    balance_currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
    balance_synced_at TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    note            TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE upstream_platforms ADD COLUMN IF NOT EXISTS platform_type VARCHAR(32) NOT NULL DEFAULT 'openai';
ALTER TABLE upstream_platforms ADD COLUMN IF NOT EXISTS system_token_enc TEXT NOT NULL DEFAULT '';
ALTER TABLE upstream_platforms ADD COLUMN IF NOT EXISTS upstream_user_id VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE upstream_platforms ADD COLUMN IF NOT EXISTS upstream_group VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE upstream_platforms ADD COLUMN IF NOT EXISTS balance_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE upstream_platforms ADD COLUMN IF NOT EXISTS balance_currency VARCHAR(16) NOT NULL DEFAULT 'CNY';

-- 10. alerts 告警记录
CREATE TABLE IF NOT EXISTS alerts (
    id              BIGSERIAL PRIMARY KEY,
    type            VARCHAR(64) NOT NULL DEFAULT '',   -- channel_error / fail_rate / profit_negative / balance_low
    resource_type   VARCHAR(64) NOT NULL DEFAULT '',
    resource_id     BIGINT NOT NULL DEFAULT 0,
    message         TEXT NOT NULL DEFAULT '',
    status          VARCHAR(16) NOT NULL DEFAULT 'open', -- open / acked / resolved
    acked_by        BIGINT,
    acked_at        TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    detail          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS alerts_status_idx     ON alerts (status);
CREATE INDEX IF NOT EXISTS alerts_created_at_idx ON alerts (created_at);

-- 11. withdraw_requests 新增打款凭证字段
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS proof_url TEXT NOT NULL DEFAULT '';
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS proof_note TEXT NOT NULL DEFAULT '';

-- 12. billing_transactions 新增关联 ID（用于关联跳转）
ALTER TABLE billing_transactions ADD COLUMN IF NOT EXISTS llm_log_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE billing_transactions ADD COLUMN IF NOT EXISTS task_id    BIGINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS bt_llm_log_id_idx ON billing_transactions (llm_log_id) WHERE llm_log_id != 0;
CREATE INDEX IF NOT EXISTS bt_task_id_idx    ON billing_transactions (task_id)    WHERE task_id    != 0;

-- 13. export_tasks 数据导出任务
CREATE TABLE IF NOT EXISTS export_tasks (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL DEFAULT '',
    type        VARCHAR(64)  NOT NULL DEFAULT '',  -- transactions/users/cards/llm_logs
    params      JSONB NOT NULL DEFAULT '{}',
    status      VARCHAR(16)  NOT NULL DEFAULT 'pending', -- pending/processing/done/failed
    progress    INT NOT NULL DEFAULT 0,
    file_url    TEXT NOT NULL DEFAULT '',
    file_size   BIGINT NOT NULL DEFAULT 0,
    error_msg   TEXT NOT NULL DEFAULT '',
    created_by  BIGINT NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS export_tasks_created_by_idx ON export_tasks (created_by);
CREATE INDEX IF NOT EXISTS export_tasks_status_idx     ON export_tasks (status);

-- 14. admin_roles RBAC（基础）
CREATE TABLE IF NOT EXISTS admin_roles (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(64) NOT NULL UNIQUE,
    label       VARCHAR(128) NOT NULL DEFAULT '',
    permissions JSONB NOT NULL DEFAULT '[]',  -- ["channel:read", "user:freeze", ...]
    is_builtin  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
    id          BIGSERIAL PRIMARY KEY,
    admin_id    BIGINT NOT NULL,
    role_id     BIGINT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (admin_id, role_id)
);
CREATE INDEX IF NOT EXISTS admin_user_roles_admin_id_idx ON admin_user_roles (admin_id);

-- 插入内置角色
INSERT INTO admin_roles (name, label, permissions, is_builtin) VALUES
    ('super_admin', '超级管理员', '["*"]', TRUE),
    ('operator',    '运营',       '["user:read","user:freeze","user:group","card:*","channel:read"]', TRUE),
    ('finance',     '财务',       '["billing:read","billing:adjust","withdraw:approve","payment:read"]', TRUE),
    ('support',     '客服',       '["user:read","withdraw:review"]', TRUE),
    ('readonly',    '只读',       '["*:read"]', TRUE)
ON CONFLICT (name) DO NOTHING;
