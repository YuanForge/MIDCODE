# Robot financial summary API

GET /api/v1/bot/users/{user_id}/financial-summary
Authorization: Bearer bot_YOUR_SECRET

X-API-Key is also accepted. Never place secrets in URLs. Ordinary inference API keys and login JWTs cannot call this endpoint. Valid dedicated keys can read any user's summary; they cannot generate models or manage keys. Revocation is checked on every request. Invalid keys 401, malformed positive integer IDs 400, nonexistent users 404, backend errors/timeouts 503. Responses use Cache-Control: no-store.

Response fields: user_id, currency (CNY), timezone (Asia/Shanghai), balance_cny, yesterday {start_at,end_at,consumed_cny}, last_7_days {start_at,end_at,consumed_cny}, as_of. Monetary values are exact six-decimal strings in CNY; internal precision credits are not exposed. Balance uses the same live balance source as /user/balance. Statistics and balance are sequential reads, not a cross-service atomic snapshot.

Yesterday is the previous Beijing calendar day; last_7_days ends at today's Beijing midnight and includes seven completed days. End timestamps are exclusive. Consumption matches dashboard request attribution: charge/hold/settle minus refunds, attributed to the earliest charge/hold/settle of each correlation (refund-only groups use their earliest timestamp). Later refunds follow original request date; recharge/transfers/admin adjustments do not count. All billing ledger types of supported products participate, not just LLM logs. Net values are not clamped. History aggregation has a 15-second context timeout; no false zero on error.

Root administrator login session only:
- POST /api/admin/bot-keys with JSON {"name":"robot"} returns 201 with id/name/key/scope. Raw key is shown once; only SHA-256 is stored.
- GET /api/admin/bot-keys returns metadata, never secret/hash.
- DELETE /api/admin/bot-keys/{id} revokes immediately, returns 204.

The server creates additive bot_api_keys schema at startup, including deployments that skip unrelated migrations. No existing table/data changes. Since v1.0.98, root administrators can use /admin/bot-keys (机器人密钥) to create/list/revoke keys; the authenticated admin API remains available. Do not store the returned raw key in logs or source control.

Release v1.0.97. Build and deployment evidence in deploy/bot-finance-20261117. Candidate port 8161; v1.0.96 predecessor port 8160. Rollback via /root/fanapi-bot-v1.0.97/deploy.py rollback; preserve the additive key table and baseline image/private config. Final deployment results appended after checks.

## Robot call example

```sh
curl 'https://midcode.cc/api/v1/bot/users/123/financial-summary' \
  -H "Authorization: Bearer $MIDCODE_BOT_KEY"
```

To create a key, root admin sends POST /api/admin/bot-keys with its login bearer token and JSON {"name":"balance-robot"}; save the returned key securely. The robot uses that bot key, never the administrator login token. Key revocation does not affect ordinary inference keys.

Validation completed locally: Go application suite, date/money boundary tests including minimum int64, rejecting ordinary API keys/JWT before querying data, and rejecting non-login sessions for key administration. Real-server verify_bot.py creates a verification-only key, compares statistics against independent Python aggregation, and revokes it in finally; must pass before cutover. No long-lived robot key is automatically issued.

## Completed deployment — 2026-11-17

- Source commit 73ff9ff6c99ecb78aac3346a6f0f29f6158a14b0, release v1.0.97 includes it and verification records. Backend hash in build.json, frontend inherited unchanged.
- Running midcode-bot-v1097-api-1 / fanapi-api:bot-v1.0.97 at 8161, healthy and zero restarts. Additive bot_api_keys table initialized successfully. No permanent robot key issued; verification keys revoked in finally.
- Go application suite and focused boundary/auth tests passed. Real candidate/live/post-cleanup tests passed create/list/query/revoke, ordinary-key/JWT rejection, nonroot management denial, no bot access to ordinary user APIs, invalid/missing user handling, Beijing date ranges and independent Python ledger aggregation. Candidate query 0.953s; live samples 0.757s/0.780s. Not a load test or universal latency guarantee.
- Existing account/admin/statistics/CAPTCHA checks passed. Image/video/unified studio handoff/session/tenant isolation checks passed before and after cleanup. No paid generation, actual account login or email delivery tested.
- Caddy, 8154 compatibility forwarding and midcode-main alias switched from 8160 to 8161. Removed only midcode-lazy-v1096-api-1 after no proxy/dependency references and connection drain; supervisor disabled, no data volumes deleted.
- Baseline image fanapi-api:bot-v1097-baseline and private config snapshots retained under /root/fanapi-bot-v1.0.97. Rollback restores v1.0.96; retain additive key table, which old release does not expose.
- Page continuity sampler launched before cutover; no full continuity assertion is made without collecting its completed result. Live and post-cleanup functional checks completed successfully.
