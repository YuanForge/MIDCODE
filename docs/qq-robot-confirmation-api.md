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

## Deployment completed — 2026-11-17 15:01 Asia/Shanghai

This completion record supersedes the SSH-blocked status above. Application source commit: `4b5fd8f2b262bf313789631a8cbb5d5445e6330d`. Pushed immutable release tag `v1.0.100`: `04cfacc944a17b82da1cd8c411c9ff2bb153d472` (includes build manifest). Remote branch/tag were verified before cutover; this post-deployment documentation does not change the application build or move the tag.

- Running container: `midcode-qq-v10100-api-1`, image `fanapi-api:qq-v1.0.100`, loopback port 8163. Healthy, restart count 0 after cleanup. Running binary and index SHA256 match build.json; public https://midcode.cc/stats index matches the v1.0.100 index hash.
- Candidate and live real-database checks passed: pending QQ cannot query; robot confirmation enables lookup; duplicate ownership denied; changing QQ requires confirmation again; unbind invalidates lookup; released QQ can be reused. Temporary test users and bindings removed; temporary bot keys revoked.
- Dedicated bot key lifecycle, ordinary key/JWT rejection, management access isolation, Beijing date windows and ledger totals independently cross-checked. Live financial query measured 0.745 seconds in this sample; not a load-test claim.
- Main statistics, authenticated account/admin reads, SQL totals, disabled-group state and CAPTCHA checks passed. Image/video/preview workbench handoff and sessions passed, including video tenant isolation; repeated after predecessor removal.
- Caddy targets switched from 8162 to 8163; compatibility port 8154 and studio network alias midcode-main now target the new container.
- Removed only `midcode-botpage-v1098-api-1` after ingress/container dependency checks and connection drain. No data volumes deleted. v1.0.99 was never deployed.
- Rollback materials retained under `/root/fanapi-qq-v1.0.100`, including private predecessor/config snapshots and image `fanapi-api:qq-v10100-baseline`. Run `python3 /root/fanapi-qq-v1.0.100/deploy.py rollback`, then verify main/studio services before retiring the candidate. Additive QQ database schema remains.
- Safe machine-readable evidence is in `deploy/qq-confirm-20261117/results/`. Credentials and private snapshots are excluded from Git.

Limits: no real QQ group messages, paid generation, real-account password login or email delivery tested. The continuity sampler did not produce a result file and was no longer running when checked; do not claim measured zero downtime from that sampler. Parallel candidate deployment, successful live checks and post-cleanup checks are confirmed. Group 767281836 restrictions remain the trusted robot's responsibility, as specified above.
