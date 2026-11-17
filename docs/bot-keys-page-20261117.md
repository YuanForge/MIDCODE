# Bot key admin page — v1.0.98 — 2026-11-17

Source commit c43e2ca, frontend build and inherited backend hashes in deploy/bot-keys-page-20261117/build.json. Page /admin/bot-keys is linked as 机器人密钥 in the root administrator sidebar. Direct nonroot navigation is denied before querying key metadata. Uses existing root-session-only management APIs.

Features: name validation, create with one-time secret dialog/copy, metadata/status list, revoke confirmation/cancel, independent create/list/revoke failure handling, and placeholder-only curl example. No key is written to localStorage/sessionStorage; closing dialog clears React secret state. Existing backend remains unchanged.

Validation: TypeScript/Vite production build passed; Playwright using installed Edge (Browser plugin not available) passed root create/error/retry/secret clearance/revoke/cancel and nonroot denial. Desktop/mobile screenshots captured; no page runtime errors. Backend key lifecycle and service checks required on candidate/live. Build reports existing large chunk warning, not a failure.

Deployment: prepared parallel container midcode-botpage-v1098-api-1 on 8162 replacing midcode-bot-v1097-api-1 on 8161; retain old hashed frontend assets for existing sessions. No database changes. Rollback: /root/fanapi-botpage-v1.0.98/deploy.py rollback; preserve baseline image and private configuration. Completion evidence follows.

## Completed rollout

- Application source c43e2ca, v1.0.98; backend inherited unchanged from v1.0.97 with matching binary hash. New frontend verified against build.json.
- Container midcode-botpage-v1098-api-1 / fanapi-api:botpage-v1.0.98 on 8162, healthy and zero restarts. Caddy, compatibility 8154 and midcode-main alias switched.
- Public /admin/bot-keys references AdminBotKeysPage-pHmEy1Hh.js. Browser create/error/retry/secret-clear/revoke/cancel/nonroot tests passed. Real candidate/live key lifecycle checks passed; verification keys revoked. No real long-lived key was created for the user.
- Account/admin/statistics/CAPTCHA and image/video/unified studio checks passed. Post-cleanup studio checks passed; no paid generation or real account login/email delivery performed.
- Removed predecessor midcode-bot-v1097-api-1 only after dependency checks and drain; supervisor disabled, no volumes deleted. Retained fanapi-api:botpage-v1098-baseline and private configs under /root/fanapi-botpage-v1.0.98 for rollback.
- Continuity sampler launched, but no completed sampling claim made here; functional checks establish verified post-switch behavior.
