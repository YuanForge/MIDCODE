-- 7.4 卡密绑定分销：cards 表新增 vendor_id 字段
ALTER TABLE cards ADD COLUMN IF NOT EXISTS vendor_id bigint DEFAULT NULL REFERENCES vendors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cards_vendor_id ON cards (vendor_id) WHERE vendor_id IS NOT NULL;
