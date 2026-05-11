-- 提现两段审批流：添加 review_stage 字段
-- cs_review = 等待客服初审（默认）
-- finance_review = 客服初审通过，等待财务复审
-- completed = 已完结

ALTER TABLE withdraw_requests
    ADD COLUMN IF NOT EXISTS review_stage VARCHAR(20) NOT NULL DEFAULT 'cs_review',
    ADD COLUMN IF NOT EXISTS cs_reviewer_id BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cs_reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS finance_reviewer_id BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS finance_reviewed_at TIMESTAMPTZ;

-- 已存在的 approved/rejected 记录视为已完结
UPDATE withdraw_requests SET review_stage = 'completed'
WHERE status IN ('approved', 'rejected');
