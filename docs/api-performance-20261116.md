# User API performance — 2026-11-16

Release v1.0.95. Source commit: resolve the release tag; deployment manifest records the backend source commit and binary hash.

Changes: dashboard total/today/trend share one request-attributed ledger aggregate; API-key fallback mapping only groups correlations used by unattributed legacy refunds; usage materialization retains token counters only; availability loads visible names in one join and shares a 15-second bounded response cache with concurrent request coalescing. Cache keys contain the complete visible model set, recomputed on every request; no account/API-key data is cached. Seven-day health counts and medians retain the full observation window. No changes to refund attribution.

Migration: scripts/migrate_20261116_stats_performance.sql adds a concurrent partial index for unattributed refunds. It was verified valid before deploying the query that uses it. Existing indexes/data are preserved. Index can safely remain during rollback.

SQL verification uses transaction-local temporary tables and rolls them back, then compares old/new outputs in a repeatable-read production snapshot for user 3. Fixtures cover cross-day refunds, missing/NULL API keys, empty/NULL correlations, another tenant, duplicate logs and existing health-aggregation tests cover performance metrics; cache tests cover concurrency, visibility separation, cancellation, expiry and failures. Measured ledger statistics: API keys 0.946s -> 0.226s; dashboard 1.583s -> 0.821s. Usage warm comparison 0.046s -> 0.051s: no stable speedup claimed. These SQL timings are not full HTTP latency or a load test.

Validation: handler suite passes; all application packages passed during go test ./..., but that broad command fails on pre-existing standalone deploy/sol61-context-20261104 tests referring to undefined pricing functions. Linux backend build succeeds. Deployment and final checks will be recorded after completion.

Deployment: parallel candidate 8159; predecessor 8158. Inherit verified frontend unchanged. Verify authenticated endpoints and studios before/after switching Caddy, compatibility port 8154 and studio alias. Only remove the predecessor after dependency/drain checks. Rollback: python3 /root/fanapi-perf-v1.0.95/deploy.py rollback; retained baseline image/private configuration recreate predecessor without deleting volumes.

## Completed release

- Backend source commit: fc17647 (full hash in build.json). The release tag includes this backend and subsequent deployment records; backend source is unchanged by record-only commits.
- Deployed container: midcode-perf-v1095-api-1, image fanapi-api:perf-v1.0.95, port 8159. Verified binary hash matches build.json and frontend entry hash is unchanged from v1.0.94.
- Same-account sequential HTTP sample, predecessor -> candidate: stats 1.713s -> 0.877s; apikeys 0.948s -> 0.386s; availability 3.758s -> 3.585s cold / 0.063s cached; usage 0.106s -> 0.063s. Fixed historical usage response matched exactly. Cache refresh still requires a full seven-day health read; no cold-start elimination claimed.
- Post-cleanup origin HTTPS: stats 0.802s, availability cold 3.580s, usage 0.065s, apikeys 0.321s. These are single-account samples, not universal latency guarantees.
- Application package suite (cmd/internal/pkg) passes. Cache concurrency regression passed 50 repetitions. SQL output equivalence passed. Full repository test limitation is documented above.
- Candidate, live, and post-cleanup checks passed: account/admin reads, statistics/model/trend consistency, authorization, disabled group bindings, CAPTCHA enforcement and issuance. Image/video/unified workbench handoffs and sessions passed; cross-user video access denied. No paid generation, real account login or email delivery tested.
- Caddy, port-8154 compatibility forwarding and midcode-main alias now target the candidate. 160 bounded HTTPS page samples spanning switch returned 200 with no recorded errors; this is page continuity sampling, not all-business-load coverage.
- Removed only predecessor midcode-groups-v1094-api-1 after checking proxy/container/mount dependencies and drained connections. Its owning supervisor is disabled. No volumes removed. The earlier unserved candidate was replaced during validation.
- Rollback image fanapi-api:perf-v1095-baseline, original private container configuration and Caddy/compatibility snapshots retained under /root/fanapi-perf-v1.0.95. Run deploy.py rollback and repeat functional verification; the additive partial index can remain.
