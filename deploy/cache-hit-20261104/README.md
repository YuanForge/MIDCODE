# Cache hit percentage — v1.0.67

User call logs and their detail sheets show `cache_hit_percent` from the API.
The stats table calculates the same ratio using aggregated Token partitions:
cache reads / (noncached input + cache reads + cache writes). Claude prompt counts
exclude caching; other protocols include cache reads. Keep the existing stats
partition semantics. Zero input or unavailable channel metadata returns null;
positive input without cache reads returns zero. The UI uses two decimal places.
No billing, database schema or stored log changes.

Build from the preserved v1.0.66 production source. Copy this commit's
`internal/handler/{llm_log.go,log_cache.go,log_cache_test.go}`, user log/stats pages,
and `web/app/src/lib/formatters/cache.ts`; add `cache_hit_percent?: number | null`
to the production `UserLog` type. Preserve all other production-only source.
Run focused cache, token statistics and price tests, Go Linux amd64 build, and
the frontend TypeScript/Vite build. Backend binary SHA256:
`8b37fe1ec0c602d225141cd1d053867aeb97a6ed2d8e4800231afc6ec24a5163`.

New business host only, parallel candidate `midcode-cache-v1067-api-1` at 8147;
image `fanapi-api:cache-v1.0.67`. Verify real authenticated list/detail and stats
in Chrome Playwright (Browser plugin not available), then gracefully reload
migration-router using activate.py. Transfer `midcode-main` after connections
drain, verify image/video handoff and isolation, and remove the unreferenced,
drained `midcode-logs-v1066-api-1` without deleting volumes. Retain its image and
private configuration. Rollback requires recreating that container, restoring
its video alias and `/root/fanapi-migration/cache-v1067-ingress-before` proxy files.
Runtime record: `/root/fanapi-migration/cache-v1067-verification.json`.
