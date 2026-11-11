-- Additive migration for rolling deployments with FANAPI_SKIP_MIGRATIONS=1.
BEGIN;
CREATE TABLE IF NOT EXISTS user_model_preferences (
    id bigserial PRIMARY KEY,
    user_id bigint NOT NULL,
    routing_model varchar(512) NOT NULL,
    pinned boolean NOT NULL DEFAULT false,
    favorite boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQE_user_model_preferences_user_model"
    ON user_model_preferences (user_id, routing_model);
COMMIT;
