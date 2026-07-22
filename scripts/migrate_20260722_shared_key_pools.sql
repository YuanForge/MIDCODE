ALTER TABLE key_pools
    ALTER COLUMN channel_id DROP NOT NULL;

ALTER TABLE key_pools
    DROP CONSTRAINT IF EXISTS key_pools_channel_id_fkey;

ALTER TABLE key_pools
    ADD CONSTRAINT key_pools_channel_id_fkey
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_channels_key_pool_id
    ON channels (key_pool_id)
    WHERE key_pool_id > 0;
