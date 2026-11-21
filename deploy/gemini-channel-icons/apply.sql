UPDATE channels
SET icon_url = 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.104.0/icons/gemini-color.svg',
    updated_at = CURRENT_TIMESTAMP
WHERE protocol = 'gemini'
  AND model LIKE 'gemini-%'
  AND COALESCE(TRIM(icon_url), '') = '';
