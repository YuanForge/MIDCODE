UPDATE channels
SET passthrough_body = false
WHERE type = 'llm' AND protocol = 'gemini' AND is_active
  AND model LIKE 'gemini-%' AND passthrough_body
  AND COALESCE(request_script, '') = ''
RETURNING id, model, passthrough_body;
