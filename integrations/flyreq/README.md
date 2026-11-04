# MIDCODE unified studio — integrated preview

A separately deployed MIDCODE-branded image/video studio based on
[FlyReq Image Studio](https://github.com/doudou770/flyreq-image-studio), pinned to
`bcec8c8992b407997a5f872bcb7fa1436d7505cd` (upstream 1.5.1).

Preview entry: https://midcode.cc/studio-preview/entry (sign in to MIDCODE first).
This release adds an isolated preview route; it does not replace the existing
main site, image studio or video studio, and does not update the old server.

## Integration

- The entry exchanges the existing MIDCODE one-time handoff for a Secure,
  HttpOnly session. Long-lived API keys stay server-side, never in a URL or
  browser model registry. Existing main-site login is preserved.
- Each UID has a separate native backend process, SQLite task database and
  media directory. HTTP and WebSocket requests are authenticated and routed
  to that UID. Browser storage is also namespaced by UID.
- Approved models and keys come from MIDCODE. Internal signed capabilities
  force upstream traffic through MIDCODE routing, billing and logs.
- Synchronous image models use `/v1/images/generations` or edits. Asynchronous
  image/video channels use `/api/v1/image`, `/api/v1/video` and task polling.
- Generated media and async reference uploads are archived in the existing
  private S3 bucket. Stable signed MIDCODE media links redirect to short-lived
  S3 URLs. These are shareable bearer links: anyone holding a link can read it.
- Upstream license, copyright and source attribution remain. The settings page
  links this versioned modification recipe and the original AGPL source.

## Reproduce

Use a fresh clone at the pinned upstream commit. Install frontend dependencies
with `npm ci`, then run from this repository:

```sh
node integrations/flyreq/prepare.mjs /path/to/flyreq integrations/flyreq/branding.env.example
node integrations/flyreq/prepare-integration.mjs /path/to/flyreq
```

Run `npm run build` in the prepared frontend. Copy this repository's
`integrations/flyreq` and `integrations/media-storage` into the prepared root's
`integrations` directory. Build using `integrations/flyreq/Dockerfile` with that
prepared root as context. The Dockerfile-specific ignore file excludes secrets,
SQLite databases and development dependencies while including frontend output.
Never package deployment env files or state directories.

`deploy-candidate.py` is the site-specific deployment recipe for the verified
new-server topology. It reads credentials from existing running containers,
writes a root-only env file, and starts a parallel candidate. Review current
container names, free ports and dependency targets before reuse; do not assume
these historical names remain current. `activate-preview.py` adds only the new
preview route after configuration validation. It does not replace main routes.

Required runtime configuration: `MIDCODE_BACKEND`, `MIDCODE_PUBLIC_ORIGIN`,
`TOONFLOW_HANDOFF_SECRET`, the existing `MEDIA_S3_*` configuration, `MIDCODE_STATE`,
`MIDCODE_TENANT_PORT_BASE`, `PORT`, `APP_VERSION`. Bind the gateway and tenant
ports to loopback. The proxy must overwrite `X-Midcode-Client-IP`, preserve
WebSocket upgrades, disable response buffering, and allow long generation calls.
The supported public base path is `/studio-preview`.

## Candidate boundaries

- Maximum eight simultaneously resident user processes; this preview is for
  evaluation, not a replacement of the public workbench for every user yet.
- Old image history/video projects are preserved in their original workbenches;
  this preview does not import them. Library/history browser metadata remains
  browser-local; S3 media URLs alone do not provide cross-device project sync.
- Real generation requires an existing key with the corresponding model groups.
  The preview follows those permissions and does not grant new model access.
- Submitted MIDCODE video tasks cannot currently be canceled through the preview;
  the endpoint returns an explicit error instead of falsely reporting cancellation.
- Main-site logout does not itself clear the separate workbench session. Sessions
  expire after 12 hours and are revalidated against MIDCODE user/password state.
- Reference-image/video workflows and optional upstream Agent/canvas features have
  not received the same real-generation coverage as text-to-image/text-to-video.

## v1.0.72 verification and deployment (2026-11-04)

- Frontend production build/TypeScript passed. Fresh preparation reproduced the
  deployed backend and frontend sources. Gateway integration tests: 3 passed,
  covering key redaction, async protocol translation, cross-user HTTP/WebSocket
  denial, one-time login, origin checks and fixed upstream enforcement.
- Chrome checked zh/en, light/dark and widths 1440/390: eight cases, no page
  errors or document navigation on image/video switching (51–157 ms observed).
  Browser plugin was unavailable, so regular Playwright was used. Desktop and
  mobile screenshots were inspected.
- Real synchronous image generation completed and displayed in the browser;
  real async image generation completed and decoded at 1024×1024. A real
  Seedance video completed, was archived, decoded at 1280×720 / 6.08 seconds,
  and played successfully. No production user requests were canceled.
- S3 synthetic image/video byte roundtrips matched; stable links decoded in
  Chrome. Fresh entry login, HttpOnly session and preserved main login passed.
- UID 3 was the existing verification account. Temporary test key 577 was deleted
  after terminal results and its cached profile removed by fresh handoff.
  Existing key 264 was retained. Test ledger debits netted CNY 6.100416, including
  CNY 0.075888 from an early wrong-protocol image attempt reported successful by
  the platform but not displayed by that candidate. The initial invalid-size
  attempt was automatically refunded. No balances or ledger rows were edited.
- Active candidate: `midcode-unified-preview-v1072-r3`, loopback 8198,
  `APP_VERSION=v1.0.72`, image `midcode-unified:preview-v1072-r3`,
  SHA256 `c6387f9ec462fc77e072582a832833e50b210f15907498e020e227d2d158caa6`.
  Running with zero restarts. Existing main API remains v1.0.69; this tag is the
  unified preview release, not a claim that the main API was redeployed.
- Existing image/video handoff and cross-user isolation probes passed after
  deployment. Three superseded preview containers were drained and removed:
  `midcode-unified-candidate-v1072`, `midcode-unified-preview-v1072`, and
  `midcode-unified-preview-v1072-r2`. Images and bind-mounted state were retained.
- Rollback: remove only the added `/studio-preview/` location, validate nginx
  configuration and gracefully reload `migration-router`. Preserve unrelated
  subsequent configuration changes. Drain candidate tasks/connections before
  stopping/removing it; retain S3 objects, state directories and rollback images.
  Main/image/video original routes need no rollback because they were unchanged.

The pushed release tag identifies the exact integration recipe. Deployment
records also bind the resolved commit to the image digest and verified runtime
file hashes; credentials and private snapshots are not committed.

## v1.0.73 formal entry switch (2026-11-04)

At the user's request, `image.midcode.cc/` and `/index.html` now temporarily
redirect (302, no-store) to the unified studio entry on `midcode.cc`. The
explicit empty URL fragment prevents an old image handoff ticket from being
mistaken for a video/unified handoff ticket. The entry obtains a fresh handoff
using the existing MIDCODE login. Users signed in on a different domain may
need to sign in on `midcode.cc` once.

Deployment source: `activate-image-entry.py`. The verified v1.0.72 application
container/image remain unchanged; v1.0.73 identifies this ingress-only release.
No new container is needed. Existing image API/media endpoints and `/video/`
remain on the original services so ongoing tasks and old projects can continue;
those containers still serve traffic and are not eligible for removal.

Validation: nginx configuration check and graceful reload; root/index redirect
headers; authenticated Chrome entry with an old image ticket fragment discarded;
UID isolation preserved; image/video switching without document navigation;
existing image/video login and isolation checks. No additional paid generations.

Rollback: remove the two exact-match locations added by this script, run
`docker exec migration-router nginx -t`, then `nginx -s reload` in that container.
The private pre-change snapshot is retained as
`/root/fanapi-migration/image-entry-before-v1073.conf`; preserve any later unrelated
changes rather than blindly restoring it. No user data or old-server changes.

## v1.0.74 entry latency fix (2026-11-04)

`optimize-entry.py` serves `entry.js` through an exact ingress location and keeps
using the existing v1.0.72 gateway/task processes. A matching server-validated
session can resume directly. Only the per-account model-refresh timestamp is
cached in browser storage; it never grants authorization. Changed accounts,
invalid sessions and model profiles older than 15 minutes use fresh handoff.
API keys remain server-side. Each entry request has a 12-second timeout and a
visible retry state. First sign-in still needs the full permission handoff.

Authenticated hashed Next.js resources are privately cached for one year and
compressed with gzip. HTML, session responses and APIs remain no-store. The
asset cache header is applied only to successful responses; failed responses
remain no-store. No shared proxy cache is enabled. Browser storage and session
ownership checks continue to isolate accounts.

Measured in Chrome against the new server: before, first/repeat entry 8061/8175
ms and 2,149,618 static bytes each time; after, first/repeat entry 9473/553 ms,
628,790/0 static transfer bytes. These are individual observations, not an SLA.
Initial account handoff was not made faster by this ingress-only change.

Four focused entry tests cover resume, account changes/stale profiles/expired
sessions, timeouts and explicit one-time tickets. Browser plugin not available;
regular Playwright checked real login and repeat navigation, desktop/mobile
rendering, image/video switching, no runtime errors, and visible retry on a
simulated backend failure. No paid generations were submitted for this change.

Deployment is ingress-only v1.0.74; main API remains v1.0.69 and unified runtime
remains v1.0.72. No new containers, restarts, or removed containers. Original
image/video services still serve prior task/media/project routes. Rollback removes
only the added entry/static locations and `unified_asset_cache` map, followed by
nginx validation and graceful reload; the private snapshot is
`/root/fanapi-migration/unified-entry-before-v1074.conf`. Preserve later unrelated
configuration edits when rolling back.

## Workspace navigation and random-image viewer

After `prepare.mjs` and `prepare-integration.mjs`, run
`node integrations/flyreq/prepare-workspace-ux.mjs UPSTREAM_ROOT` before the
frontend build. This count-checked patch portals the image viewer outside the
desktop-hidden header, adds a dashboard link to desktop/mobile navigation, and
gives unavailable external image sources a bounded loading/error state.

`entry.html` replaces the plain resume interstitial with the workspace skeleton.
`entry.js` installs the authenticated same-origin workspace document directly,
avoiding the separate session probe and subsequent document navigation. The
gateway account marker must match the current account before installation;
stale profiles and changed accounts still require handoff. Authenticated HTML
is never stored in browser storage. External image failures are not bypassed.

Use `deploy-workspace-ux.py RELEASE_DIRECTORY COMMIT TAG` with the built `out/`
and matching entry sources. It retains old immutable chunks, builds a clean
recovery image, and atomically exchanges the live static directory without
restarting the gateway or tenant task processes. It does not replace a container.
The release manifest records every static-file hash and the source commit/tag.
See `docs/studio-workspace-ux-20261104.md` for verification and rollback.
