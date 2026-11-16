# Lazy model statistics — 2026-11-16

Release v1.0.96. Backend/frontend source commit a807a12; build hashes in deploy/models-lazy-20261116/build.json. Resolve v1.0.96 for the final record commit.

Model catalog loading now awaits channels only. Cards display base metadata/pricing/preferences; clicking a card opens its existing detail sheet and mounts statistics there. Local loading/error/retry states do not block the catalog. GET /user/model-availability?model=NAME checks visibility and restricts SQL to that exact model; inaccessible models return 404. Existing no-filter callers remain supported. Existing 15-second server cache/coalescing applies to the filtered model set. No summary table introduced.

Validation: frontend TypeScript/Vite build passed; go test ./cmd/... ./internal/... ./pkg/... passed. Browser plugin not available; Playwright used installed Edge after bundled Chromium was absent. Desktop/mobile rendered regression passed: zero initial health requests, exactly selected model requested on open, independent error/retry, second model isolation, no page runtime errors. Screenshots captured in local Playwright test-results. Mock browser tests do not prove real upstream generation.

Deployment NOT completed: direct production SSH and the prior-server jump route both failed before authentication with Error reading SSH protocol banner. Preflight/current proxy state and new candidate could not be established this turn. No traffic switch or predecessor cleanup executed. Last verified release in prior turn was v1.0.95; current state was not re-established. Real production scoped endpoint verification remains pending.

Prepared rollout creates midcode-lazy-v1096-api-1 at 8160 from verified v1.0.95 base, overlays built backend/frontend while retaining old hashed assets for existing sessions, checks candidate before switching Caddy/8154 compatibility/studio alias, verifies studios, and removes only drained predecessor. Recheck actual state before use. Rollback script retains baseline image/private config and restores predecessor without deleting volumes. No rollback was required this turn.

## Deployment completed after SSH recovery — 2026-11-16

The earlier blocked state above is superseded. Reconnected using the Windows credential manager and verified predecessor v1.0.95 healthy with Caddy on 8159 before proceeding.

- Deployed existing pushed release v1.0.96 (tag 4f1fdfddf26fab47c255f08440336b4573c36556; application source a807a120a307c4e1504a9c62b8267879f3616554). No release tag moved and no additional application changes.
- New container midcode-lazy-v1096-api-1 / fanapi-api:lazy-v1.0.96 at 8160, healthy with zero restarts. Binary and frontend index hashes match build.json. Public /models returned the new index-WUwg8Ra6.js entry.
- Candidate and live scoped statistics tests passed: only requested model returned, invisible model 404, missing authentication 401. Live scoped test including denial/auth checks took 0.371 seconds; not a universal model latency guarantee.
- Candidate/live/post-cleanup checks passed account/admin APIs, usage SQL agreement, CAPTCHA enforcement/issuance and disabled-group consistency. Image/video/unified studio handoffs and sessions passed; video cross-user access denied and test session revoked. No paid generation, real login or email delivery exercised.
- Switched Caddy, compatibility 8154 forwarding and midcode-main alias. Continuity sampling launched before switch; recorded result is stored alongside deployment evidence.
- Removed only midcode-perf-v1095-api-1 after proxy, container and mounted-configuration dependency checks and connection drain; supervisor disabled. No data volumes deleted.
- Rollback retained: fanapi-api:lazy-v1096-baseline, private predecessor configuration, Caddy and compatibility snapshots under /root/fanapi-lazy-v1.0.96. Run python3 /root/fanapi-lazy-v1.0.96/deploy.py rollback and repeat service verification.
