-- Add groups (channel group tags) to channels
ALTER TABLE channels ADD COLUMN IF NOT EXISTS groups jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_channels_groups ON channels USING GIN (groups);
