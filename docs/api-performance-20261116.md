# User API performance — 2026-11-16

Release v1.0.95. Source commit: resolve the release tag; deployment manifest records the backend source commit and binary hash.

Changes: dashboard total/today/trend share one request-attributed ledger aggregate; API-key fallback mapping only groups correlations used by unattributed legacy refunds; usage materialization retains token counters only; availability loads visible names in one join and shares a 15-second bounded response cache with concurrent request coalescing. Cache keys contain the complete visible model set, recomputed on every request; no account/API-key data is cached. Seven-day health counts and medians retain the full observation window. No changes to refund attribution.

Migration: scripts/migrate_20261116_stats_performance.sql adds a concurrent partial index for unattributed refunds. It was verified valid before deploying the query that uses it. Existing indexes/data are preserved. Index can safely remain during rollback.

SQL verification uses transaction-local temporary tables and rolls them back, then compares old/new outputs in a repeatable-read production snapshot for user 3. Fixtures cover cross-day refunds, missing/NULL API keys, empty/NULL correlations, another tenant, duplicate logs and existing health-aggregation tests cover performance metrics; cache tests cover concurrency, visibility separation, cancellation, expiry and failures. Measured ledger statistics: API keys 0.946s -> 0.226s; dashboard 1.583s -> 0.821s. Usage warm comparison 0.046s -> 0.051s: no stable speedup claimed. These SQL timings are not full HTTP latency or a load test.

Validation: handler suite passes; all application packages passed during go test ./..., but that broad command fails on pre-existing standalone deploy/sol61-context-20261104 tests referring to undefined pricing functions. Linux backend build succeeds. Deployment and final checks will be recorded after completion.

Deployment: parallel candidate 8159; predecessor 8158. Inherit verified frontend unchanged. Verify authenticated endpoints and studios before/after switching Caddy, compatibility port 8154 and studio alias. Only remove the predecessor after dependency/drain checks. Rollback: python3 /root/fanapi-perf-v1.0.95/deploy.py rollback; retained baseline image/private configuration recreate predecessor without deleting volumes.
