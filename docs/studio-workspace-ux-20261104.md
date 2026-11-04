# Studio workspace UX release — 2026-11-04

## Scope and evidence

The random-image viewer was rendered inside the `lg:hidden` header, so desktop
users could open it in state but never see it. The deterministic frontend patch
portals it to the document body. Both navigation layouts now link to `/dashboard`.
External images receive a 15-second timeout and a visible error/retry state.

The plain resume document is replaced with a responsive workspace skeleton.
Entry fetches the server-authenticated workspace HTML, checks account ownership,
then installs it in the same document. A fresh matching session requires one
workspace request; old profiles and account changes still exchange a new ticket.
This removes a round trip/navigation, not the authentication boundary between
the main API and studio. First access still needs authentication and asset loads.

Candidate validation used regular Playwright because the Browser plugin was not
available. Desktop reproduced the old invisible viewer (10.9-second initial
entry). The patched build opened the viewer, issued a cache-busted refresh, and
returned to the main dashboard with no page errors. One candidate first-entry
observation was 6.1 seconds; routing local candidate assets is not a controlled
production performance comparison. Do not present it as a speed guarantee.

At verification time, `bing.img.run` failed to connect/resolve and
`img.catcdn.cn` had an expired TLS certificate. The patch does not disable TLS
checks or substitute unrelated images. A functioning control does not establish
external image availability. No paid generation is part of this validation.

## Release identity and rollout

Code/tag: `v1.0.79` (resolve the tag for the full source commit).
Build: the existing v1.0.72 branded/integrated upstream source plus
`prepare-workspace-ux.mjs`; Next.js production build and TypeScript checks.
Entry unit tests cover resume, account switch, expired authorization, stale
profiles, timeout, explicit tickets and refusing another account's document.

Deployment command: `python3 deploy-workspace-ux.py
/root/fanapi-migration/studio-ux-v1079 COMMIT v1.0.79`.
The authoritative deployment result is `release.json` in that directory; it is
created only after a successful publication, health check and unchanged PID/restarts.
Post-release browser/continuity results are saved there as `verification.json`.
Do not treat this procedure document alone as proof of successful deployment.

Expected existing container: `midcode-unified-preview-v1072-r3`, port 8198.
Base image digest:
`sha256:c6387f9ec462fc77e072582a832833e50b210f15907498e020e227d2d158caa6`.
Frontend revision: v1.0.79; recovery image `midcode-unified:workspace-v1.0.79`.
Main API stays on v1.0.76 and the 8149 compatibility route remains unchanged.
The recovery image contains only the existing image and new public static files,
not runtime tenant profiles, credentials or state snapshots.

No new container is started and no existing container is superseded. There is
therefore no old container eligible for deletion in this static-only release.
Existing image/video services continue serving their original tasks and media.
The previous static assets, entry and base image remain available for rollback.

## Rollback

Use the release manifest's `rollbackDirectory`, which holds `out-before/`.
Publish its assets first and HTML last using the same atomic file replacement
routine in the deployment script; retain newly added hashed resources for clients
that already opened the newer document. Then atomically restore
`entry-before.html` to
`/opt/1panel/apps/openresty/openresty/root/midcode-unified-entry-v1074.html`.
Verify current paths/hashes first; do not overwrite any later release.
The initial v1.0.78 deployment stopped before changing live files because
OverlayFS rejected a whole-directory exchange (EXDEV). v1.0.79 uses individual
atomic file replacements, a compatible resource-first publication method.
No gateway restart or proxy change is required. For container recreation use
the recovery image and existing deployment configuration/state mount; never
start concurrent task workers on the same SQLite state directory.
