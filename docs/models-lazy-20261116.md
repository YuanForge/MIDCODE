# Lazy model statistics — 2026-11-16

Release v1.0.96. Backend/frontend source commit a807a12; build hashes in deploy/models-lazy-20261116/build.json. Resolve v1.0.96 for the final record commit.

Model catalog loading now awaits channels only. Cards display base metadata/pricing/preferences; clicking a card opens its existing detail sheet and mounts statistics there. Local loading/error/retry states do not block the catalog. GET /user/model-availability?model=NAME checks visibility and restricts SQL to that exact model; inaccessible models return 404. Existing no-filter callers remain supported. Existing 15-second server cache/coalescing applies to the filtered model set. No summary table introduced.

Validation: frontend TypeScript/Vite build passed; go test ./cmd/... ./internal/... ./pkg/... passed. Browser plugin not available; Playwright used installed Edge after bundled Chromium was absent. Desktop/mobile rendered regression passed: zero initial health requests, exactly selected model requested on open, independent error/retry, second model isolation, no page runtime errors. Screenshots captured in local Playwright test-results. Mock browser tests do not prove real upstream generation.

Deployment NOT completed: direct production SSH and the prior-server jump route both failed before authentication with Error reading SSH protocol banner. Preflight/current proxy state and new candidate could not be established this turn. No traffic switch or predecessor cleanup executed. Last verified release in prior turn was v1.0.95; current state was not re-established. Real production scoped endpoint verification remains pending.

Prepared rollout creates midcode-lazy-v1096-api-1 at 8160 from verified v1.0.95 base, overlays built backend/frontend while retaining old hashed assets for existing sessions, checks candidate before switching Caddy/8154 compatibility/studio alias, verifies studios, and removes only drained predecessor. Recheck actual state before use. Rollback script retains baseline image/private config and restores predecessor without deleting volumes. No rollback was required this turn.
