BEGIN;

CREATE TABLE IF NOT EXISTS model_providers (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(128) NOT NULL,
    name VARCHAR(128) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_model_providers_code_ci
    ON model_providers (LOWER(code));
CREATE UNIQUE INDEX IF NOT EXISTS uq_model_providers_name_ci
    ON model_providers (LOWER(BTRIM(name)));

ALTER TABLE model_groups
    ADD COLUMN IF NOT EXISTS model_provider_id BIGINT;
ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS model_provider_id BIGINT;

CREATE TEMP TABLE model_provider_candidates ON COMMIT DROP AS
WITH legacy_names AS (
    SELECT REGEXP_REPLACE(BTRIM(model_provider), '\s+', ' ', 'g') AS legacy_name
    FROM model_groups
    UNION
    SELECT REGEXP_REPLACE(BTRIM(model_provider), '\s+', ' ', 'g') AS legacy_name
    FROM channels
), normalized AS (
    SELECT DISTINCT LOWER(legacy_name) AS source_key, legacy_name
    FROM legacy_names
    WHERE legacy_name <> ''
), known(source_key, code, name) AS (
    VALUES
        ('openai', 'openai', 'OpenAI'),
        ('anthropic', 'anthropic', 'Anthropic'),
        ('google', 'google', 'Google'),
        ('deepseek', 'deepseek', 'DeepSeek'),
        ('alibaba', 'alibaba', 'Alibaba')
)
SELECT
    normalized.source_key,
    COALESCE(known.code, TRIM(BOTH '-' FROM REGEXP_REPLACE(normalized.source_key, '[^a-z0-9]+', '-', 'g'))) AS code,
    COALESCE(known.name, MIN(normalized.legacy_name)) AS name
FROM normalized
LEFT JOIN known ON known.source_key = normalized.source_key
GROUP BY normalized.source_key, known.code, known.name;

DO $$
DECLARE
    blank_legacy_values BIGINT;
    provider_collisions BIGINT;
    unresolved_provider_codes BIGINT;
    mismatched_group_channels BIGINT;
    cross_provider_models BIGINT;
BEGIN
    SELECT
        (SELECT COUNT(*) FROM model_groups WHERE BTRIM(model_provider) = '') +
        (SELECT COUNT(*) FROM channels WHERE BTRIM(model_provider) = '')
    INTO blank_legacy_values;

    SELECT COUNT(*) INTO provider_collisions
    FROM (
        SELECT code
        FROM model_provider_candidates
        GROUP BY code
        HAVING COUNT(*) > 1
        UNION ALL
        SELECT candidate.code
        FROM model_provider_candidates candidate
        JOIN model_providers existing
          ON LOWER(existing.code) = LOWER(candidate.code)
          OR LOWER(BTRIM(existing.name)) = LOWER(BTRIM(candidate.name))
        WHERE LOWER(existing.code) <> LOWER(candidate.code)
           OR LOWER(BTRIM(existing.name)) <> LOWER(BTRIM(candidate.name))
    ) conflicts;

    SELECT COUNT(*) INTO unresolved_provider_codes
    FROM model_provider_candidates
    WHERE code = '' OR code !~ '^[a-z0-9][a-z0-9_-]*$';

    SELECT COUNT(*) INTO mismatched_group_channels
    FROM model_groups mg
    JOIN model_group_models mgm ON mgm.group_id = mg.id
    JOIN channels c ON c.id = mgm.channel_id
    WHERE LOWER(REGEXP_REPLACE(BTRIM(mg.model_provider), '\s+', ' ', 'g')) <>
          LOWER(REGEXP_REPLACE(BTRIM(c.model_provider), '\s+', ' ', 'g'));

    SELECT COUNT(*) INTO cross_provider_models
    FROM (
        SELECT mgm.routing_model
        FROM model_group_models mgm
        JOIN model_groups mg ON mg.id = mgm.group_id
        GROUP BY mgm.routing_model
        HAVING COUNT(DISTINCT LOWER(REGEXP_REPLACE(BTRIM(mg.model_provider), '\s+', ' ', 'g'))) > 1
    ) conflicts;

    IF blank_legacy_values > 0
       OR provider_collisions > 0
       OR unresolved_provider_codes > 0
       OR mismatched_group_channels > 0
       OR cross_provider_models > 0 THEN
        RAISE EXCEPTION
            'model provider audit failed: blank_legacy_values=%, provider_collisions=%, unresolved_provider_codes=%, mismatched_group_channels=%, cross_provider_models=%',
            blank_legacy_values, provider_collisions, unresolved_provider_codes, mismatched_group_channels, cross_provider_models;
    END IF;
END
$$;

INSERT INTO model_providers (code, name, is_active, sort_order)
SELECT code, name, TRUE, ROW_NUMBER() OVER (ORDER BY code) - 1
FROM model_provider_candidates
ON CONFLICT DO NOTHING;

UPDATE model_groups mg
SET model_provider_id = mp.id,
    model_provider = candidate.name
FROM model_provider_candidates candidate
JOIN model_providers mp
  ON LOWER(mp.code) = LOWER(candidate.code)
 AND LOWER(BTRIM(mp.name)) = LOWER(BTRIM(candidate.name))
WHERE LOWER(REGEXP_REPLACE(BTRIM(mg.model_provider), '\s+', ' ', 'g')) = candidate.source_key;

UPDATE channels c
SET model_provider_id = mp.id,
    model_provider = candidate.name
FROM model_provider_candidates candidate
JOIN model_providers mp
  ON LOWER(mp.code) = LOWER(candidate.code)
 AND LOWER(BTRIM(mp.name)) = LOWER(BTRIM(candidate.name))
WHERE LOWER(REGEXP_REPLACE(BTRIM(c.model_provider), '\s+', ' ', 'g')) = candidate.source_key;

DO $$
DECLARE
    unresolved_model_groups BIGINT;
    unresolved_channels BIGINT;
    mismatched_provider_ids BIGINT;
    cross_provider_models BIGINT;
BEGIN
    SELECT COUNT(*) INTO unresolved_model_groups
    FROM model_groups
    WHERE model_provider_id IS NULL;

    SELECT COUNT(*) INTO unresolved_channels
    FROM channels
    WHERE model_provider_id IS NULL;

    SELECT COUNT(*) INTO mismatched_provider_ids
    FROM model_groups mg
    JOIN model_group_models mgm ON mgm.group_id = mg.id
    JOIN channels c ON c.id = mgm.channel_id
    WHERE mg.model_provider_id <> c.model_provider_id;

    SELECT COUNT(*) INTO cross_provider_models
    FROM (
        SELECT mgm.routing_model
        FROM model_group_models mgm
        JOIN model_groups mg ON mg.id = mgm.group_id
        GROUP BY mgm.routing_model
        HAVING COUNT(DISTINCT mg.model_provider_id) > 1
    ) conflicts;

    IF unresolved_model_groups > 0
       OR unresolved_channels > 0
       OR mismatched_provider_ids > 0
       OR cross_provider_models > 0 THEN
        RAISE EXCEPTION
            'model provider audit failed: unresolved_model_groups=%, unresolved_channels=%, mismatched_provider_ids=%, cross_provider_models=%',
            unresolved_model_groups, unresolved_channels, mismatched_provider_ids, cross_provider_models;
    END IF;
END
$$;

ALTER TABLE model_groups
    ALTER COLUMN model_provider_id SET NOT NULL;
ALTER TABLE channels
    ALTER COLUMN model_provider_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_model_groups_model_provider') THEN
        ALTER TABLE model_groups
            ADD CONSTRAINT fk_model_groups_model_provider
            FOREIGN KEY (model_provider_id) REFERENCES model_providers (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_channels_model_provider') THEN
        ALTER TABLE channels
            ADD CONSTRAINT fk_channels_model_provider
            FOREIGN KEY (model_provider_id) REFERENCES model_providers (id) ON DELETE RESTRICT;
    END IF;
END
$$;

COMMIT;
