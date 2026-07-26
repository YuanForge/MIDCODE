ALTER TABLE model_groups
    ADD COLUMN IF NOT EXISTS model_provider VARCHAR(128) NOT NULL DEFAULT '';

WITH provider_candidates AS (
    SELECT
        mgm.group_id,
        MIN(BTRIM(c.model_provider)) AS model_provider
    FROM model_group_models mgm
    JOIN channels c ON c.id = mgm.channel_id
    GROUP BY mgm.group_id
    HAVING COUNT(*) = COUNT(NULLIF(BTRIM(c.model_provider), ''))
       AND COUNT(DISTINCT LOWER(BTRIM(c.model_provider))) = 1
)
UPDATE model_groups mg
SET model_provider = CASE LOWER(pc.model_provider)
    WHEN 'openai' THEN 'OpenAI'
    WHEN 'anthropic' THEN 'Anthropic'
    WHEN 'google' THEN 'Google'
    WHEN 'deepseek' THEN 'DeepSeek'
    WHEN 'alibaba' THEN 'Alibaba'
    ELSE pc.model_provider
END
FROM provider_candidates pc
WHERE mg.id = pc.group_id
  AND BTRIM(mg.model_provider) = '';

-- All four audit queries must return zero rows before the final constraint is enabled.
SELECT id, code, name
FROM model_groups
WHERE BTRIM(model_provider) = ''
ORDER BY id;

SELECT mg.id AS group_id, mg.code, mgm.routing_model, c.id AS channel_id
FROM model_groups mg
JOIN model_group_models mgm ON mgm.group_id = mg.id
JOIN channels c ON c.id = mgm.channel_id
WHERE BTRIM(c.model_provider) = ''
ORDER BY mg.id, mgm.routing_model;

SELECT
    mg.id AS group_id,
    mg.code,
    mg.model_provider AS group_provider,
    mgm.routing_model,
    c.id AS channel_id,
    c.model_provider AS channel_provider
FROM model_groups mg
JOIN model_group_models mgm ON mgm.group_id = mg.id
JOIN channels c ON c.id = mgm.channel_id
WHERE BTRIM(c.model_provider) <> ''
  AND LOWER(BTRIM(c.model_provider)) <> LOWER(BTRIM(mg.model_provider))
ORDER BY mg.id, mgm.routing_model;

SELECT
    mgm.routing_model,
    ARRAY_AGG(DISTINCT mg.model_provider ORDER BY mg.model_provider) AS model_providers
FROM model_group_models mgm
JOIN model_groups mg ON mg.id = mgm.group_id
GROUP BY mgm.routing_model
HAVING COUNT(DISTINCT LOWER(BTRIM(mg.model_provider))) > 1
ORDER BY mgm.routing_model;

DO $$
DECLARE
    blank_groups BIGINT;
    blank_channels BIGINT;
    mismatched_channels BIGINT;
    cross_provider_models BIGINT;
BEGIN
    SELECT COUNT(*) INTO blank_groups
    FROM model_groups
    WHERE BTRIM(model_provider) = '';

    SELECT COUNT(*) INTO blank_channels
    FROM model_group_models mgm
    JOIN channels c ON c.id = mgm.channel_id
    WHERE BTRIM(c.model_provider) = '';

    SELECT COUNT(*) INTO mismatched_channels
    FROM model_groups mg
    JOIN model_group_models mgm ON mgm.group_id = mg.id
    JOIN channels c ON c.id = mgm.channel_id
    WHERE BTRIM(c.model_provider) <> ''
      AND LOWER(BTRIM(c.model_provider)) <> LOWER(BTRIM(mg.model_provider));

    SELECT COUNT(*) INTO cross_provider_models
    FROM (
        SELECT mgm.routing_model
        FROM model_group_models mgm
        JOIN model_groups mg ON mg.id = mgm.group_id
        GROUP BY mgm.routing_model
        HAVING COUNT(DISTINCT LOWER(BTRIM(mg.model_provider))) > 1
    ) conflicts;

    IF blank_groups > 0
       OR blank_channels > 0
       OR mismatched_channels > 0
       OR cross_provider_models > 0 THEN
        RAISE EXCEPTION
            'model provider audit failed: blank_groups=%, blank_channels=%, mismatched_channels=%, cross_provider_models=%',
            blank_groups, blank_channels, mismatched_channels, cross_provider_models;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'model_groups_model_provider_not_blank'
          AND conrelid = 'model_groups'::regclass
    ) THEN
        ALTER TABLE model_groups
            ADD CONSTRAINT model_groups_model_provider_not_blank
            CHECK (BTRIM(model_provider) <> '') NOT VALID;
    END IF;

    ALTER TABLE model_groups
        VALIDATE CONSTRAINT model_groups_model_provider_not_blank;
END
$$;
