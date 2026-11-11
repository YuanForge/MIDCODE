# User model favorites and pins — v1.0.86

Model cards now have independent favorite and pin actions. The Favorites tab works with existing type, provider, protocol and search filters. Pinned models sort first within the filtered results. Preferences are stored by authenticated user ID and public routing model, so they survive channel replacement, refresh and device changes. Guests receive a sign-in prompt. Failed saves keep the previous state; switching accounts immediately hides the previous account's preferences.

## Source and build

- Implementation: `c0fa5b2323e1613ce00162bdd068026e6cb10018` on `codex/model-preferences`.
- Base Git release: `v1.0.85`. The running API was the verified `v1.0.83` production source/binary; v1.0.84 and v1.0.85 had operational/studio changes.
- The repository historical root differs from the production build tree. `deploy/model-preferences-20261111/apply.py` checks SHA256 of each affected production file and applies only the reviewed feature changes from `patches.json`, then copies the new handler, model, hook and tests. Existing production guest auth, billing, stream usage and studio behavior remain in the build.
- Binary SHA256: `ca8a43eba3a35c1632256d09165bf61825802e250c6489e092213aea7fc08f90`.
- Frontend index SHA256: `4df2126a058485b555ff82f260b4987c46d632ae71b1468aafb4bb610efb926a`.
- Build: Go 1.26.7, `GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build ./cmd/server`; frontend `npm run build`.

## Data and API

Authenticated `GET /api/user/model-preferences` returns only that user's preferences. `PATCH` accepts `routing_model` plus optional boolean `pinned`/`favorite`; its atomic upsert preserves omitted fields. User IDs and unknown fields in the body are rejected. The model must belong to the active catalog, with API-key model-group restrictions respected.

The only schema change is `user_model_preferences`, uniquely indexed by `(user_id, routing_model)`. Production intentionally runs with `FANAPI_SKIP_MIGRATIONS=1`, so use `scripts/migrate_20261111_user_model_preferences.sql` as an additive migration before candidate validation. Do not enable global Sync2 for this release. Both-false rows remain stored and are excluded by frontend favorite filtering. Rollback keeps this additive table and saved preferences.

## Validation

- Production-source `go test ./...` passed. Focused tests also ran against a real temporary PostgreSQL 16 database, covering user isolation, explicit false, unique rows and simultaneous updates to separate fields; that container was removed.
- Frontend TypeScript/Vite builds and changed-file ESLint passed. Existing bundle-size and env.js build warnings remain.
- Four Playwright scenarios passed on both the Git root frontend and production frontend, using isolated mocked APIs. Checked persistence after reload, pin order, type/provider/search filters, removing favorites, failure/retry, account switching and guests.
- Browser plugin was unavailable; Playwright used installed Edge without installing dependencies. Desktop 1440×1000 and mobile 390×844 had meaningful content, no framework overlay, no page errors and no horizontal overflow. Card actions did not open model details.
- Candidate real API and browser checks passed with two temporary accounts (458/459): independent favorite/pin state, reload persistence, Favorites category, account isolation, explicit cancellation, guest handling and desktop/mobile layout. Browser tokens were cleared after each run. Existing external logo/icon requests occasionally timed out; there were no application JavaScript runtime errors.
- Public-network evidence is separate: the Windows 80-request sample returned 48 HTTP 200 responses and 32 TLS/read timeouts. The server's public egress also received pre-existing 403 responses before cutover. These samples do not prove uninterrupted public reachability; direct Caddy and origin verification are recorded separately below.

## Deployment

New container: `midcode-preferences-v1086-api-1`, image `fanapi-api:preferences-v1.0.86`, loopback port `8153`. Caddy's main/API targets and the port 8149 compatibility redirect move from 8152 to 8153. The studio network alias `midcode-main` moves after the old external HTTP connections drain. Candidate binary/index hashes were checked in the container, which is healthy with zero restarts.

Private manifests and credentials stay outside Git under `/root/fanapi-model-preferences-v1.0.86/`. This directory retains the complete sanitized build source, source manifest, build hashes, previous container configuration, proxy backups and executable rollback script. Run `python3 /root/fanapi-model-preferences-v1.0.86/rollback.py` to recreate/start the old API, verify its health, restore Caddy/8149 routing and move the studio alias after draining the new API. Keep the additive preference table and all data volumes.

Live HTTPS browser validation passed all six flows at https://midcode.cc/models with the hostname resolved directly to the production origin and TLS verification enabled. Preference GET/PATCH took approximately 160–279 ms. Ordinary public DNS browser attempts timed out; these are not counted as passed. Direct Caddy checks returned 200 for main/video/studio (20 each), and the image entry returned its expected 302 redirect. Image handoff/exchange and video handoff/exchange/project HTML/cross-user 403 checks passed using UID 3, without new API keys or paid generation. The stateless image verification cookie existed only in process memory and was discarded; no global signing secret was changed.
