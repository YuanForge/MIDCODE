UPDATE channels
SET passthrough_body = false
WHERE id = 262 AND model = 'gemini-4-carbon'
  AND protocol = 'gemini' AND passthrough_body
  AND COALESCE(request_script, '') = ''
RETURNING id, model, passthrough_body;
