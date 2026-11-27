-- Beijing wall-clock buckets, matching llm_logs.created_at.
CREATE TABLE IF NOT EXISTS usage_hourly (
    user_id bigint NOT NULL, bucket timestamp NOT NULL, model text NOT NULL,
    requests bigint NOT NULL, success bigint NOT NULL, failed bigint NOT NULL,
    credits bigint NOT NULL, input bigint NOT NULL, cache_read bigint NOT NULL,
    cache_write bigint NOT NULL, output bigint NOT NULL,
    PRIMARY KEY (user_id, bucket, model)
);
CREATE TABLE IF NOT EXISTS usage_daily (LIKE usage_hourly INCLUDING ALL);
CREATE TABLE IF NOT EXISTS usage_rollup_state (
    user_id bigint NOT NULL, day date NOT NULL, covered_until timestamp,
    unsafe boolean NOT NULL DEFAULT false, dirty boolean NOT NULL DEFAULT true, PRIMARY KEY (user_id, day)
);

-- Append-only until consumed. Source transactions never wait for a backfill.
CREATE TABLE IF NOT EXISTS usage_rollup_changes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint, at_time timestamp, corr text, channel bigint
);
CREATE OR REPLACE FUNCTION usage_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='llm_logs' THEN
        IF TG_OP<>'INSERT' THEN INSERT INTO usage_rollup_changes(user_id,at_time,corr) VALUES(OLD.user_id,OLD.created_at,OLD.corr_id); END IF;
        IF TG_OP<>'DELETE' THEN INSERT INTO usage_rollup_changes(user_id,at_time,corr) VALUES(NEW.user_id,NEW.created_at,NEW.corr_id); END IF;
    ELSIF TG_TABLE_NAME='billing_transactions' THEN
        IF TG_OP<>'INSERT' AND OLD.corr_id<>'' THEN INSERT INTO usage_rollup_changes(user_id,corr) VALUES(OLD.user_id,OLD.corr_id); END IF;
        IF TG_OP<>'DELETE' AND NEW.corr_id<>'' THEN INSERT INTO usage_rollup_changes(user_id,corr) VALUES(NEW.user_id,NEW.corr_id); END IF;
    ELSE
        IF TG_OP<>'INSERT' THEN INSERT INTO usage_rollup_changes(channel) VALUES(OLD.id); END IF;
        IF TG_OP<>'DELETE' THEN INSERT INTO usage_rollup_changes(channel) VALUES(NEW.id); END IF;
    END IF;
    RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER usage_log_changed AFTER INSERT OR DELETE OR UPDATE OF user_id,model,channel_id,corr_id,status,created_at,usage ON llm_logs
FOR EACH ROW EXECUTE FUNCTION usage_capture_change();
CREATE OR REPLACE TRIGGER usage_ledger_changed AFTER INSERT OR DELETE OR UPDATE OF user_id,corr_id,type,credits ON billing_transactions
FOR EACH ROW EXECUTE FUNCTION usage_capture_change();
CREATE OR REPLACE TRIGGER usage_channel_changed AFTER INSERT OR DELETE OR UPDATE OF protocol ON channels
FOR EACH ROW EXECUTE FUNCTION usage_capture_change();
