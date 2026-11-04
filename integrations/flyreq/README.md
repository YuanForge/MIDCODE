# MIDCODE unified studio — branding candidate

This directory reproducibly prepares a MIDCODE-branded evaluation build of
[FlyReq Image Studio](https://github.com/doudou770/flyreq-image-studio), pinned to
`bcec8c8992b407997a5f872bcb7fa1436d7505cd` (upstream package version 1.5.1).

## Reproduce

Clone the upstream into a separate directory, check out the pinned commit, and run
`npm ci` in its `frontend` directory. From this repository run:

```powershell
node integrations/flyreq/prepare.mjs C:/path/to/flyreq integrations/flyreq/branding.env.example
```

Then run `npm run build` in the upstream `frontend` directory. The preparer uses
the MIDCODE M logo in this directory and `sharp` from the upstream dependency
lock. Environment variables override the example configuration. Apply to a fresh
checkout once, not to a previously prepared checkout. No API keys are included.

Changed surfaces: frontend and backend fallback names, model/provider labels,
API defaults, Chinese and English copy, document titles, PWA manifest/icons,
key guidance, and source link. Internal API paths and storage keys retain upstream
names to preserve compatibility. Original LICENSE, README, attribution links and
copyright notices are retained. The settings page links both the modifications
here and the original source; the license is also copied to `/LICENSE.txt`.

## Release boundary

This is a branding candidate, **not a production migration**. Do not expose the
upstream backend as the public MIDCODE studio without the following integration:

- Redeem existing MIDCODE one-time handoff server-side; do not put API keys in URLs.
- Authenticate task creation, polling, cancellation, media and WebSocket access;
  bind all records to MIDCODE user IDs and test cross-user denial.
- Route approved image/video models through MIDCODE billing and request logs.
- Archive media to the existing private SeaweedFS S3 bucket and serve stable URLs.
- Preserve old image histories and video projects; this UI does not import them.
- Verify real generation, polling, download, isolation and graceful production cutover.

Upstream uses AGPL-3.0. Retain its license and notices and provide users with the
corresponding modified source when serving a modified deployment. The pinned
source plus this versioned preparer records how the candidate was produced.

Production proxies, business containers, data, and credentials are not changed by
the preparer. Rolling back this candidate means discarding the separate build;
there is no production rollback operation.

## v1.0.71 candidate verification (2026-11-04)

- Production frontend build and TypeScript checks passed on Node 24.15.0.
- Local backend bound only to `127.0.0.1:3097`; config returned MIDCODE names
  and `https://midcode.cc` defaults without credentials.
- Playwright/Chrome checked widths 1440 and 390, light/dark, and zh/en (8 cases).
  No page errors or horizontal overflow; image/video switches generated no
  document navigations. Empty-state local switches measured 53–199 ms.
- Browser plugin not available; regular Playwright was used. Screenshots were
  visually inspected for desktop light and mobile dark layouts.
- Real image/video generation, billing, S3, account isolation and old-project
  import are not verified by this branding release.
- Deployment: local preview only. No production container created/replaced,
  no proxy changes, and no old-container deletion required. Production remains
  on its existing release. The `v1.0.71` tag identifies this candidate's recipe,
  not a new production main/API version.
