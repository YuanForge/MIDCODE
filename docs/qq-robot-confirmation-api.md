# QQ robot confirmation API — v1.0.100

Supersedes the unpublished v1.0.99 direct-binding behavior. Only FanAPI is implemented; no QQ bot code is changed. The trusted robot identifies sender QQ itself. Per user instruction, API calls carry QQ only; group_id, CAPTCHA and additional identity verification are not required. The bot must process @机器人 绑定 and @机器人 查询 only in group 767281836. FanAPI cannot enforce the originating group without receiving trustworthy group events; do not describe this as server-enforced group membership.

Both robot endpoints require Authorization: Bearer bot_YOUR_KEY (or X-API-Key). Never expose the bot key to website users.

## @机器人 绑定

POST https://midcode.cc/api/v1/bot/qq/confirm-binding
Content-Type: application/json

{"qq":"123456789"}

Requires a website pending request submitted within 15 minutes. Returns 200 {user_id,qq,group_id:"767281836",verified:true,message:"QQ绑定成功"}. Already confirmed QQ is idempotent. Missing/expired request 404, malformed QQ 400, invalid/revoked bot key 401, backend failure 503. Reply to the sender only after successful confirmation. The returned user_id lets the bot show which account was bound.

## @机器人 查询

GET https://midcode.cc/api/v1/bot/qq/123456789/financial-summary

Same financial response as UID lookup: user_id, balance_cny, yesterday, last_7_days, currency, timezone, as_of. Pending/unbound QQ returns 404; confirmed mapping is required. No group_id parameter needed. Existing privileged UID lookup remains unchanged for other robot integrations.

## Website and storage

PUT /api/user/qq-binding creates a pending claim, not a verified binding. GET includes qq/verified/status/group_id/expires_at; status unbound/pending/expired/bound. Website guides user to the specified group and offers refresh. Change to another QQ resets confirmation; same confirmed QQ remains confirmed; DELETE removes pending or confirmed binding. Pending QQ reservations expire after 15 minutes and can then be reclaimed. Unique constraints prevent multiple accounts claiming a QQ. Confirmation and query are trusted-bot operations. Binding requests must not be interpreted as proof of account control by themselves.

Startup adds nullable verified_at and verified_group_id columns without marking any pre-existing binding verified. SQL UPDATE confirms atomically with the expiration predicate. No verification or mapping cache. A query already in flight may finish for the user resolved before an unbind.

Validation: Go application suite, ordinary-credential denial, QQ format and pending/expired/bound state tests passed; frontend build and Playwright Edge profile flow (pending/refresh-confirmed/conflict/modify/unbind) passed. Prepared real-server verify_qq.py now checks queries are denied until confirmation and again after changing QQ. Real DB/production confirmation validation NOT executed because SSH banner negotiation failed. No production migration, candidate, traffic switch or container cleanup performed. Last verified online version is v1.0.98; v1.0.99 was not deployed. No bot chat messages sent.

Deployment tools in deploy/qq-confirm-20261117 target v1.0.98 predecessor at 8162 and v1.0.100 candidate at 8163. Recheck current state before use. Retain baseline image and config; rollback script restores predecessor and retains additive tables. Older rollout scripts are historical and must not be used to deploy the superseded direct-binding flow.
