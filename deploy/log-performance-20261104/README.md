# Request performance in user logs — v1.0.66

The user log table and detail sheet show request-level `usage.performance_ttft_ms`
as seconds (two decimal places) and `usage.performance_tps` as token/s (one decimal
place). Missing or invalid measurements display an em dash. Historical rows are
not backfilled. Backend collection and billing are unchanged.

Build from the preserved v1.0.65 production source, preserving its production-only
features. Copy `web/app/src/pages/user/UserLogsPage.tsx` and
`web/app/src/lib/formatters/performance.ts` from this commit, and add the two optional
nullable numeric fields to `UserLogUsage` in the production API type file.
Run `npm run build`. Reuse the unchanged backend binary with SHA256
`e051aadfc94b28347dcfd136f027fa19ebbd8b3d05ae762328f5bbe31439ec50`.

New business host only. Candidate `midcode-logs-v1066-api-1` listens on localhost
8146, image `fanapi-api:logs-v1.0.66`. Validate actual log values, detail rendering,
missing historical values and mobile horizontal table scrolling in Chrome
Playwright (Browser plugin not available). Reload migration-router gracefully
using activate.py after candidate health and browser validation. Move the
`midcode-main` backend alias after its connections drain, then validate image/video
handoff and cross-user isolation. Remove only the drained, unreferenced predecessor
`midcode-status-v1065-api-1`, without deleting volumes.

Keep the previous image and private container configuration for rollback. Ingress
backups: `/root/fanapi-migration/logs-v1066-ingress-before`. Recreate the predecessor
and restore its video backend alias before restoring the backed-up proxy files.
Runtime verification: `/root/fanapi-migration/logs-v1066-verification.json`.
