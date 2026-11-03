# v1.0.62 — restore administrator domain Ping

The administrator dashboard again renders ServerPingCard, targeting only
`sub.midaccs.com`. Each completed request schedules the next probe after three
seconds. Page unmount and background visibility abort the probe and stop the
timer; returning to the page resumes polling. Authentication and administrator
authorization remain mandatory. The result is ICMP round-trip latency from the
serving business host, not model inference latency or an HTTP timing.

## Source and artifact identity

The production source snapshot contains existing business changes that are not
all present in the repository baseline. Rebuilding the entire runtime from the
baseline would discard those changes. `prepare_source.py` validates the exact
private production archive and applies this release's checked-in source files
and API additions, preserving the other production features. Its output was
compared with the source used to build the deployed artifacts.

The base archive is retained on the new host at
`/root/fanapi-migration/domain-ping-v1062/source-base.tar.gz` (0600).
`build-manifest.json` records its SHA-256 and deployed binary/frontend hashes.
No credentials, environment configuration or customer data are committed here.

Build procedure from the prepared production source:

```text
python deploy/domain-ping-20261103/prepare_source.py SOURCE_ARCHIVE NEW_DIRECTORY
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o fanapi-server ./cmd/server
cd web/app
npm ci
npm run build
```

Runtime images overlay that binary and frontend onto each host's verified
existing application image, retaining runtime dependencies and previous hashed
assets for browsers already using them. Runtime env.js comes from that host's
existing container. The repository Dockerfile now also installs iputils-ping.
Both hosts' deployed binary and frontend-index hashes match the build manifest.

## Deployment and verification

- New and old business hosts independently run
  `midcode-domain-ping-final-v1062-api-1`, image
  `fanapi-api:domain-ping-v1.0.62`, listening on local port 8143.
- The new host's local router and old host's own Nginx were gracefully changed
  from 8141 to 8143, including video handoff authentication locations. Caddy's
  existing local routing and both hosts' shared data configuration are retained.
- Cutover completed at 2026-11-03 23:56 (new) and 23:57 (old), Asia/Shanghai.
  Each switch had 40 public-settings probes returning 200, 80/80 total. This is
  sampled continuity evidence, not a claim to have observed every live request.
- Both hosts' final containers are healthy with zero restarts. Through their
  HTTPS ingress, Ping returned 401 without authentication, 403 for an ordinary
  user, and 200 with real domain latency for an administrator. Profile and admin
  statistics requests also returned 200. The same checks passed after cleanup.
- Focused Go Ping parser tests, frontend TypeScript/Vite build and targeted
  ESLint checks passed. The restored dashboard was verified in Chrome using
  Playwright because the Browser plugin was not available: 1440x1000 desktop
  and 390x844 mobile, real Ping rendering, visible polling, simulated hidden-tab
  pause/resume, and SPA navigation away stopping requests. No page runtime
  exceptions or mobile horizontal overflow were observed. New public HTTPS
  was checked again after cutover. Screenshots remain outside the repository.
- No paid generation or payment was submitted. This release does not deploy
  the pending video migration or change certificate-renewal configuration.

## Cleanup and rollback

On **each** business host the replaced `midcode-independent-api-1` and temporary
`midcode-domain-ping-v1062-api-1` were removed, four containers total. Active
proxy, container-name/IP/port references and incoming connections were checked
first. Remaining connections were idle loopback Nginx-to-backend connections,
with no incoming frontend connections. The services were then gracefully
stopped and removed without deleting volumes, bind paths or images.

The shared configuration file named `midcode-independent-api-1.yaml` remains in
use by the final container and was explicitly retained. Recreation snapshots
are private at `/root/fanapi-migration/ping-v1062-retired-private.json` (0600).
Removal records are `ping-v1062-removed.json`. Proxy backups are in
`ping-v1062-ingress-before-new` / `ping-v1062-ingress-before-old` on their hosts.

Rollback requires recreating and validating the previous container on port
8141 from its saved image/configuration before restoring the two saved proxy
files and gracefully reloading the local router. Preserve current shared
database and upload storage; do not roll back their data snapshots.

## Independent domain issue found during verification

After cutover, the new host resolved `image.midcode.cc` to `103.145.190.198` and
normal-domain HTTPS failed with a TLS alert. Forced Host/SNI requests to old
`140.150.236.134` returned 200 for both image and video entry pages. New Caddy
intentionally excludes that domain because the user retained video on the old
host. The user was informed to retain/revert that domain's old DNS target.
This is not recorded as a successful public image/video continuity check.
