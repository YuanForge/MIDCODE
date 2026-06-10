-- Per-pool-key upstream URL. Vendors can provide their own endpoint while the
-- platform keeps channel-level scripts, pricing, routing, and billing.
ALTER TABLE pool_keys
    ADD COLUMN IF NOT EXISTS base_url_override TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN pool_keys.base_url_override IS 'Per-key upstream base URL override; empty means use channels.base_url.';
