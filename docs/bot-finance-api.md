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

The server creates additive bot_api_keys schema at startup, including deployments that skip unrelated migrations. No existing table/data changes. No frontend key-management page is added in this release; creation/revocation uses the authenticated admin API. Do not store the returned raw key in logs or source control.

Release v1.0.97. Build and deployment evidence in deploy/bot-finance-20261117. Candidate port 8161; v1.0.96 predecessor port 8160. Rollback via /root/fanapi-bot-v1.0.97/deploy.py rollback; preserve the additive key table and baseline image/private config. Final deployment results appended after checks.

## Robot call example

```sh
curl 'https://midcode.cc/api/v1/bot/users/123/financial-summary' \
  -H "Authorization: Bearer $MIDCODE_BOT_KEY"
```

To create a key, root admin sends POST /api/admin/bot-keys with its login bearer token and JSON {"name":"balance-robot"}; save the returned key securely. The robot uses that bot key, never the administrator login token. Key revocation does not affect ordinary inference keys.

Validation completed locally: Go application suite, date/money boundary tests including minimum int64, rejecting ordinary API keys/JWT before querying data, and rejecting non-login sessions for key administration. Real-server verify_bot.py creates a verification-only key, compares statistics against independent Python aggregation, and revokes it in finally; must pass before cutover. No long-lived robot key is automatically issued.
