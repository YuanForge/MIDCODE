BEGIN;

CREATE TABLE IF NOT EXISTS model_official_prices (
    id BIGSERIAL PRIMARY KEY,
    model_provider_id BIGINT NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    billing_type VARCHAR(16) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    source_price_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    normalized_price_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    exchange_rate_used VARCHAR(64) NOT NULL DEFAULT '',
    exchange_rate_date VARCHAR(32) NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_model_official_prices_model_provider
        FOREIGN KEY (model_provider_id) REFERENCES model_providers (id) ON DELETE RESTRICT,
    CONSTRAINT ck_model_official_prices_model_name_trimmed
        CHECK (model_name <> '' AND model_name = BTRIM(model_name)),
    CONSTRAINT ck_model_official_prices_billing_type
        CHECK (billing_type IN ('token', 'image', 'video', 'audio', 'count')),
    CONSTRAINT ck_model_official_prices_currency
        CHECK (currency IN ('USD', 'CNY')),
    CONSTRAINT uq_model_official_prices_provider_model_type
        UNIQUE (model_provider_id, model_name, billing_type)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_model_official_prices_model_provider'
          AND conrelid = 'model_official_prices'::regclass
    ) THEN
        ALTER TABLE model_official_prices
            ADD CONSTRAINT fk_model_official_prices_model_provider
            FOREIGN KEY (model_provider_id) REFERENCES model_providers (id) ON DELETE RESTRICT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_model_official_prices_model_name_trimmed'
          AND conrelid = 'model_official_prices'::regclass
    ) THEN
        ALTER TABLE model_official_prices
            ADD CONSTRAINT ck_model_official_prices_model_name_trimmed
            CHECK (model_name <> '' AND model_name = BTRIM(model_name));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_model_official_prices_billing_type'
          AND conrelid = 'model_official_prices'::regclass
    ) THEN
        ALTER TABLE model_official_prices
            ADD CONSTRAINT ck_model_official_prices_billing_type
            CHECK (billing_type IN ('token', 'image', 'video', 'audio', 'count'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_model_official_prices_currency'
          AND conrelid = 'model_official_prices'::regclass
    ) THEN
        ALTER TABLE model_official_prices
            ADD CONSTRAINT ck_model_official_prices_currency
            CHECK (currency IN ('USD', 'CNY'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_model_official_prices_provider_model_type'
          AND conrelid = 'model_official_prices'::regclass
    ) THEN
        ALTER TABLE model_official_prices
            ADD CONSTRAINT uq_model_official_prices_provider_model_type
            UNIQUE (model_provider_id, model_name, billing_type);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_model_official_prices_lookup
    ON model_official_prices (model_provider_id, model_name, billing_type, is_active);

COMMIT;
