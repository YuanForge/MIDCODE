CREATE TABLE IF NOT EXISTS model_groups (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_group_models (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES model_groups(id),
    routing_model VARCHAR(255) NOT NULL,
    channel_id BIGINT NOT NULL REFERENCES channels(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_model_group_models_group_model UNIQUE (group_id, routing_model),
    CONSTRAINT uq_model_group_models_group_channel UNIQUE (group_id, channel_id)
);

CREATE TABLE IF NOT EXISTS api_key_model_groups (
    id BIGSERIAL PRIMARY KEY,
    api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    group_id BIGINT NOT NULL REFERENCES model_groups(id),
    priority INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_api_key_model_groups_key_group UNIQUE (api_key_id, group_id),
    CONSTRAINT uq_api_key_model_groups_key_priority UNIQUE (api_key_id, priority)
);

CREATE INDEX IF NOT EXISTS idx_model_group_models_group_model
    ON model_group_models (group_id, routing_model);
CREATE INDEX IF NOT EXISTS idx_api_key_model_groups_key_priority
    ON api_key_model_groups (api_key_id, priority ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_api_key_model_groups_group
    ON api_key_model_groups (group_id, api_key_id);
CREATE INDEX IF NOT EXISTS idx_llm_logs_user_api_key_created
    ON llm_logs (user_id, api_key_id, created_at DESC)
    WHERE api_key_id > 0;
