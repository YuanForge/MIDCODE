# Model-card performance v1.0.64

Adds TTFT (seconds) and TPS (token/s) to `/models` cards, with sample counts and metric explanations. Uses 7-day medians of successful streaming requests. Missing historical measurements remain null; no fabricated backfill.

The response writer observes client-facing SSE without changing bytes or flush behavior. It ignores role-only deltas, heartbeats and lifecycle events; recognizes text, thinking and tool-argument output across Chat Completions, Responses, Claude and Gemini. TTFT begins when the model handler starts. TPS is `(reported output tokens - 1) / seconds after first output until stream finishes`; estimated usage is excluded. WebSocket and non-streaming calls do not contribute these metrics in this release. Usage JSON stores the measurements; no database migration or billing amount changes.

## Reproduction

Start with the production source archive SHA256 `bf47c37999b79ae656c938bdddc35c1e1987267f3937ffaca525ef5d1d73e4cf`, apply `deploy/domain-ping-20261103/prepare_source.py`, then this directory's `apply_source.py` once. The latter changes only the model card function in the production frontend, preserving its newer authentication and image documentation behavior. Build Linux/amd64 Go server and `web/app` frontend. Package as `fanapi-server` and `dist/`. Layer onto the existing production image with `create_candidate.py`.

## Deployment

New host only: `midcode-performance-v1064-api-1`, localhost 8144, image `fanapi-api:performance-v1.0.64`, SHA256 `19b7a84bb6f479759a52dbd843f7309064a96bd060ef3f8a21cfbff4f4dbf11f`. Candidate uses existing config, Redis, NATS, database and uploads. Old business host is not updated.

Validate candidate authentication/availability payload, Go protocol/timing/aggregation tests and production frontend build before graceful ingress reload. Verify `/models` desktop/mobile, actual interfaces and image/video continuity. Production activation and verification records are retained under `/root/fanapi-migration/`.

Rollback ingress: restore the two files listed in `performance-v1064-ingress-before/paths.json`, validate and reload `migration-router`. Retain old image and private container snapshot. Before removing old main container, move its `midcode-main` Docker network alias used by video, verify video requests and wait for existing connections to drain; do not interrupt active model requests. Preserve all volumes/configs and image/video services.
